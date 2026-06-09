import { readOfflineCache, writeOfflineCache, OFFLINE_KEYS } from "./offlineStorage.js";

function getParadaStatus(p) {
  if (p?.status) return p.status;
  if (p?.entregue) return "entregue";
  return "pendente";
}

export function countNavProgress(paradas = []) {
  const pendentesCount = paradas.filter((p) => getParadaStatus(p) === "pendente").length;
  const paradaAtualIdx = paradas.findIndex((p) => getParadaStatus(p) === "pendente");
  return { pendentesCount, paradaAtualIdx };
}

/**
 * @param {{
 *   active: boolean,
 *   modoNavegacao?: boolean,
 *   paradas?: Array,
 *   resultado?: object|null,
 *   posicaoMotorista?: [number,number]|null,
 *   viewNav?: string,
 * }} session
 */
export function writeNavigationSession(session) {
  const paradas = session.paradas || [];
  const { pendentesCount, paradaAtualIdx } = countNavProgress(paradas);
  const payload = {
    active: !!session.active && pendentesCount > 0,
    modoNavegacao: !!session.modoNavegacao,
    paradas,
    resultado: session.resultado ?? null,
    posicaoMotorista: session.posicaoMotorista ?? null,
    viewNav: session.viewNav || "mapa",
    pendentesCount,
    paradaAtualIdx,
    totalParadas: paradas.length,
  };
  writeOfflineCache(OFFLINE_KEYS.navegacao, payload);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("logrotas-nav-update", { detail: payload }));
  }
  return payload;
}

export function readNavigationSession() {
  const raw = readOfflineCache(OFFLINE_KEYS.navegacao);
  if (!raw?.paradas?.length) return null;
  const { pendentesCount, paradaAtualIdx } = countNavProgress(raw.paradas);
  if (pendentesCount === 0) return null;
  return {
    ...raw,
    pendentesCount,
    paradaAtualIdx,
    totalParadas: raw.paradas.length,
    active: raw.active !== false,
  };
}

export function clearNavigationSession() {
  try {
    localStorage.removeItem(OFFLINE_KEYS.navegacao);
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("logrotas-nav-update", { detail: null }));
  }
}
