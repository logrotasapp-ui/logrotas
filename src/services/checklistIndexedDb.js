const DB_NAME = "logrotas_checklist_v1";
const DB_VERSION = 2;
const STORE = "checklists";
const STORE_MEDIA = "media";

let dbPromise = null;

function requestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function openChecklistDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponível"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("byUid", "uid", { unique: false });
        store.createIndex("byFreteId", "freteId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_MEDIA)) {
        const media = db.createObjectStore(STORE_MEDIA, { keyPath: "mediaId" });
        media.createIndex("byChecklistId", "checklistId", { unique: false });
      }
    };
  });
  return dbPromise;
}

export async function idbGetChecklist(id) {
  const db = await openChecklistDb();
  return requestToPromise(db.transaction(STORE, "readonly").objectStore(STORE).get(id));
}

export async function idbPutChecklist(record) {
  const db = await openChecklistDb();
  return requestToPromise(db.transaction(STORE, "readwrite").objectStore(STORE).put(record));
}

export async function idbGetAllByUid(uid) {
  const db = await openChecklistDb();
  const idx = db.transaction(STORE, "readonly").objectStore(STORE).index("byUid");
  return requestToPromise(idx.getAll(uid));
}

export async function idbGetByFreteId(uid, freteId) {
  if (!uid || !freteId) return null;
  const all = await idbGetAllByUid(uid);
  return all.find((c) => c.freteId === freteId) || null;
}

export async function idbPutMedia(record) {
  const db = await openChecklistDb();
  return requestToPromise(
    db.transaction(STORE_MEDIA, "readwrite").objectStore(STORE_MEDIA).put(record)
  );
}

export async function idbGetMedia(mediaId) {
  const db = await openChecklistDb();
  return requestToPromise(
    db.transaction(STORE_MEDIA, "readonly").objectStore(STORE_MEDIA).get(mediaId)
  );
}

export async function idbDeleteMedia(mediaId) {
  const db = await openChecklistDb();
  return requestToPromise(
    db.transaction(STORE_MEDIA, "readwrite").objectStore(STORE_MEDIA).delete(mediaId)
  );
}

export async function idbListMediaByChecklistId(checklistId) {
  const db = await openChecklistDb();
  const idx = db.transaction(STORE_MEDIA, "readonly").objectStore(STORE_MEDIA).index("byChecklistId");
  return requestToPromise(idx.getAll(checklistId));
}
