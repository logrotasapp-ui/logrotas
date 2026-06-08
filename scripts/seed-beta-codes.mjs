/**
 * Cria 15 códigos beta em Firestore (betaCodes/BETA-LR-001 … BETA-LR-015).
 * Requer .env com VITE_FIREBASE_* e regras que permitam escrita (admin ou regras temporárias).
 *
 *   npm run seed:beta-codes
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnv() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

if (!firebaseConfig.projectId) {
  console.error("Defina VITE_FIREBASE_* no .env antes de executar o seed.");
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const codes = Array.from({ length: 15 }, (_, i) => {
  const n = String(i + 1).padStart(3, "0");
  return `BETA-LR-${n}`;
});

for (const code of codes) {
  await setDoc(doc(db, "betaCodes", code), {
    code,
    used: false,
    usedBy: null,
    usedAt: null,
  });
  console.log(`OK: betaCodes/${code}`);
}

console.log(`\n${codes.length} códigos beta criados.`);
