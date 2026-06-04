/**
 * OCR via Tesseract.js (Web Worker interno do Tesseract).
 * Pré-processamento leve na thread principal: máx. 800px, preto e branco.
 */

const MAX_WIDTH = 800;
const BINARY_THRESHOLD = 140;
const JPEG_QUALITY = 0.72;
const WORKER_INIT_TIMEOUT_MS = 90000;
const RECOGNIZE_TIMEOUT_MS = 120000;
const TESSERACT_VER = "7.0.0";
const CDN = "https://cdn.jsdelivr.net/npm";
const LOG = "[LogRotas OCR]";

const POR_LANG_CDN = `${CDN}/@tesseract.js-data/por/4.0.0_best_int`;

const TESSERACT_OPTIONS = {
  workerPath: `${CDN}/tesseract.js@${TESSERACT_VER}/dist/worker.min.js`,
  corePath: `${CDN}/tesseract.js-core@${TESSERACT_VER}`,
  gzip: true,
};

const MEMORY_ERROR_MSG =
  "A imagem é grande demais para este aparelho. Tire outra foto mais perto, use a galeria com arquivo menor ou digite os endereços manualmente.";

let workerInstance = null;
let workerInitPromise = null;
let workerBusy = false;
let activeJobId = 0;
let resolvedLangPath = null;
let langPathProbe = null;

function logStep(step, detail) {
  const extra = detail != null && detail !== "" ? ` — ${detail}` : "";
  console.log(`${LOG} ${step}${extra}`);
}

export function cancelOcr() {
  activeJobId += 1;
  workerBusy = false;
  workerInitPromise = null;
  void terminateWorker();
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
    msg.includes("array buffer") ||
    msg.includes("wasm")
  );
}

function mapOcrError(err) {
  if (isMemoryError(err)) return MEMORY_ERROR_MSG;
  const msg = err?.message;
  if (msg && !msg.includes("Tempo esgotado")) return msg;
  if (msg) return msg;
  return "Não foi possível ler o romaneio. Tente outra foto ou digite os endereços manualmente.";
}

async function resolvePortugueseLangPath() {
  if (resolvedLangPath) return resolvedLangPath;

  if (!langPathProbe) {
    langPathProbe = (async () => {
      const base = import.meta.env.BASE_URL || "/";
      const localBase = new URL(
        "tesseract/lang/por/4.0.0_best_int",
        window.location.origin + base
      ).href.replace(/\/$/, "");

      try {
        const head = await fetch(`${localBase}/por.traineddata.gz`, {
          method: "HEAD",
        });
        if (head.ok) return localBase;
      } catch {
        /* CDN */
      }
      return POR_LANG_CDN;
    })();
  }

  resolvedLangPath = await langPathProbe;
  return resolvedLangPath;
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

async function initWorker(report, jobId) {
  const { createWorker, PSM } = await import("tesseract.js");
  const langPath = await resolvePortugueseLangPath();

  const worker = await createWorker("por", 1, {
    ...TESSERACT_OPTIONS,
    langPath,
    logger: (m) => {
      if (jobId !== activeJobId) return;
      const mapped = mapInitProgress(m);
      if (mapped) report(mapped.pct, mapped.text);
    },
    errorHandler: (err) => console.warn(LOG, err),
  });

  await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
  workerInstance = worker;
  return worker;
}

async function getWorker(report, jobId) {
  if (workerInstance) return workerInstance;

  if (!workerInitPromise) {
    workerInitPromise = initWorker(report, jobId);
  }

  try {
    return await withTimeout(
      workerInitPromise,
      WORKER_INIT_TIMEOUT_MS,
      "Tempo esgotado ao carregar o leitor OCR. Verifique a internet."
    );
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

/**
 * Redimensiona (máx. 800px) e binariza (preto e branco) — leve, sem worker extra.
 * @param {Blob} blob
 */
export async function preprocessImageForOcr(blob) {
  logStep("Processando imagem", "redimensionar + P&B (máx 800px)");

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
      (b) => {
        if (b) resolve(b);
        else reject(new Error("Falha ao preparar imagem para leitura."));
      },
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
    report(8, "Preparando imagem…");
    const prepared = await preprocessImageForOcr(fileOrBlob);

    if (signal?.aborted || jobId !== activeJobId) {
      return { ok: false, error: "Leitura cancelada." };
    }

    report(15, "Carregando leitor OCR…");
    let worker;
    try {
      worker = await getWorker(report, jobId);
    } catch (err) {
      return { ok: false, error: mapOcrError(err) };
    }

    if (signal?.aborted || jobId !== activeJobId) {
      return { ok: false, error: "Leitura cancelada." };
    }

    report(32, "Lendo texto do romaneio…");

    const { data } = await withTimeout(
      worker.recognize(prepared, {}, {
        logger: (m) => {
          if (jobId !== activeJobId) return;
          if (m.status === "recognizing text" && typeof m.progress === "number") {
            report(32 + Math.round(m.progress * 65), "Lendo texto do romaneio…");
          }
        },
      }),
      RECOGNIZE_TIMEOUT_MS,
      "Tempo esgotado na leitura. Use foto menor ou digite os endereços manualmente."
    );

    if (signal?.aborted || jobId !== activeJobId) {
      return { ok: false, error: "Leitura cancelada." };
    }

    report(100, "Concluído");
    const text = data?.text || "";

    if (!text.trim()) {
      return {
        ok: false,
        error: "Nenhum texto detectado. Melhore a iluminação ou digite manualmente.",
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
  cancelOcr();
  await terminateWorker();
}
