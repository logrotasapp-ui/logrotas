import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  terminate,
  clearIndexedDbPersistence,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

const {
  VITE_FIREBASE_API_KEY: apiKey,
  VITE_FIREBASE_AUTH_DOMAIN: authDomain,
  VITE_FIREBASE_PROJECT_ID: projectId,
  VITE_FIREBASE_STORAGE_BUCKET: storageBucket,
  VITE_FIREBASE_MESSAGING_SENDER_ID: messagingSenderId,
  VITE_FIREBASE_APP_ID: appId,
  VITE_FIREBASE_MEASUREMENT_ID: measurementId,
} = import.meta.env;

const app = initializeApp({
  apiKey,
  authDomain,
  projectId,
  storageBucket,
  messagingSenderId,
  appId,
  measurementId,
});

export const auth = getAuth(app);
// V381 — cópia local dos dados no celular: telas abrem na hora e só o que mudou é baixado.
// Sem IndexedDB (modo privado etc.), o SDK cai sozinho para cache em memória.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

/** V381 — apaga a cópia local (usado ao sair da conta). Depois disso, recarregar a página. */
export async function clearFirestoreLocalCache() {
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch {
    /* outra aba aberta ou IndexedDB indisponível: ignora */
  }
}
export const storage = getStorage(app);
// V383 — Cloud Functions (mesma região das functions do projeto)
export const functions = getFunctions(app, "southamerica-east1");
