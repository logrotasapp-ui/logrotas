import {
  collection,
  doc,
  getDocs,
  addDoc,
  getDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase.js";
import { readOfflineCache, writeOfflineCache } from "./offlineStorage.js";
import {
  countPacotesStats,
  sanitizeParadaForFirestore,
} from "./pacotesService.js";

export const ENTREGAS_COLLECTION = "entregas";

/** FREE: 1 rota; PAGO (trial/vitalício/assinatura): 5 rotas. */
export function maxSavedDeliveryRoutes(isPago) {
  return isPago ? 5 : 1;
}

function localRoutesKey(uid) {
  return `logrotas_entregas_${uid}`;
}

function readLocalRoutes(uid) {
  if (!uid) return [];
  const raw = readOfflineCache(localRoutesKey(uid));
  return Array.isArray(raw?.routes) ? raw.routes : [];
}

function writeLocalRoutes(uid, routes) {
  if (!uid) return;
  writeOfflineCache(localRoutesKey(uid), { routes: routes.slice(0, 100) });
}

export function appendLocalDeliveryRoute(uid, route) {
  if (!uid || !route?.id) return;
  const routes = readLocalRoutes(uid).filter((r) => r.id !== route.id);
  writeLocalRoutes(uid, [route, ...routes]);
}

export function removeLocalDeliveryRoute(uid, routeId) {
  if (!uid || !routeId) return;
  writeLocalRoutes(
    uid,
    readLocalRoutes(uid).filter((r) => r.id !== routeId)
  );
}

/**
 * Remove rota do Firestore e do cache local.
 * @param {string} uid
 * @param {string} routeId
 */
export async function deleteDeliveryRoute(uid, routeId) {
  if (!uid || !routeId) throw new Error("Registro inválido.");

  removeLocalDeliveryRoute(uid, routeId);

  if (String(routeId).startsWith("local_")) return;

  await deleteDoc(doc(db, "users", uid, ENTREGAS_COLLECTION, routeId));
}

function sanitizeResultado(resultado) {
  if (!resultado) return null;
  return {
    kmOriginal: resultado.kmOriginal ?? null,
    kmOtimizado: resultado.kmOtimizado ?? null,
    economiaKm: resultado.economiaKm ?? null,
    economiaCusto: resultado.economiaCusto ?? null,
    tempoEstimado: resultado.tempoEstimado ?? null,
    custoTotal: resultado.custoTotal ?? null,
  };
}

function normalizeRouteDoc(id, data) {
  const paradas = (data?.paradas || []).map((p) => sanitizeParadaForFirestore(p));
  const pkgStats = countPacotesStats(paradas);
  return {
    id,
    ...data,
    paradas,
    totalParadas: data?.totalParadas ?? paradas.length,
    entregues: data?.entregues ?? pkgStats.entregues,
    naoEntregues: data?.naoEntregues ?? pkgStats.naoEntregues,
  };
}

function buildPayload(routeData) {
  const paradas = (routeData.paradas || []).map(sanitizeParadaForFirestore);
  const pkgStats = countPacotesStats(paradas);
  const entregues = pkgStats.entregues;
  const naoEntregues = pkgStats.naoEntregues;

  return {
    date: routeData.date || paradas[0]?.data || "",
    hora: routeData.hora || paradas[0]?.horario || "",
    motorista: routeData.motorista || "",
    totalParadas: paradas.length,
    entregues,
    naoEntregues,
    totalPacotes: pkgStats.entregues + pkgStats.naoEntregues + pkgStats.pendentes,
    paradas,
    resultado: sanitizeResultado(routeData.resultado),
  };
}

function colRef(uid) {
  return collection(db, "users", uid, ENTREGAS_COLLECTION);
}

function createdAtMs(value) {
  if (value == null) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isNaN(t) ? 0 : t;
  }
  return 0;
}

function sortRoutesByCreatedAtDesc(items) {
  return [...items].sort((a, b) => {
    const diff = createdAtMs(b?.createdAt) - createdAtMs(a?.createdAt);
    if (diff !== 0) return diff;
    return String(b?.id || "").localeCompare(String(a?.id || ""));
  });
}

function sortRoutesDesc(items) {
  return [...items].sort((a, b) => {
    const da = a?.date || "";
    const db_ = b?.date || "";
    if (da && db_ && da !== db_) {
      const pa = da.split("/").reverse().join("");
      const pb = db_.split("/").reverse().join("");
      return pb.localeCompare(pa);
    }
    const ha = a?.hora || "";
    const hb = b?.hora || "";
    if (ha && hb && ha !== hb) return hb.localeCompare(ha);
    return String(b?.id || "").localeCompare(String(a?.id || ""));
  });
}

/**
 * Mantém no máximo `maxRoutes` no cache local (mais recentes por createdAt).
 * A rota `preferId` (recém-salva) tem prioridade e sempre permanece se existir.
 */
function enforceLocalRouteLimit(uid, maxRoutes, preferId) {
  if (!uid || maxRoutes < 1) return;
  let routes = readLocalRoutes(uid);
  if (routes.length <= maxRoutes) return;

  routes = sortRoutesByCreatedAtDesc(routes);
  if (preferId) {
    const preferred = routes.find((r) => r.id === preferId);
    if (preferred) {
      routes = [preferred, ...routes.filter((r) => r.id !== preferId)];
    }
  }
  writeLocalRoutes(uid, routes.slice(0, maxRoutes));
}

/**
 * Após salvar: remove do Firestore (e do cache via deleteDeliveryRoute)
 * as rotas mais antigas que excederem o limite do plano.
 */
async function pruneExcessDeliveryRoutes(uid, maxRoutes) {
  const snap = await getDocs(query(colRef(uid), orderBy("createdAt", "desc")));
  const excess = snap.docs.slice(maxRoutes);
  for (const d of excess) {
    await deleteDeliveryRoute(uid, d.id);
  }
}

function mergeRoutes(remote, local) {
  const byId = new Map();
  for (const r of remote) byId.set(r.id, r);
  for (const r of local) {
    if (!byId.has(r.id)) byId.set(r.id, r);
  }
  return sortRoutesDesc([...byId.values()]);
}

/**
 * @param {string} uid
 * @returns {Promise<Array<object>>}
 */
export async function loadDeliveryRoutes(uid, max = 50) {
  if (!uid) return [];
  const local = readLocalRoutes(uid);

  try {
    const snap = await getDocs(query(colRef(uid), orderBy("createdAt", "desc")));
    const remote = snap.docs.map((d) => normalizeRouteDoc(d.id, d.data()));
    const merged = mergeRoutes(remote, local);
    writeLocalRoutes(uid, merged.slice(0, 100));
    return merged.slice(0, max);
  } catch {
    return sortRoutesDesc(local).slice(0, max);
  }
}

/**
 * @param {string} uid
 * @param {string} routeId
 */
export async function loadDeliveryRouteDetail(uid, routeId) {
  if (!uid || !routeId) return null;

  const local = readLocalRoutes(uid).find((r) => r.id === routeId);
  if (local?.paradas?.length) return normalizeRouteDoc(local.id, local);

  try {
    const ref = doc(db, "users", uid, ENTREGAS_COLLECTION, routeId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return local ? normalizeRouteDoc(local.id, local) : null;
    return normalizeRouteDoc(snap.id, snap.data());
  } catch {
    return local ? normalizeRouteDoc(local.id, local) : null;
  }
}

/**
 * Salva rota finalizada no Firestore (+ cache local sempre).
 * Aplica limite por plano: FREE=1, PAGO=5 (apaga as mais antigas por createdAt).
 * @param {string} uid
 * @param {object} routeData
 * @param {boolean} [isPago=false]
 * @returns {Promise<object & { synced?: boolean, saveWarning?: string }>}
 */
export async function saveDeliveryRoute(uid, routeData, isPago = false) {
  if (!uid) throw new Error("Usuário não autenticado.");

  const payload = buildPayload(routeData);
  const maxRoutes = maxSavedDeliveryRoutes(!!isPago);

  try {
    const ref = await addDoc(colRef(uid), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const saved = { id: ref.id, ...payload, synced: true };
    appendLocalDeliveryRoute(uid, saved);
    await pruneExcessDeliveryRoutes(uid, maxRoutes);
    enforceLocalRouteLimit(uid, maxRoutes, saved.id);
    return saved;
  } catch (err) {
    const localId = `local_${Date.now()}`;
    const saved = {
      id: localId,
      ...payload,
      createdAt: Date.now(),
      synced: false,
      saveWarning: err?.message || "Erro ao sincronizar com a nuvem.",
    };
    appendLocalDeliveryRoute(uid, saved);
    enforceLocalRouteLimit(uid, maxRoutes, saved.id);
    return saved;
  }
}
