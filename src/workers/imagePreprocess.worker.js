/**
 * Pré-processamento de imagem fora da thread principal (Web Worker).
 * Redimensiona (máx. 1200px) e converte para escala de cinza.
 */

const MAX_WIDTH = 1200;
const JPEG_QUALITY = 0.88;

self.onmessage = async (e) => {
  const { id, blob } = e.data;
  try {
    if (!blob) {
      self.postMessage({ id, ok: false, error: "Imagem vazia." });
      return;
    }

    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, MAX_WIDTH / bitmap.width);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.filter = "grayscale(1)";
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const outBlob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: JPEG_QUALITY,
    });

    self.postMessage({ id, ok: true, blob: outBlob }, [outBlob]);
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      error: err?.message || "Falha no pré-processamento.",
    });
  }
};
