import { readOfflineCache, writeOfflineCache, OFFLINE_KEYS } from "./offlineStorage.js";

/** Etapa inicial ao abrir/retomar checklist (1–6). */
export function etapaInicialParaChecklist(checklist, etapaSalva) {
  if (etapaSalva >= 1 && etapaSalva <= 6) return etapaSalva;
  if (checklist?.status === "concluido") return 6;
  if (checklist?.status === "aguardando_entrega") return 5;
  return 1;
}

/**
 * @param {{
 *   checklistId: string,
 *   avulso?: boolean,
 *   freteId?: string|null,
 *   etapa?: number,
 * }} session
 */
export function writeChecklistSession(session) {
  if (!session?.checklistId) return;
  writeOfflineCache(OFFLINE_KEYS.checklistSessao, {
    checklistId: session.checklistId,
    avulso: !!session.avulso,
    freteId: session.freteId || null,
    etapa: session.etapa >= 1 && session.etapa <= 6 ? session.etapa : 1,
    updatedAt: Date.now(),
  });
}

export function readChecklistSession() {
  const raw = readOfflineCache(OFFLINE_KEYS.checklistSessao);
  if (!raw?.checklistId) return null;
  return raw;
}

export function clearChecklistSession() {
  try {
    localStorage.removeItem(OFFLINE_KEYS.checklistSessao);
  } catch {
    /* quota / modo privado */
  }
}
