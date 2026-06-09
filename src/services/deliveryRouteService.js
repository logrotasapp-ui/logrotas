import {
  collection,
  doc,
  getDocs,
  addDoc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase.js";
import { readOfflineCache, writeOfflineCache } from "./offlineStorage.js";

export const ENTREGAS_COLLECTION = "entregas";

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
  const paradas = data?.paradas || [];
  return {
    id,
    ...data,
    totalParadas: data?.totalParadas ?? paradas.length,
    entregues:
      data?.entregues ?? paradas.filter((p) => p.status === "entregue").length,
    naoEntregues:
      data?.naoEntregues ??
      paradas.filter((p) => p.status === "nao_entregue").length,
  };
}

function buildPayload(routeData) {
  const paradas = routeData.paradas || [];
  const entregues = paradas.filter((p) => p.status === "entregue").length;
  const naoEntregues = paradas.filter((p) => p.status === "nao_entregue").length;

  return {
    date: routeData.date || paradas[0]?.data || "",
    hora: routeData.hora || paradas[0]?.horario || "",
    motorista: routeData.motorista || "",
    totalParadas: paradas.length,
    entregues,
    naoEntregues,
    paradas: paradas.map((p) => ({
      endereco: p.endereco || "",
      status: p.status || "pendente",
      motivo: p.motivo || null,
      horario: p.horario || "",
      data: p.data || routeData.date || "",
      coords: Array.isArray(p.coords) && p.coords.length >= 2 ? p.coords : null,
    })),
    resultado: sanitizeResultado(routeData.resultado),
  };
}

function colRef(uid) {
  return collection(db, "users", uid, ENTREGAS_COLLECTION);
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
    const snap = await getDocs(colRef(uid));
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
 * @returns {Promise<object & { synced?: boolean, saveWarning?: string }>}
 */
export async function saveDeliveryRoute(uid, routeData) {
  if (!uid) throw new Error("Usuário não autenticado.");

  const payload = buildPayload(routeData);

  try {
    const ref = await addDoc(colRef(uid), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const saved = { id: ref.id, ...payload, synced: true };
    appendLocalDeliveryRoute(uid, saved);
    return saved;
  } catch (err) {
    const localId = `local_${Date.now()}`;
    const saved = {
      id: localId,
      ...payload,
      synced: false,
      saveWarning: err?.message || "Erro ao sincronizar com a nuvem.",
    };
    appendLocalDeliveryRoute(uid, saved);
    return saved;
  }
}
