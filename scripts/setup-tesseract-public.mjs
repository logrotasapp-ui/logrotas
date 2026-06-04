/**
 * Garante arquivos Tesseract em public/tesseract (cópia local + download se faltar).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import https from "https";
import http from "http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outRoot = path.join(root, "public", "tesseract");
const outCore = path.join(outRoot, "core");
const outLang = path.join(outRoot, "lang", "por", "4.0.0_best_int");
const nm = path.join(root, "node_modules");

const LANG_URL =
  "https://cdn.jsdelivr.net/npm/@tesseract.js-data@1.0.0/por/4.0.0_best_int/por.traineddata.gz";

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const file = fs.createWriteStream(dest);
    const get = url.startsWith("https") ? https.get : http.get;
    get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        return download(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        reject(new Error(`Download falhou (${res.statusCode}): ${url}`));
        return;
      }
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    }).on("error", reject);
  });
}

function mustExist(p, hint) {
  if (!fs.existsSync(p)) {
    console.error(`[setup:tesseract] Não encontrado: ${p}`);
    if (hint) console.error(hint);
    process.exit(1);
  }
}

console.log("[setup:tesseract] Preparando arquivos em public/tesseract/ …");

const workerSrc = path.join(nm, "tesseract.js", "dist", "worker.min.js");
mustExist(workerSrc, "Execute: npm install");
copyFile(workerSrc, path.join(outRoot, "worker.min.js"));

const coreDir = path.join(nm, "tesseract.js-core");
mustExist(coreDir);
fs.mkdirSync(outCore, { recursive: true });
for (const f of fs.readdirSync(coreDir)) {
  if (f === "index.js" || f === "LICENSE" || f === "README.md") continue;
  if (f.endsWith(".js") || f.endsWith(".wasm")) {
    copyFile(path.join(coreDir, f), path.join(outCore, f));
  }
}

const langDest = path.join(outLang, "por.traineddata.gz");
const langCandidates = [
  path.join(nm, "@tesseract.js-data", "por", "4.0.0_best_int", "por.traineddata.gz"),
  path.join(nm, "@tesseract.js-data", "por", "4.0.0", "por.traineddata.gz"),
  langDest,
];

let langSrc = langCandidates.find((p) => fs.existsSync(p) && p !== langDest);
if (langSrc) {
  copyFile(langSrc, langDest);
  console.log("[setup:tesseract] Idioma copiado de node_modules");
} else if (!fs.existsSync(langDest)) {
  console.log("[setup:tesseract] Baixando idioma português (por) …");
  await download(LANG_URL, langDest);
  console.log("[setup:tesseract] Download do idioma concluído");
} else {
  console.log("[setup:tesseract] Idioma já presente em public/");
}

console.log("[setup:tesseract] OK — pronto para uso");
