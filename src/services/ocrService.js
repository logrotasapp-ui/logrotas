/**
 * OCR no cliente via Tesseract.js (Web Worker interno).
 * Pré-processa a imagem para melhor precisão e reporta progresso sem bloquear a UI.
 */

const MAX_WIDTH = 1280;
const JPEG_QUALITY = 0.9;
const WORKER_INIT_TIMEOUT_MS = 120000;
const TESSERACT_VER = "7.0.0";
const CDN = "https://cdn.jsdelivr.net/npm";

const TESSERACT_OPTIONS = {
  workerPath: `${CDN}/tesseract.js@${TESSERACT_VER}/dist/worker.min.js`,
  corePath: `${CDN}/tesseract.js-core@${TESSERACT_VER}/tesseract-core-relaxedsimd-lstm.wasm.js`,
  langPath: `${CDN}/@tesseract.js-data`,
  gzip: true,
};

let workerInstance = null;
let workerInitPromise = null;
let workerBusy = false;
/** @type {number} */
let activeJobId = 0;

/** Cancela o job OCR e interrompe carregamento do worker. */
export function cancelOcr() {
  activeJobId += 1;
  workerBusy = false;
  workerInitPromise = null;
  terminateWorker();
}

function yieldToMainThread() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

function mapInitProgress(m) {
  if (m.status === "loading tesseract core") {
    return { pct: 12, text: "Carregando motor OCR…" };
  }
  if (m.status === "loading language traineddata") {
    const sub =
      typeof m.progress === "number" ? Math.round(m.progress * 100) : 0;
    return { pct: 14 + Math.round(sub * 0.14), text: `Baixando idioma (${sub}%)…` };
  }
  if (
    m.status === "initializing tesseract" ||
    m.status === "initializing api"
  ) {
    return { pct: 30, text: "Inicializando leitor…" };
  }
  return null;
}

/**
 * @param {(pct: number, status: string) => void} report
 * @param {number} jobId
 */
async function initWorker(report, jobId) {
  const { createWorker } = await import("tesseract.js");

  const worker = await createWorker("por", 1, {
    ...TESSERACT_OPTIONS,
    logger: (m) => {
      if (jobId !== activeJobId) return;
      const mapped = mapInitProgress(m);
      if (mapped) report(mapped.pct, mapped.text);
    },
    errorHandler: (err) => {
      console.warn("[LogRotas OCR]", err);
    },
  });

  workerInstance = worker;
  return worker;
}

async function getWorker(report, jobId) {
  if (workerInstance) return workerInstance;

  if (!workerInitPromise) {
    workerInitPromise = initWorker(report, jobId);
  }

  try {
    const worker = await withTimeout(
      workerInitPromise,
      WORKER_INIT_TIMEOUT_MS,
      "Tempo esgotado ao carregar o leitor OCR. Verifique a internet e tente de novo."
    );
    return worker;
  } catch (err) {
    workerInitPromise = null;
    await terminateWorker();
    throw err;
  }
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

/**
 * @param {Blob|File} fileOrBlob
 * @param {{ onProgress?: (pct: number, status: string) => void, signal?: { aborted?: boolean } }} [options]
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

    report(10, "Carregando leitor OCR…");
    let worker;
    try {
      worker = await getWorker(report, jobId);
    } catch (err) {
      return {
        ok: false,
        error:
          err?.message ||
          "Não foi possível iniciar o OCR. Tente galeria com foto nítida ou verifique a conexão.",
      };
    }

    if (signal?.aborted || jobId !== activeJobId) {
      return { ok: false, error: "Leitura cancelada." };
    }

    report(32, "Lendo texto do romaneio…");
    const { data } = await worker.recognize(prepared, {}, {
      logger: (m) => {
        if (jobId !== activeJobId) return;
        if (m.status === "recognizing text" && typeof m.progress === "number") {
          const pct = 32 + Math.round(m.progress * 65);
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
      return {
        ok: false,
        error: "Nenhum texto detectado. Melhore a iluminação e o enquadramento.",
      };
    }

    return { ok: true, text };
  } catch (err) {
    return {
      ok: false,
      error:
        err?.message ||
        "Falha no OCR. Tente outra foto ou use mais luz.",
    };
  } finally {
    workerBusy = false;
    await yieldToMainThread();
  }
}

export async function disposeOcrWorker() {
  cancelOcr();
  await terminateWorker();
}
