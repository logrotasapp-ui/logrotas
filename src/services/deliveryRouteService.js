import {
  collection,
  doc,
  getDocs,
  addDoc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase.js";

export const ENTREGAS_COLLECTION = "entregas";

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
  const paradas = data.paradas || [];
  return {
    id,
    ...data,
    totalParadas: data.totalParadas ?? paradas.length,
    entregues:
      data.entregues ?? paradas.filter((p) => p.status === "entregue").length,
    naoEntregues:
      data.naoEntregues ?? paradas.filter((p) => p.status === "nao_entregue").length,
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
    return String(b?.id || "").localeCompare(String(a?.id || ""));
  });
}

/**
 * @param {string} uid
 * @returns {Promise<Array<object>>}
 */
export async function loadDeliveryRoutes(uid, max = 50) {
  if (!uid) return [];
  const snap = await getDocs(colRef(uid));
  return sortRoutesDesc(
    snap.docs.map((d) => normalizeRouteDoc(d.id, d.data()))
  ).slice(0, max);
}

/**
 * @param {string} uid
 * @param {string} routeId
 */
export async function loadDeliveryRouteDetail(uid, routeId) {
  if (!uid || !routeId) return null;
  const ref = doc(db, "users", uid, ENTREGAS_COLLECTION, routeId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return normalizeRouteDoc(snap.id, snap.data());
}

/**
 * Salva rota finalizada no Firestore.
 * @param {string} uid
 * @param {{
 *   date: string,
 *   paradas: Array<{ endereco: string, status: string, motivo?: string, horario?: string, data?: string, coords?: number[] }>,
 *   totalParadas?: number,
 *   entregues?: number,
 *   naoEntregues?: number,
 *   resultado?: object
 * }} routeData
 */
export async function saveDeliveryRoute(uid, routeData) {
  if (!uid) throw new Error("Usuário não autenticado.");

  const paradas = routeData.paradas || [];
  const entregues = paradas.filter((p) => p.status === "entregue").length;
  const naoEntregues = paradas.filter((p) => p.status === "nao_entregue").length;

  const payload = {
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
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const ref = await addDoc(colRef(uid), payload);
  return {
    id: ref.id,
    ...payload,
    createdAt: null,
    updatedAt: null,
  };
}
