/**
 * Bootstrap sob demanda do Google Maps JavaScript API.
 * O script só é injetado na 1ª chamada a waitForGoogleMaps / importGoogleMapsLibrary.
 */

import { API_KEYS } from "./apiConfig.js";

let scriptInjected = false;

function mapsScriptAlreadyInDom() {
  if (typeof document === "undefined") return false;
  return Array.from(document.getElementsByTagName("script")).some((el) =>
    String(el.src || "").includes("maps.googleapis.com/maps/api/js")
  );
}

/**
 * Injeta o script do Maps uma vez (idempotente sob chamadas concorrentes).
 */
function ensureGoogleMapsScript() {
  if (typeof document === "undefined") return;

  if (scriptInjected || mapsScriptAlreadyInDom()) {
    scriptInjected = true;
    return;
  }

  scriptInjected = true;

  const key = API_KEYS.googleMaps;
  if (!key) {
    // Sem chave o poll vai falhar com a mensagem padrão de timeout —
    // mantém o mesmo comportamento de “Maps não carregou”.
    return;
  }

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&language=pt-BR&loading=async`;
  document.head.appendChild(script);
}

/**
 * @param {number} timeoutMs
 * @returns {Promise<void>}
 */
export function waitForGoogleMaps(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Google Maps indisponível"));
      return;
    }

    ensureGoogleMapsScript();

    const ready = () =>
      typeof window.google?.maps?.importLibrary === "function" ||
      typeof window.google?.maps?.Map === "function";

    if (ready()) {
      resolve();
      return;
    }

    const start = Date.now();
    const tick = () => {
      if (ready()) {
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        reject(
          new Error(
            "Google Maps não carregou. Verifique VITE_GOOGLE_MAPS_KEY e a conexão."
          )
        );
      } else {
        setTimeout(tick, 80);
      }
    };
    tick();
  });
}

/**
 * Carrega biblioteca dinâmica (places, maps, …) com loading=async.
 * @param {string} name
 * @param {number} [timeoutMs]
 */
export async function importGoogleMapsLibrary(name, timeoutMs = 15000) {
  await waitForGoogleMaps(timeoutMs);

  if (typeof window.google.maps.importLibrary === "function") {
    return window.google.maps.importLibrary(name);
  }

  if (name === "places" && window.google.maps.places) {
    return window.google.maps.places;
  }

  throw new Error(
    `Biblioteca Google Maps "${name}" indisponível. Verifique VITE_GOOGLE_MAPS_KEY.`
  );
}
