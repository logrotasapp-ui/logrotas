/**
 * Ponte romaneio → roteirizador (sem dependência de APIs).
 * Usado pelo routingService e por testes Node.
 */
import {
  parseAddressesFromRomaneioText,
  normalizeAddressesForRouting,
  cleanAddressLine,
} from "./romaneioParser.js";

export { cleanAddressLine, normalizeAddressesForRouting };

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
