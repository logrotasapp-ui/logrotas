/**
 * Persistência local (localStorage) para calculadoras offline.
 */

export const OFFLINE_KEYS = {
  viagem: "logrotas_offline_viagem",
  frete: "logrotas_offline_frete",
  otimizar: "logrotas_offline_otimizar",
};

export function readOfflineCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeOfflineCache(key, payload) {
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    /* quota / modo privado */
  }
}
