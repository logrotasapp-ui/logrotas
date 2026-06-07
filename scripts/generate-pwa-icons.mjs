/**
 * Gera icon-192.png e icon-512.png a partir do LOGO_B64 em logrotas-v145.jsx
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const jsxPath = join(root, "logrotas-v145.jsx");
const publicDir = join(root, "public");

const jsx = readFileSync(jsxPath, "utf8");
const match = jsx.match(/const LOGO_B64="(data:image\/[^"]+)"/);
if (!match) {
  console.error("LOGO_B64 não encontrado em logrotas-v145.jsx");
  process.exit(1);
}

const [, dataUrl] = match;
const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
const input = Buffer.from(base64, "base64");

async function writeIcon(size, filename) {
  const out = join(publicDir, filename);
  await sharp(input)
    .resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toFile(out);
  console.log(`Gerado: public/${filename} (${size}x${size})`);
}

await writeIcon(192, "icon-192.png");
await writeIcon(512, "icon-512.png");
