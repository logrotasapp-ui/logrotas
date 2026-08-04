/**
 * Converte arquivo importado (imagem ou PDF) em Blob(s) de imagem para OCR.
 */

const PDF_MIME = "application/pdf";
const PDF_RENDER_SCALE = 2.0;
const PDF_JPEG_QUALITY = 0.96;
const PDFJS_WORKER_SRC =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

export function isPdfFile(file) {
  if (!file) return false;
  const type = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  return type === PDF_MIME || name.endsWith(".pdf");
}

async function loadPdfDocument(file) {
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
  const data = await file.arrayBuffer();
  return pdfjs.getDocument({ data }).promise;
}

/**
 * Renderiza uma página PDF já carregada em JPEG.
 * @param {import("pdfjs-dist").PDFPageProxy} page
 * @returns {Promise<Blob>}
 */
async function renderPdfPageToJpegBlob(page) {
  const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Não foi possível converter o PDF em imagem.")),
      "image/jpeg",
      PDF_JPEG_QUALITY
    );
  });
}

/**
 * Renderiza a primeira página do PDF em JPEG (compat).
 * @param {File|Blob} file
 * @returns {Promise<Blob>}
 */
export async function pdfFirstPageToImageBlob(file) {
  const blobs = await pdfAllPagesToImageBlobs(file);
  if (!blobs.length) {
    throw new Error("Não foi possível converter o PDF em imagem.");
  }
  return blobs[0];
}

/**
 * V374 — Renderiza TODAS as páginas do PDF em JPEGs (ordem 1..N).
 * @param {File|Blob} file
 * @returns {Promise<Blob[]>}
 */
export async function pdfAllPagesToImageBlobs(file) {
  const pdf = await loadPdfDocument(file);
  const numPages = pdf.numPages || 0;
  if (numPages < 1) {
    throw new Error("PDF sem páginas legíveis.");
  }

  const blobs = [];
  for (let n = 1; n <= numPages; n++) {
    const page = await pdf.getPage(n);
    blobs.push(await renderPdfPageToJpegBlob(page));
  }
  return blobs;
}

/**
 * @param {File|Blob} file
 * @returns {Promise<Blob|File>}
 */
export async function fileToImageBlob(file) {
  if (isPdfFile(file)) {
    return pdfFirstPageToImageBlob(file);
  }
  return file;
}
