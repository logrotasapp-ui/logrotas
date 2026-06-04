/**
 * OCR no cliente via Tesseract.js (Web Worker dedicado do Tesseract).
 * Pré-processamento em worker separado; idioma português (por) via CDN ou /public.
 */

const MAX_WIDTH = 1200;
const JPEG_QUALITY = 0.88;
const WORKER_INIT_TIMEOUT_MS = 120000;
const RECOGNIZE_TIMEOUT_MS = 180000;
const PREPROCESS_TIMEOUT_MS = 45000;
const TESSERACT_VER = "7.0.0";
const CDN = "https://cdn.jsdelivr.net/npm";
const LOG = "[LogRotas OCR]";

/** Caminho oficial do traineddata português (LSTM) — mesmo padrão do tesseract.js */
const POR_LANG_CDN = `${CDN}/@tesseract.js-data/por/4.0.0_best_int`;

const TESSERACT_OPTIONS = {
  workerPath: `${CDN}/tesseract.js@${TESSERACT_VER}/dist/worker.min.js`,
  /** Diretório (não arquivo .js): o Tesseract escolhe SIMD/relaxed automaticamente */
  corePath: `${CDN}/tesseract.js-core@${TESSERACT_VER}`,
  gzip: true,
};

let workerInstance = null;
let workerInitPromise = null;
let workerBusy = false;
/** @type {number} */
let activeJobId = 0;
/** @type {string | null} */
let resolvedLangPath = null;
/** @type {Promise<string> | null} */
let langPathProbe = null;

let preprocessWorker = null;
/** @type {number} */
let preprocessJobId = 0;

/** @param {string} step */
function logStep(step, detail) {
  const extra = detail != null && detail !== "" ? ` — ${detail}` : "";
  console.log(`${LOG} ${step}${extra}`);
}

/** Cancela o job OCR e interrompe carregamento do worker. */
export function cancelOcr() {
  logStep("Cancelar", "interrompendo OCR e worker");
  activeJobId += 1;
  preprocessJobId += 1;
  workerBusy = false;
  workerInitPromise = null;
  void terminateWorker();
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

/**
 * Preferência: arquivo local em public/; senão CDN oficial do @tesseract.js-data.
 * @returns {Promise<string>}
 */
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
        const probeUrl = `${localBase}/por.traineddata.gz`;
        logStep("Verificando idioma local", probeUrl);
        const head = await fetch(probeUrl, { method: "HEAD" });
        if (head.ok) {
          logStep("Idioma português", "usando pasta public (offline)");
          return localBase;
        }
      } catch {
        /* CDN */
      }

      logStep("Idioma português", `CDN oficial: ${POR_LANG_CDN}`);
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

function logTesseractEvent(phase, m) {
  const prog =
    typeof m?.progress === "number"
      ? `${Math.round(m.progress * 100)}%`
      : "";
  logStep(phase, `${m?.status || "evento"}${prog ? ` (${prog})` : ""}`);
}

/**
 * @param {(pct: number, status: string) => void} report
 * @param {number} jobId
 */
async function initWorker(report, jobId) {
  logStep("Carregando worker Tesseract", TESSERACT_OPTIONS.workerPath);

  const { createWorker, PSM } = await import("tesseract.js");
  const langPath = await resolvePortugueseLangPath();

  logStep("Carregando idioma", "por (português)");

  const worker = await createWorker("por", 1, {
    ...TESSERACT_OPTIONS,
    langPath,
    logger: (m) => {
      if (jobId !== activeJobId) return;
      logTesseractEvent("Worker Tesseract", m);
      const mapped = mapInitProgress(m);
      if (mapped) report(mapped.pct, mapped.text);
    },
    errorHandler: (err) => {
      console.warn(LOG, "Erro no worker:", err);
    },
  });

  logStep("Configurando parâmetros OCR", "PSM automático");
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.AUTO,
  });

  workerInstance = worker;
  logStep("Worker Tesseract pronto", "idioma por carregado");
  return worker;
}

async function getWorker(report, jobId) {
  if (workerInstance) {
    logStep("Reutilizando worker", "já inicializado");
    return workerInstance;
  }

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
    logStep("Encerrando worker Tesseract");
    try {
      await workerInstance.terminate();
    } catch {
      /* ignore */
    }
    workerInstance = null;
  }
  workerBusy = false;
}

function getPreprocessWorker() {
  if (preprocessWorker) return preprocessWorker;
  preprocessWorker = new Worker(
    new URL("../workers/imagePreprocess.worker.js", import.meta.url),
    { type: "module" }
  );
  return preprocessWorker;
}

function preprocessOnMainThread(blob) {
  return preprocessImageForOcrMain(blob);
}

/**
 * Pré-processamento na thread principal (fallback).
 * @param {Blob} blob
 */
async function preprocessImageForOcrMain(blob) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.filter = "grayscale(1)";
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
 * Redimensiona (máx. 1200px) e escala de cinza — preferencialmente em Web Worker.
 * @param {Blob} blob
 */
export async function preprocessImageForOcr(blob) {
  const jobId = ++preprocessJobId;

  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") {
    logStep("Processando imagem", "fallback thread principal");
    return preprocessOnMainThread(blob);
  }

  logStep("Processando imagem", "Web Worker (redimensionar + cinza)");

  const worker = getPreprocessWorker();

  return withTimeout(
    new Promise((resolve, reject) => {
      const onMessage = (e) => {
        if (e.data?.id !== jobId) return;
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
        if (e.data.ok) resolve(e.data.blob);
        else reject(new Error(e.data.error || "Pré-processamento falhou."));
      };
      const onError = () => {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
        reject(new Error("Worker de imagem indisponível."));
      };
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      worker.postMessage({ id: jobId, blob });
    }),
    PREPROCESS_TIMEOUT_MS,
    "Tempo esgotado ao preparar a imagem."
  ).catch(async (err) => {
    if (jobId !== preprocessJobId) throw err;
    logStep("Processando imagem", `fallback: ${err.message}`);
    return preprocessOnMainThread(blob);
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
  logStep("Início do OCR");

  try {
    report(5, "Preparando imagem…");
    logStep("Processando imagem", `entrada ${fileOrBlob.size || "?"} bytes`);
    const prepared = await preprocessImageForOcr(fileOrBlob);
    logStep(
      "Imagem preparada",
      `${prepared.size} bytes, máx ${MAX_WIDTH}px, escala de cinza`
    );

    if (signal?.aborted || jobId !== activeJobId) {
      return { ok: false, error: "Leitura cancelada." };
    }

    report(10, "Carregando leitor OCR…");
    logStep("Carregando idioma", "inicializando worker remoto…");
    let worker;
    try {
      worker = await getWorker(report, jobId);
    } catch (err) {
      logStep("Falha ao carregar worker", err?.message);
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
    logStep("Reconhecendo texto", "worker.recognize (thread separada)");

    const recognizePromise = worker.recognize(prepared, {}, {
      logger: (m) => {
        if (jobId !== activeJobId) return;
        logTesseractEvent("Reconhecimento", m);
        if (m.status === "recognizing text" && typeof m.progress === "number") {
          const pct = 32 + Math.round(m.progress * 65);
          report(pct, "Lendo texto do romaneio…");
        }
      },
    });

    const { data } = await withTimeout(
      recognizePromise,
      RECOGNIZE_TIMEOUT_MS,
      "Tempo esgotado na leitura do texto. Use foto menor ou mais nítida."
    );

    if (signal?.aborted || jobId !== activeJobId) {
      return { ok: false, error: "Leitura cancelada." };
    }

    report(100, "Concluído");
    logStep("Finalizando", "OCR concluído");
    const text = data?.text || "";

    if (!text.trim()) {
      logStep("Finalizando", "nenhum texto detectado");
      return {
        ok: false,
        error: "Nenhum texto detectado. Melhore a iluminação e o enquadramento.",
      };
    }

    logStep("Finalizando", `${text.length} caracteres lidos`);
    return { ok: true, text };
  } catch (err) {
    logStep("Erro no OCR", err?.message);
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
  logStep("Dispose", "liberando recursos OCR");
  cancelOcr();
  await terminateWorker();
  if (preprocessWorker) {
    preprocessWorker.terminate();
    preprocessWorker = null;
  }
}
