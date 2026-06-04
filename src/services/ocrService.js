/**
 * OCR Tesseract.js — caminhos resolvidos automaticamente (local ou CDN).
 * Worker pré-carregado na abertura do app via warmupOcrWorker().
 */

import {
  resolveTesseractConfig,
  resetTesseractConfigCache,
  CDN_CONFIG,
  ensureTesseractAssets,
} from "./tesseractBootstrap.js";

export { ensureTesseractAssets };

const MAX_WIDTH = 800;
const BINARY_THRESHOLD = 140;
const JPEG_QUALITY = 0.72;
const WORKER_INIT_TIMEOUT_MS = 120000;
const RECOGNIZE_TIMEOUT_MS = 90000;
const LOG = "[LogRotas OCR]";

const MEMORY_ERROR_MSG =
  "A imagem é grande demais para este aparelho. Tire outra foto mais perto ou digite os endereços manualmente.";

const USER_FRIENDLY_FAIL =
  "Erro de processamento: tente uma foto com mais iluminação ou use o input manual.";

let workerInstance = null;
let workerInitPromise = null;
let warmupPromise = null;
let workerBusy = false;
let activeJobId = 0;
/** @type {Awaited<ReturnType<typeof resolveTesseractConfig>> | null} */
let activeConfig = null;

function logStep(step, detail) {
  const extra = detail != null && detail !== "" ? ` — ${detail}` : "";
  console.log(`${LOG} ${step}${extra}`);
}

export function cancelOcr() {
  activeJobId += 1;
  workerBusy = false;
}

function yieldToMainThread() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

function isMemoryError(err) {
  if (!err) return false;
  if (err instanceof RangeError) return true;
  const msg = String(err.message || err).toLowerCase();
  return (
    msg.includes("memory") ||
    msg.includes("allocation") ||
    msg.includes("out of memory") ||
    msg.includes("array buffer")
  );
}

function isFileNotFoundError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    msg.includes("file_not_found") ||
    msg.includes("failed to fetch") ||
    msg.includes("network error while fetching") ||
    msg.includes("404") ||
    msg.includes("not found")
  );
}

function mapOcrError(err) {
  if (isMemoryError(err)) return MEMORY_ERROR_MSG;
  if (isFileNotFoundError(err)) return USER_FRIENDLY_FAIL;
  return err?.message || USER_FRIENDLY_FAIL;
}

function mapInitProgress(m) {
  if (m.status === "loading tesseract core") {
    return { pct: 12, text: "Carregando motor OCR…" };
  }
  if (m.status === "loading language traineddata") {
    const sub =
      typeof m.progress === "number" ? Math.round(m.progress * 100) : 0;
    return { pct: 14 + Math.round(sub * 0.14), text: `Carregando idioma (${sub}%)…` };
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
 * @param {(pct: number, status: string) => void} [report]
 */
async function initWorker(report = () => {}) {
  if (workerInstance && activeConfig) return workerInstance;

  activeConfig = await resolveTesseractConfig();
  logStep("Configuração", `${activeConfig.source} → ${activeConfig.langPath}`);

  const { createWorker, PSM } = await import("tesseract.js");

  const worker = await createWorker("por", 1, {
    workerPath: activeConfig.workerPath,
    corePath: activeConfig.corePath,
    langPath: activeConfig.langPath,
    gzip: activeConfig.gzip,
    logger: (m) => {
      logStep("Worker", m.status || "");
      const mapped = mapInitProgress(m);
      if (mapped) report(mapped.pct, mapped.text);
    },
    errorHandler: (err) => {
      console.warn(LOG, err);
      if (isFileNotFoundError(err)) {
        resetTesseractConfigCache();
        activeConfig = null;
      }
    },
  });

  await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
  workerInstance = worker;
  logStep("Worker pronto", `idioma por (${activeConfig.source})`);
  return worker;
}

/**
 * Pré-carrega o worker uma vez (abertura do app).
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function warmupOcrWorker() {
  if (workerInstance) return { ok: true };

  if (!warmupPromise) {
    warmupPromise = withTimeout(
      initWorker(),
      WORKER_INIT_TIMEOUT_MS,
      "Tempo esgotado ao preparar o leitor de romaneio."
    )
      .then(() => ({ ok: true }))
      .catch(async (err) => {
        logStep("Warmup falhou, tentando CDN", err?.message);
        resetTesseractConfigCache();
        workerInitPromise = null;
        if (workerInstance) {
          try {
            await workerInstance.terminate();
          } catch {
            /* ignore */
          }
          workerInstance = null;
        }
        activeConfig = null;

        try {
          activeConfig = { ...CDN_CONFIG };
          const { createWorker, PSM } = await import("tesseract.js");
          workerInstance = await createWorker("por", 1, {
            workerPath: activeConfig.workerPath,
            corePath: activeConfig.corePath,
            langPath: activeConfig.langPath,
            gzip: activeConfig.gzip,
          });
          await workerInstance.setParameters({
            tessedit_pageseg_mode: PSM.AUTO,
          });
          logStep("Worker pronto (CDN fallback)");
          return { ok: true };
        } catch (err2) {
          warmupPromise = null;
          console.error(LOG, err2);
          return { ok: false, error: mapOcrError(err2) };
        }
      });
  }

  return warmupPromise;
}

export function isOcrWorkerReady() {
  return Boolean(workerInstance);
}

async function getWorker(report, jobId) {
  if (workerInstance) return workerInstance;

  if (!workerInitPromise) {
    workerInitPromise = initWorker(report);
  }

  try {
    return await withTimeout(
      workerInitPromise,
      WORKER_INIT_TIMEOUT_MS,
      "Leitor OCR não respondeu a tempo."
    );
  } catch (err) {
    workerInitPromise = null;
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
  workerInitPromise = null;
  warmupPromise = null;
  activeConfig = null;
  workerBusy = false;
}

export async function preprocessImageForOcr(blob) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch (err) {
    if (isMemoryError(err)) throw new Error(MEMORY_ERROR_MSG);
    throw new Error("Não foi possível abrir a imagem.");
  }

  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  try {
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const { data } = ctx.getImageData(0, 0, width, height);
    for (let i = 0; i < data.length; i += 4) {
      const gray =
        data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const v = gray > BINARY_THRESHOLD ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
    ctx.putImageData(new ImageData(data, width, height), 0, 0);
  } catch (err) {
    bitmap.close?.();
    if (isMemoryError(err)) throw new Error(MEMORY_ERROR_MSG);
    throw err;
  }

  await yieldToMainThread();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Falha ao preparar imagem."))),
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}

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
    const warm = await warmupOcrWorker();
    if (!warm.ok) {
      return { ok: false, error: warm.error || USER_FRIENDLY_FAIL };
    }

    report(8, "Preparando imagem…");
    const prepared = await preprocessImageForOcr(fileOrBlob);

    if (signal?.aborted || jobId !== activeJobId) {
      return { ok: false, error: "Leitura cancelada." };
    }

    report(25, "Lendo texto…");
    const worker = await getWorker(report, jobId);

    if (signal?.aborted || jobId !== activeJobId) {
      return { ok: false, error: "Leitura cancelada." };
    }

    report(35, "Lendo texto do romaneio…");

    const { data } = await withTimeout(
      worker.recognize(prepared, {}, {
        logger: (m) => {
          if (jobId !== activeJobId) return;
          if (m.status === "recognizing text" && typeof m.progress === "number") {
            report(35 + Math.round(m.progress * 60), "Lendo texto do romaneio…");
          }
        },
      }),
      RECOGNIZE_TIMEOUT_MS,
      USER_FRIENDLY_FAIL
    );

    if (signal?.aborted || jobId !== activeJobId) {
      return { ok: false, error: "Leitura cancelada." };
    }

    report(100, "Concluído");
    const text = data?.text || "";

    if (!text.trim()) {
      return {
        ok: false,
        error:
          "Nenhum texto detectado. Melhore a iluminação ou use o input manual.",
      };
    }

    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: mapOcrError(err) };
  } finally {
    workerBusy = false;
    await yieldToMainThread();
  }
}

export async function disposeOcrWorker() {
  activeJobId += 1;
  workerBusy = false;
  await terminateWorker();
  resetTesseractConfigCache();
}
