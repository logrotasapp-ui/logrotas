/**
 * Chaves e endpoints centralizados.
 * Valores lidos exclusivamente de import.meta.env (arquivo .env na raiz do projeto).
 */

const ENV_VAR_NAMES = {
  ors: "VITE_ORS_KEY",
  googleVision: "VITE_GOOGLE_VISION_API_KEY",
  googleMaps: "VITE_GOOGLE_MAPS_KEY",
};

/**
 * @param {string} envName - Nome da variável (ex.: VITE_ORS_KEY)
 * @returns {string}
 */
function readEnv(envName) {
  const env =
    typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};
  const raw = env[envName];
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    if (import.meta.env.DEV) {
      console.warn(
        `[LogRotas] ${envName} não definida. Copie .env.example para .env e preencha a chave.`
      );
    }
    return "";
  }
  return String(raw).trim();
}

/** País(es) em buscas de endereço */
export const SEARCH_COUNTRIES = "br";

export const API_KEYS = {
  ors: readEnv(ENV_VAR_NAMES.ors),
  googleVision: readEnv(ENV_VAR_NAMES.googleVision),
  googleMaps: readEnv(ENV_VAR_NAMES.googleMaps),
};

export const API_ENDPOINTS = {
  orsGeocode: "https://api.openrouteservice.org/geocode/autocomplete",
  orsDirections: "https://api.openrouteservice.org/v2/directions/driving-hgv",
  googleVisionAnnotate: "https://vision.googleapis.com/v1/images:annotate",
};

export const ORS_HEADERS = {
  json: { "Content-Type": "application/json" },
  auth: () => ({ Authorization: API_KEYS.ors }),
};

/** Indica se as chaves principais estão configuradas. */
export function hasRequiredApiKeys() {
  return Boolean(API_KEYS.googleMaps && API_KEYS.googleVision);
}
