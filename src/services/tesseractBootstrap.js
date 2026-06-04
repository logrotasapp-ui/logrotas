/**
 * Resolve automaticamente onde estão worker, core e idioma (local ou CDN).
 * Não exige configuração manual de pastas.
 */

const TESSERACT_VER = "7.0.0";
const CDN = "https://cdn.jsdelivr.net/npm";
const LOG = "[LogRotas OCR]";

export const CDN_CONFIG = {
  workerPath: `${CDN}/tesseract.js@${TESSERACT_VER}/dist/worker.min.js`,
  corePath: `${CDN}/tesseract.js-core@${TESSERACT_VER}`,
  langPath: `${CDN}/@tesseract.js-data/por/4.0.0_best_int`,
  gzip: true,
  source: "cdn",
};

/** @type {Promise<typeof CDN_CONFIG> | null} */
let configPromise = null;

/**
 * URL de arquivo em public/tesseract (Vite serve em /tesseract/...).
 * @param {string} relative ex: "worker.min.js"
 */
export function publicTesseractUrl(relative) {
  const base = import.meta.env.BASE_URL || "/";
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return new URL(`tesseract/${relative.replace(/^\//, "")}`, window.location.origin + prefix)
    .href;
}

export function getLocalTesseractConfig() {
  return {
    workerPath: publicTesseractUrl("worker.min.js"),
    corePath: publicTesseractUrl("core"),
    langPath: publicTesseractUrl("lang/por/4.0.0_best_int"),
    gzip: true,
    source: "local",
  };
}

/**
 * @param {string} url
 */
async function assetReachable(url) {
  try {
    const res = await fetch(url, { method: "GET", cache: "default" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Escolhe local (public/) ou CDN — o que funcionar no dispositivo.
 * @returns {Promise<{ workerPath: string, corePath: string, langPath: string, gzip: boolean, source: string }>}
 */
export async function resolveTesseractConfig() {
  if (configPromise) return configPromise;

  configPromise = (async () => {
    const local = getLocalTesseractConfig();
    const langFile = `${local.langPath}/por.traineddata.gz`;

    const [workerOk, langOk] = await Promise.all([
      assetReachable(local.workerPath),
      assetReachable(langFile),
    ]);

    if (workerOk && langOk) {
      console.log(`${LOG} Usando arquivos locais (public/tesseract)`);
      return local;
    }

    console.warn(
      `${LOG} Arquivos locais indisponíveis (worker=${workerOk}, idioma=${langOk}). Usando CDN na primeira leitura.`
    );
    return { ...CDN_CONFIG };
  })();

  return configPromise;
}

/** Força nova verificação (após setup em dev). */
export function resetTesseractConfigCache() {
  configPromise = null;
}

/** Alias usado na abertura do app — verifica local e prepara fallback CDN. */
export async function ensureTesseractAssets() {
  return resolveTesseractConfig();
}
