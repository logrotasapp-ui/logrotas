/**
 * Aguarda o bootstrap do Google Maps JavaScript API (index.html, loading=async).
 */

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
