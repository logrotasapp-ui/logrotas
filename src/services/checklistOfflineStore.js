import {
  idbGetChecklist,
  idbPutChecklist,
  idbGetAllByUid,
  idbGetByFreteId,
} from "./checklistIndexedDb.js";

export function buildChecklistSyncMeta(state = "local_only") {
  const now = new Date().toISOString();
  return {
    state,
    createdAt: now,
    lastLocalSaveAt: now,
    lastRemoteSyncAt: null,
    pendingMediaCount: 0,
    pendingOpsCount: 0,
  };
}

export async function saveChecklistLocal(record) {
  if (!record?.id) throw new Error("Checklist sem id");
  await idbPutChecklist(record);
  return record;
}

export async function getChecklistLocal(id) {
  if (!id) return null;
  const row = await idbGetChecklist(id);
  return row || null;
}

export async function getChecklistLocalByFreteId(uid, freteId) {
  return idbGetByFreteId(uid, freteId);
}

export async function listChecklistsLocal(uid, predicate = () => true) {
  if (!uid) return [];
  const all = await idbGetAllByUid(uid);
  return all.filter(predicate);
}

export function stripChecklistStorageMeta(record) {
  if (!record) return record;
  const { uid, ...rest } = record;
  return rest;
}

function assinaturaPendenteSync(assin) {
  return !!assin?.imagemMediaId && !assin?.imagemUrl?.trim();
}

/** Conta mídias gravadas localmente (mediaId) ainda sem URL no Storage. */
export function countPendingChecklistMedia(checklist) {
  if (!checklist) return 0;
  let count = 0;
  const coletaFotos = checklist.coleta?.fotos || [];
  const entregaFotos = checklist.entrega?.fotos || [];
  coletaFotos.forEach((f) => {
    if (f?.mediaId && !f?.url) count += 1;
  });
  entregaFotos.forEach((f) => {
    if (f?.mediaId && !f?.url) count += 1;
  });
  const coletaAssin = checklist.coleta?.assinaturas || {};
  ["responsavel", "prestador"].forEach((k) => {
    if (assinaturaPendenteSync(coletaAssin[k])) count += 1;
  });
  const entregaAssin = checklist.entrega?.assinaturas || {};
  ["recebedor", "prestador"].forEach((k) => {
    if (assinaturaPendenteSync(entregaAssin[k])) count += 1;
  });
  return count;
}

export function applyPendingMediaSyncMeta(checklist) {
  const pending = countPendingChecklistMedia(checklist);
  return {
    ...checklist,
    _sync: {
      ...(checklist._sync || buildChecklistSyncMeta("local_only")),
      pendingMediaCount: pending,
      lastLocalSaveAt: new Date().toISOString(),
    },
    atualizadoEm: new Date().toISOString(),
  };
}
