/**
 * Gera icon-192.png e icon-512.png a partir de public/logo.png.
 * Ícones quadrados (cantos retos — sem border-radius); o SO aplica arredondamento.
 * Logo centralizado com padding (~70% da área) sobre fundo #ECEEF0.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const logoPath = join(root, "public", "logo.png");
const publicDir = join(root, "public");

const ICON_BG = { r: 236, g: 238, b: 240, alpha: 1 }; // #ECEEF0
const LOGO_SCALE = 0.7;

const input = readFileSync(logoPath);

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
      background: ICON_BG,
    },
  })
    .composite([{ input: logo, top: offset, left: offset }])
    .png()
    .toFile(out);

  console.log(`Gerado: public/${filename} (${size}x${size}, logo ${logoSize}px)`);
}

await writeIcon(192, "icon-192.png");
await writeIcon(512, "icon-512.png");
