/**
 * Ponte romaneio → roteirizador (sem dependência de APIs).
 * Usado pelo routingService e por testes Node.
 */
import {
  parseAddressesFromRomaneioText,
  parseGeminiRomaneioResponse,
  normalizeAddressesForRouting,
  cleanAddressLine,
} from "./romaneioParser.js";

export {
  cleanAddressLine,
  normalizeAddressesForRouting,
  parseGeminiRomaneioResponse,
};

export function parseRomaneioTextToDestinations(rawText) {
  return parseAddressesFromRomaneioText(rawText);
}

export function buildParadasFromAddresses(addresses, idBase = Date.now()) {
  const cleaned = normalizeAddressesForRouting(
    Array.isArray(addresses) ? addresses : []
  );
  return cleaned.map((endereco, i) => ({
    id: idBase + i,
    endereco,
  }));
}

/**
 * V169 — Paradas a partir da resposta prefixada do Gemini (ok / warn).
 * @param {Array<{ confianca: string, endereco?: string|null }>} items
 */
export function buildParadasFromGeminiItems(items, idBase = Date.now()) {
  const paradas = [];
  let i = 0;

  for (const item of items || []) {
    if (item.confianca === "fail") continue;

    const normalized = normalizeAddressesForRouting(
      item.endereco ? [item.endereco] : []
    );
    if (!normalized.length) continue;

    paradas.push({
      id: idBase + i,
      endereco: normalized[0],
      confianca: item.confianca === "warn" ? "warn" : "ok",
    });
    i += 1;
  }

  return paradas;
}
