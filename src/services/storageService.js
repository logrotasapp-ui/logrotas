import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase.js";

const MAX_DIM = 1280;
const JPEG_QUALITY = 0.7;

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível carregar a imagem."));
    };
    img.src = url;
  });
}

function blobFromCanvas(canvas, quality = JPEG_QUALITY) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Falha ao gerar imagem."))),
      "image/jpeg",
      quality
    );
  });
}

/**
 * Redimensiona para máx 1280px no lado maior e exporta JPEG (~0.7).
 */
export async function compressImageToJpegBlob(input) {
  const img = await loadImageFromBlob(input);
  let { width, height } = img;
  const maxSide = Math.max(width, height);
  if (maxSide > MAX_DIM) {
    const scale = MAX_DIM / maxSide;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);
  return blobFromCanvas(canvas);
}

/**
 * Comprime e desenha carimbo no rodapé (data/hora + coordenadas).
 */
export async function stampAndCompressImage(blob, stampText) {
  const compressed = await compressImageToJpegBlob(blob);
  const img = await loadImageFromBlob(compressed);
  const stampH = Math.max(32, Math.round(img.height * 0.06));
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  ctx.fillStyle = "rgba(0,0,0,0.58)";
  ctx.fillRect(0, canvas.height - stampH, canvas.width, stampH);
  ctx.fillStyle = "#fff";
  ctx.font = `600 ${Math.max(11, Math.round(canvas.width * 0.028))}px "DM Sans",sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillText(stampText, 10, canvas.height - stampH / 2, canvas.width - 20);
  return blobFromCanvas(canvas);
}

export function formatStampDataHora(date = new Date()) {
  const d = date.toLocaleDateString("pt-BR");
  const h = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${d} ${h}`;
}

export function formatStampCoords(lat, lng) {
  if (lat == null || lng == null) return "GPS indisponível";
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

export function buildPhotoStampText(lat, lng, date = new Date()) {
  return `${formatStampDataHora(date)} · ${formatStampCoords(lat, lng)}`;
}

export function isChecklistDownloadUrl(value) {
  return typeof value === "string" && value.startsWith("https://");
}

/**
 * Resolve caminho legado do Storage ou URL parcial para URL de download HTTPS.
 */
export async function resolveChecklistDownloadUrl(urlOrPath) {
  if (!urlOrPath || typeof urlOrPath !== "string") return null;
  if (isChecklistDownloadUrl(urlOrPath)) return urlOrPath;

  const path = urlOrPath
    .replace(/^gs:\/\/[^/]+\//, "")
    .replace(/^\//, "")
    .trim();
  if (!path) return null;

  return getDownloadURL(ref(storage, path));
}

/**
 * Migra fotos e assinaturas que guardam caminho em vez de URL de download.
 * @returns {{ coleta: object, changed: boolean }}
 */
export async function migrateChecklistColetaMedia(coleta) {
  if (!coleta) return { coleta, changed: false };

  let changed = false;
  const fotos = await Promise.all(
    (coleta.fotos || []).map(async (foto) => {
      if (!foto?.url || isChecklistDownloadUrl(foto.url)) return foto;
      try {
        const url = await resolveChecklistDownloadUrl(foto.url);
        if (url && url !== foto.url) {
          changed = true;
          return { ...foto, url };
        }
      } catch (err) {
        console.warn("[Checklist] Falha ao migrar URL da foto:", foto.url, err);
      }
      return foto;
    })
  );

  const assinaturas = { ...(coleta.assinaturas || {}) };
  for (const key of ["responsavel", "prestador"]) {
    const assin = assinaturas[key];
    if (!assin?.imagemUrl || isChecklistDownloadUrl(assin.imagemUrl)) continue;
    try {
      const imagemUrl = await resolveChecklistDownloadUrl(assin.imagemUrl);
      if (imagemUrl && imagemUrl !== assin.imagemUrl) {
        assinaturas[key] = { ...assin, imagemUrl };
        changed = true;
      }
    } catch (err) {
      console.warn("[Checklist] Falha ao migrar URL da assinatura:", assin.imagemUrl, err);
    }
  }

  if (!changed) return { coleta, changed: false };
  return { coleta: { ...coleta, fotos, assinaturas }, changed: true };
}

/**
 * Upload de imagem do checklist: users/{uid}/checklists/{checklistId}/{nomeArquivo}.jpg
 * Retorna sempre a URL HTTPS de download (getDownloadURL).
 */
export async function uploadChecklistImage(uid, checklistId, nomeArquivo, blob) {
  if (!uid || !checklistId || !nomeArquivo) {
    throw new Error("uid, checklistId e nomeArquivo são obrigatórios");
  }
  const safeName = nomeArquivo.replace(/[^a-zA-Z0-9_-]/g, "_");
  const path = `users/${uid}/checklists/${checklistId}/${safeName}.jpg`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
  const downloadUrl = await getDownloadURL(storageRef);
  if (!isChecklistDownloadUrl(downloadUrl)) {
    throw new Error("URL de download inválida após upload.");
  }
  return downloadUrl;
}
