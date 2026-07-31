/**
 * Diagnóstico LOCAL — lista TODOS os docs de users/{uid}/manutencao (sem filtro).
 * NÃO apaga nada. NÃO entra no bundle do app.
 *
 * Autenticação: MESMO padrão das Cloud Functions (functions/index.js L19):
 *   admin.initializeApp() → Application Default Credentials (ADC).
 *
 * Em produção nas Functions o ADC vem do runtime Google.
 * Localmente você precisa da service account do projeto:
 *   Firebase Console → Project settings → Service accounts → Generate new private key
 *   Depois (PowerShell):
 *     $env:GOOGLE_APPLICATION_CREDENTIALS="C:\caminho\para\logrotas-sa.json"
 *     node scripts/listar-manutencoes.js seu@email.com
 *
 * Uso:
 *   node scripts/listar-manutencoes.js seu@email.com
 *   node scripts/listar-manutencoes.js --uid=ABC123
 *
 * Ou cole o e-mail abaixo e rode sem argumento:
 *   node scripts/listar-manutencoes.js
 */

"use strict";

const path = require("path");
const fs = require("fs");

// ── Cole o e-mail aqui se preferir não passar na linha de comando ─────────────
const EMAIL_PADRAO = "";
// ─────────────────────────────────────────────────────────────────────────────

const root = path.join(__dirname, "..");
const adminPath = path.join(root, "functions", "node_modules", "firebase-admin");

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

function readProjectId() {
  const fromEnv = process.env.VITE_FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
  if (fromEnv) return fromEnv;
  const rcPath = path.join(root, ".firebaserc");
  if (fs.existsSync(rcPath)) {
    try {
      const rc = JSON.parse(fs.readFileSync(rcPath, "utf8"));
      return rc?.projects?.default || null;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function isDateValid(date) {
  if (date == null) return false;
  const s = String(date).trim();
  if (!s) return false;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!m) return false;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const y = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return false;
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

function fmt(v) {
  if (v === undefined) return "(undefined)";
  if (v === null) return "(null)";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

async function main() {
  loadEnv();

  const arg = (process.argv[2] || "").trim();
  const uidArg = arg.startsWith("--uid=")?arg.slice("--uid=".length).trim():"";
  const email = uidArg ? "" : (arg || EMAIL_PADRAO || "").trim();
  if (!email && !uidArg) {
    console.error(
      "Informe o e-mail ou UID:\n  node scripts/listar-manutencoes.js seu@email.com\n  node scripts/listar-manutencoes.js --uid=SEU_UID\nou cole em EMAIL_PADRAO no topo do script."
    );
    process.exit(1);
  }

  if (!fs.existsSync(adminPath)) {
    console.error(
      "firebase-admin não encontrado em functions/node_modules.\nRode: cd functions && npm install"
    );
    process.exit(1);
  }

  const admin = require(adminPath);
  const projectId = readProjectId();

  // Mesmo padrão de functions/index.js — ADC via initializeApp()
  if (!admin.apps.length) {
    const opts = {};
    if (projectId) opts.projectId = projectId;
    admin.initializeApp(opts);
  }

  console.log(`Projeto: ${projectId || "(default ADC)"}`);
  if (email) console.log(`E-mail:  ${email}`);
  if (uidArg) console.log(`UID arg: ${uidArg}`);
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log(`ADC:     GOOGLE_APPLICATION_CREDENTIALS=${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
  } else {
    console.log("ADC:     GOOGLE_APPLICATION_CREDENTIALS não definido (usando Application Default Credentials do ambiente)");
  }
  console.log("");

  let uid = uidArg;
  if (!uid) {
    let user;
    try {
      user = await admin.auth().getUserByEmail(email);
    } catch (err) {
      console.error("Falha em getUserByEmail:", err?.code || err?.message || err);
      if (
        String(err?.code || "").includes("invalid-credential") ||
        String(err?.message || "").includes("Could not load the default credentials") ||
        String(err?.message || "").includes("Unable to detect a Project Id")
      ) {
        console.error(
          "\nCredencial Admin ausente. Defina GOOGLE_APPLICATION_CREDENTIALS com o JSON da service account\ndo projeto LogRotas (mesmo ADC que o Admin SDK usa nas Cloud Functions)."
        );
      }
      process.exit(1);
    }
    uid = user.uid;
    console.log(`UID:     ${uid}`);
    console.log(`Nome:    ${user.displayName || "—"}`);
  } else {
    console.log(`UID:     ${uid}`);
  }
  console.log("");
  console.log(`Lendo users/${uid}/manutencao (sem filtro)...\n`);

  const snap = await admin.firestore().collection("users").doc(uid).collection("manutencao").get();

  if (snap.empty) {
    console.log("Nenhum documento encontrado.");
    return;
  }

  const docs = snap.docs.slice().sort((a, b) => {
    const da = a.data()?.date || "";
    const db_ = b.data()?.date || "";
    return String(db_).localeCompare(String(da));
  });

  let semData = 0;
  docs.forEach((d, i) => {
    const data = d.data() || {};
    const dateOk = isDateValid(data.date);
    if (!dateOk) semData += 1;

    console.log("─".repeat(60));
    console.log(`#${i + 1}  id: ${d.id}${dateOk ? "" : "  ⚠️ SEM DATA VALIDA"}`);
    console.log(`  type:     ${fmt(data.type)}`);
    console.log(`  types:    ${fmt(data.types)}`);
    console.log(`  date:     ${fmt(data.date)}${dateOk ? "" : "  ⚠️"}`);
    console.log(`  km:       ${fmt(data.km)}`);
    console.log(`  nextKm:   ${fmt(data.nextKm)}`);
    console.log(`  cost:     ${fmt(data.cost)}`);
    console.log(`  vehicle:  ${fmt(data.vehicle)}`);
    if (data.nextKmPorTipo != null) {
      console.log(`  nextKmPorTipo: ${fmt(data.nextKmPorTipo)}`);
    }
    if (data.status != null) {
      console.log(`  status:   ${fmt(data.status)}`);
    }
  });

  console.log("─".repeat(60));
  console.log(`\nTotal: ${docs.length} documento(s).`);
  console.log(`Com data inválida/ausente: ${semData}`);
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
