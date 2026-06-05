/**
 * Chaves e endpoints centralizados.
 * Valores lidos exclusivamente de import.meta.env (arquivo .env na raiz do projeto).
 */

const ENV_VAR_NAMES = {
  ors: "VITE_ORS_KEY",
  mapbox: "VITE_MAPBOX_TOKEN",
  gemini: "VITE_GEMINI_KEY",
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

/** País(es) Mapbox Geocoding — expandir p/ LATAM: ex. "br,ar,uy" */
export const SEARCH_COUNTRIES = "br";

export const API_KEYS = {
  ors: readEnv(ENV_VAR_NAMES.ors),
  mapbox: readEnv(ENV_VAR_NAMES.mapbox),
  gemini: readEnv(ENV_VAR_NAMES.gemini),
};

export const API_ENDPOINTS = {
  orsGeocode: "https://api.openrouteservice.org/geocode/autocomplete",
  orsDirections: "https://api.openrouteservice.org/v2/directions/driving-hgv",
  mapboxGeocoding: "https://api.mapbox.com/geocoding/v5/mapbox.places",
  mapboxDirections: "https://api.mapbox.com/directions/v5/mapbox/driving",
  mapboxOptimization: "https://api.mapbox.com/optimized-trips/v1/mapbox/driving",
  geminiGenerate:
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",
};

export const ORS_HEADERS = {
  json: { "Content-Type": "application/json" },
  auth: () => ({ Authorization: API_KEYS.ors }),
};

export const GEMINI_HEADERS = {
  json: { "Content-Type": "application/json" },
};

/** Indica se todas as chaves obrigatórias estão configuradas. */
export function hasRequiredApiKeys() {
  return Boolean(API_KEYS.ors && API_KEYS.mapbox && API_KEYS.gemini);
}
