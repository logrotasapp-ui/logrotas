/**
 * OCR no cliente via Tesseract.js (Web Worker interno).
 * Pré-processa a imagem para melhor precisão e reporta progresso sem bloquear a UI.
 */

const MAX_WIDTH = 1280;
const JPEG_QUALITY = 0.9;

let workerInstance = null;
let workerBusy = false;
/** @type {number} */
let activeJobId = 0;

/** Cancela o job OCR em andamento (descarta resultado ao concluir). */
export function cancelOcr() {
  activeJobId += 1;
}

function yieldToMainThread() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * Redimensiona, escala de cinza e aumenta contraste para melhorar o OCR.
 * @param {Blob} blob
 * @returns {Promise<Blob>}
 */
export async function preprocessImageForOcr(blob) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.filter = "grayscale(1) contrast(1.35) brightness(1.05)";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  await yieldToMainThread();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Falha ao preparar imagem."))),
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}

async function getWorker() {
  if (workerInstance) return workerInstance;
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("por", 1, {
    logger: () => {},
  });
  workerInstance = worker;
  return worker;
}

async function terminateWorker() {
  if (workerInstance) {
    try {
      await workerInstance.terminate();
    } catch {
      /* ignore */
    }
    workerInstance = null;
  }
  workerBusy = false;
}

/**
 * @param {Blob|File} fileOrBlob
 * @param {{ onProgress?: (pct: number, status: string) => void, signal?: { aborted?: boolean } }} [options]
 * @returns {Promise<{ ok: true, text: string } | { ok: false, error: string }>}
 */
export async function runOcrOnImage(fileOrBlob, options = {}) {
  const { onProgress, signal } = options;
  const jobId = ++activeJobId;

  const report = (pct, status) => {
    if (jobId !== activeJobId) return;
    onProgress?.(pct, status);
  };

  if (!fileOrBlob) {
    return { ok: false, error: "Nenhuma imagem para ler." };
  }

  if (workerBusy) {
    return { ok: false, error: "Leitura em andamento. Aguarde ou cancele." };
  }

  workerBusy = true;

  try {
    report(5, "Preparando imagem…");
    const prepared = await preprocessImageForOcr(fileOrBlob);

    if (signal?.aborted || jobId !== activeJobId) {
      return { ok: false, error: "Leitura cancelada." };
    }

    report(15, "Iniciando OCR…");
    const worker = await getWorker();

    if (signal?.aborted || jobId !== activeJobId) {
      return { ok: false, error: "Leitura cancelada." };
    }

    const { data } = await worker.recognize(prepared, {}, {
      logger: (m) => {
        if (jobId !== activeJobId) return;
        if (m.status === "loading language traineddata") {
          report(20, "Carregando idioma…");
        } else if (m.status === "initializing api") {
          report(25, "Inicializando…");
        } else if (m.status === "recognizing text" && typeof m.progress === "number") {
          const pct = 25 + Math.round(m.progress * 70);
          report(pct, "Lendo texto do romaneio…");
        }
      },
    });

    if (signal?.aborted || jobId !== activeJobId) {
      return { ok: false, error: "Leitura cancelada." };
    }

    report(100, "Concluído");
    const text = data?.text || "";

    if (!text.trim()) {
      return { ok: false, error: "Nenhum texto detectado. Melhore a iluminação e o enquadramento." };
    }

    return { ok: true, text };
  } catch {
    return { ok: false, error: "Falha no OCR. Tente outra foto ou use mais luz." };
  } finally {
    workerBusy = false;
    await yieldToMainThread();
  }
}

/** Libera o worker ao sair do módulo (ex.: desmontar scanner). */
export async function disposeOcrWorker() {
  cancelOcr();
  await terminateWorker();
}
