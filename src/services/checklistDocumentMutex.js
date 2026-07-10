/** Mutex por checklistId — serializa save local e fila UPLOAD_MEDIA no mesmo documento. */
const locks = new Map();

export function withChecklistDocumentLock(checklistId, fn) {
  if (!checklistId) return fn();

  const prev = locks.get(checklistId) || Promise.resolve();
  const next = prev
    .then(() => fn())
    .finally(() => {
      if (locks.get(checklistId) === next) locks.delete(checklistId);
    });

  locks.set(checklistId, next);
  return next;
}
