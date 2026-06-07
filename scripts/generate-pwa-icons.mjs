/**
 * Gera icon-192.png e icon-512.png a partir do LOGO_B64 em logrotas-v145.jsx.
 * Logo centralizado com padding (~70% da área) sobre fundo #1E3A8A.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const jsxPath = join(root, "logrotas-v145.jsx");
const publicDir = join(root, "public");

const BRAND_BG = { r: 30, g: 58, b: 138, alpha: 1 }; // #1E3A8A
const LOGO_SCALE = 0.7;

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
  const logoSize = Math.round(size * LOGO_SCALE);
  const offset = Math.round((size - logoSize) / 2);

  const logo = await sharp(input)
    .resize(logoSize, logoSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BRAND_BG,
    },
  })
    .composite([{ input: logo, top: offset, left: offset }])
    .png()
    .toFile(out);

  console.log(`Gerado: public/${filename} (${size}x${size}, logo ${logoSize}px)`);
}

await writeIcon(192, "icon-192.png");
await writeIcon(512, "icon-512.png");
