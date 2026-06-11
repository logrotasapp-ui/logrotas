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

/**
 * Upload de imagem do checklist: users/{uid}/checklists/{checklistId}/{nomeArquivo}.jpg
 */
export async function uploadChecklistImage(uid, checklistId, nomeArquivo, blob) {
  if (!uid || !checklistId || !nomeArquivo) {
    throw new Error("uid, checklistId e nomeArquivo são obrigatórios");
  }
  const safeName = nomeArquivo.replace(/[^a-zA-Z0-9_-]/g, "_");
  const path = `users/${uid}/checklists/${checklistId}/${safeName}.jpg`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
  return getDownloadURL(storageRef);
}
