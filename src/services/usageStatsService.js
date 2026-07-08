import { doc, updateDoc, serverTimestamp, increment } from "firebase/firestore";
import { db } from "../firebase.js";

/** Campos agregados em users/{uid} — 1 escrita por ação (increment). */
export const USAGE_COUNTERS = {
  rotasOtimizadas: "rotasOtimizadas",
  calculosViagem: "calculosViagem",
  fechamentos: "fechamentos",
  fretes: "fretes",
  checklistsAvulsos: "checklistsAvulsos",
  checklistsFrete: "checklistsFrete",
  manutencoes: "manutencoes",
  despesas: "despesas",
  documentos: "documentos",
};

/**
 * Soma +1 no contador do usuário. Falha silenciosa (offline / rede).
 * @param {string} uid
 * @param {string} field — chave de USAGE_COUNTERS
 */
export async function incrementUsageCounter(uid, field) {
  if (!uid || !field) return;
  try {
    await updateDoc(doc(db, "users", uid), {
      [field]: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch {
    /* offline ou doc inexistente — não bloqueia o fluxo */
  }
}

/** Atualiza último acesso ao abrir o app (usuário logado). */
export async function touchUltimoAcesso(uid) {
  if (!uid) return;
  try {
    await updateDoc(doc(db, "users", uid), {
      ultimoAcesso: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch {
    /* offline */
  }
}
