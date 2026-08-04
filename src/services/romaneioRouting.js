/**
 * Ponte romaneio → roteirizador (sem dependência de APIs).
 * Usado pelo routingService e por testes Node.
 */
import {
  parseAddressesFromRomaneioText,
  parseDeliveryAddressesFromLabelText,
  parseDeliveryEntriesFromLabelText,
  normalizeAddressesForRouting,
  cleanAddressLine,
  assessVisionOcrConfidence,
  parseClaudeDeliveryEntriesResponse,
  entriesMissingDestinatarioNome,
} from "./romaneioParser.js";
import { createPacote, deriveParadaFromPacotes } from "./pacotesService.js";

export {
  cleanAddressLine,
  normalizeAddressesForRouting,
  parseDeliveryAddressesFromLabelText,
  parseDeliveryEntriesFromLabelText,
  assessVisionOcrConfidence,
  parseClaudeDeliveryEntriesResponse,
  entriesMissingDestinatarioNome,
};

export function parseRomaneioTextToDestinations(rawText) {
  return parseAddressesFromRomaneioText(rawText);
}

export function buildParadasFromAddresses(addresses, idBase = Date.now()) {
  const cleaned = normalizeAddressesForRouting(
    Array.isArray(addresses) ? addresses : []
  );
  return cleaned.map((endereco, i) =>
    deriveParadaFromPacotes({
      id: idBase + i,
      endereco,
      pacotes: [createPacote("")],
    })
  );
}

/** V256 — paradas com pacote inicial (nome/complemento opcionais do destinatário). */
export function buildParadasFromEntries(entries, idBase = Date.now()) {
  const list = Array.isArray(entries) ? entries : [];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    const endereco =
      typeof entry === "string" ? cleanAddressLine(entry) : cleanAddressLine(entry?.endereco || "");
    if (!endereco || endereco.length < 10) continue;
    const nome = typeof entry === "string" ? "" : entry?.nome || "";
    const complemento = typeof entry === "string" ? "" : entry?.complemento || "";
    out.push(
      deriveParadaFromPacotes({
        id: idBase + i,
        endereco,
        pacotes: [createPacote(nome, "", complemento)],
      })
    );
  }
  return out;
}
