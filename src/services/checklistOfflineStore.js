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
