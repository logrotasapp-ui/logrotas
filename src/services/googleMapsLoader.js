/**
 * V164 — Aguarda o script Google Maps JavaScript API (index.html).
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
    const ready = () => window.google?.maps;
    if (ready()) {
      resolve();
      return;
    }
    const start = Date.now();
    const tick = () => {
      if (ready()) {
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        reject(new Error("Google Maps não carregou. Verifique VITE_GOOGLE_MAPS_KEY."));
      } else {
        setTimeout(tick, 80);
      }
    };
    tick();
  });
}
