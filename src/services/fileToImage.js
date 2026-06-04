/**
 * Converte arquivo importado (imagem ou PDF) em Blob de imagem para OCR.
 */

const PDF_MIME = "application/pdf";

function isPdf(file) {
  if (!file) return false;
  const type = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  return type === PDF_MIME || name.endsWith(".pdf");
}

/**
 * Renderiza a primeira página do PDF em JPEG.
 * @param {File|Blob} file
 * @returns {Promise<Blob>}
 */
export async function pdfFirstPageToImageBlob(file) {
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });

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
      0.92
    );
  });
}

/**
 * @param {File|Blob} file
 * @returns {Promise<Blob|File>}
 */
export async function fileToImageBlob(file) {
  if (isPdf(file)) {
    return pdfFirstPageToImageBlob(file);
  }
  return file;
}
