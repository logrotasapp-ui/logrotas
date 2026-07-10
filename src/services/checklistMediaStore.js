import { idbPutMedia, idbGetMedia, idbDeleteMedia, idbListMediaByChecklistId } from "./checklistIndexedDb.js";

/** Gera mediaId estável por checklist + contexto + slot + timestamp. */
export function buildChecklistMediaId(checklistId, contexto, slot, ts = Date.now()) {
  const safeSlot = String(slot || "media").replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${checklistId}:${contexto}:${safeSlot}:${ts}`;
}

/** Path Firebase Storage (fixo na criação — usado na Fase 2c). */
export function buildChecklistStoragePath(uid, checklistId, contexto, nomeArquivo) {
  const safeName = String(nomeArquivo || "media").replace(/[^a-zA-Z0-9_-]/g, "_");
  if (contexto === "entrega") {
    return `users/${uid}/checklists/${checklistId}/entrega/${safeName}.jpg`;
  }
  return `users/${uid}/checklists/${checklistId}/${safeName}.jpg`;
}

/**
 * @param {{
 *   mediaId: string,
 *   checklistId: string,
 *   uid: string,
 *   contexto: "coleta" | "entrega",
 *   tipo: "foto" | "assinatura",
 *   slot: string,
 *   storagePath: string,
 *   blob: Blob,
 * }} record
 */
export async function putChecklistMedia(record) {
  if (!record?.mediaId || !record?.blob) {
    throw new Error("mediaId e blob são obrigatórios");
  }
  await idbPutMedia({
    ...record,
    criadoEm: new Date().toISOString(),
  });
  return record.mediaId;
}

export async function getChecklistMediaBlob(mediaId) {
  if (!mediaId) return null;
  const row = await idbGetMedia(mediaId);
  return row?.blob || null;
}

export async function hasChecklistMediaBlob(mediaId) {
  const blob = await getChecklistMediaBlob(mediaId);
  return !!blob;
}

export async function deleteChecklistMedia(mediaId) {
  if (!mediaId) return;
  await idbDeleteMedia(mediaId);
}

export async function listChecklistMedia(checklistId) {
  if (!checklistId) return [];
  return idbListMediaByChecklistId(checklistId);
}
