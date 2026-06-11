/**
 * Extrai e limpa endereços a partir de texto OCR (romaneio).
 * Funções puras — usadas por routingService antes do geocoding.
 */

/** Instrução aplicada na pós-processamento do OCR (Vision não aceita prompt nativo). */
export const VISION_ADDRESS_EXTRACTION_INSTRUCTION =
  "Extraia apenas o endereço de entrega completo desta etiqueta ou romaneio, incluindo rua, número, bairro, cidade, estado e CEP. Ignore nome do destinatário, nome do remetente, código de rastreio e outros dados que não sejam o endereço de entrega.";

const SKIP_LINE =
  /^(total|subtotal|pedido|nota\s*fiscal|nf-?e?|data|hora|romaneio|cliente|cpf|cnpj|pagina|página|qtd|quant|valor|frete|obs|observacao|observação|assinatura|motorista|placa|entregas?)\b/i;

const SKIP_LABEL_LINE =
  /^(destinat[aá]rio|remetente|nome|cliente|para|de|at[eé]ncia|cpf|cnpj|rg|fone|tel\.?|cel\.?|telefone|e-?mail|rastreio|c[oó]digo|rastreamento|tracking|objeto|awb|remessa|peso|volume|dimens[aã]o|altura|largura|comprimento|fr[aá]gil)\s*[:\-–]?/i;

const TRACKING_CODE =
  /\b[A-Z]{2}\s?\d{9}\s?[A-Z]{2}\b|\b\d{13,22}\b/i;

const STREET_HINT =
  /(\b(r\.|rua|av\.|avenida|trav\.|travessa|alameda|rod\.|rodovia|estrada|pça|praça|praca|bc\.|beco|vl\.|vila|lg\.|largo|br-)\b)|(\d{5}-?\d{3})/i;

const LIST_PREFIX = /^\s*(?:\d+\s*[\.\)\]:\-–—]\s*|[•●▪■\-–—]\s*)+/i;
const LABEL_PREFIX = /^(?:end(?:ereço|ereco)?|destino|entrega|parada)\s*[:\-–]\s*/i;

const NOISE_CHARS = /[|§©®™"'`´‘’“”[\]{}<>]+/g;
const ONLY_CEP = /^\d{5}-?\d{3}$/;
const UF_TOKEN =
  /\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/i;

const OCR_TYPOS = [[/São\s+PauIo/gi, "São Paulo"], [/Sao\s+PauIo/gi, "São Paulo"]];

const ABBREV_EXPANSIONS = [
  [/\bR\.\s+/gi, "Rua "],
  [/\bAV\.\s+/gi, "Avenida "],
  [/\bTRAV\.\s+/gi, "Travessa "],
  [/\bAL\.\s+/gi, "Alameda "],
  [/\bROD\.\s+/gi, "Rodovia "],
  [/\bEST\.\s+/gi, "Estrada "],
];

/**
 * Limpa uma linha ou endereço já montado (artefatos de OCR e romaneio).
 * @param {string} text
 * @returns {string}
 */
export function cleanAddressLine(text) {
  if (!text) return "";

  let line = String(text)
    .normalize("NFC")
    .replace(NOISE_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();

  line = line.replace(LIST_PREFIX, "").replace(LABEL_PREFIX, "");
  line = line.replace(/^[#№]\s*/, "");
  line = line.replace(/\s*[,;.\-–—]+\s*$/g, "");
  line = line.replace(/\s*,\s*,+/g, ", ");
  line = line.replace(/\s*-\s*-\s*/g, " - ");

  for (const [pattern, replacement] of ABBREV_EXPANSIONS) {
    line = line.replace(pattern, replacement);
  }
  for (const [pattern, replacement] of OCR_TYPOS) {
    line = line.replace(pattern, replacement);
  }

  return line.replace(/\s+/g, " ").trim();
}

/** Linha de cidade, UF ou CEP que complementa o endereço anterior. */
function isCityOrCepContinuation(line) {
  if (ONLY_CEP.test(line)) return true;
  if (/\d{5}-?\d{3}/.test(line) && line.length < 40) return true;
  if (UF_TOKEN.test(line) && !STREET_HINT.test(line) && line.length < 60) return true;
  return false;
}

function normalizeLine(line) {
  return cleanAddressLine(line);
}

function looksLikePersonNameOnly(line) {
  if (STREET_HINT.test(line) || /\d/.test(line)) return false;
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;
  return words.every((w) => /^[A-ZÀ-Ú][a-zà-ú]{1,}$/.test(w) || /^[A-ZÀ-Ú]{2,}$/.test(w));
}

function looksLikeAddress(line) {
  if (line.length < 8 || line.length > 220) return false;
  if (ONLY_CEP.test(line)) return false;
  if (SKIP_LINE.test(line)) return false;
  if (SKIP_LABEL_LINE.test(line)) return false;
  if (TRACKING_CODE.test(line)) return false;
  if (looksLikePersonNameOnly(line)) return false;
  if (!/[a-zA-ZÀ-ú]/.test(line)) return false;
  if (STREET_HINT.test(line)) return true;
  return /\d/.test(line) && /[a-zA-ZÀ-ú]{3,}/.test(line);
}

function shouldSkipOcrLine(line) {
  if (!line || line.length < 2) return true;
  if (SKIP_LABEL_LINE.test(line)) return true;
  if (TRACKING_CODE.test(line)) return true;
  if (/^\d{10,}$/.test(line.replace(/\s/g, ""))) return true;
  if (looksLikePersonNameOnly(line)) return true;
  return false;
}

function filterOcrTextForDeliveryAddress(rawText) {
  return String(rawText || "")
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter((line) => line && !shouldSkipOcrLine(line))
    .join("\n");
}

function startsNewAddress(line) {
  return (
    LIST_PREFIX.test(line) ||
    STREET_HINT.test(line) ||
    /^\d{1,5}\s*[-–,]?\s*[a-zA-ZÀ-ú]/.test(line)
  );
}

/**
 * Lista final pronta para geocoding (endereços válidos; duplicatas preservadas — V235).
 * @param {string[]} addresses
 * @returns {string[]}
 */
export function normalizeAddressesForRouting(addresses) {
  // V235 — NUNCA deduplicar linhas: cada linha = 1 pacote. O agrupamento de
  // duplicados (texto igual ou geocodificação < 30 m) acontece DEPOIS, na
  // montagem das paradas, somando os pacotes da parada existente (V233).
  const result = [];

  for (const raw of addresses || []) {
    const endereco = cleanAddressLine(raw);
    if (endereco.length < 10) continue;
    if (!looksLikeAddress(endereco)) continue;
    result.push(endereco);
  }

  return result.slice(0, 50);
}

/**
 * @param {string} rawText
 * @returns {string[]}
 */
export function parseAddressesFromRomaneioText(rawText) {
  if (!rawText || !String(rawText).trim()) return [];

  const lines = String(rawText)
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter((l) => l.length > 0);

  const addresses = [];
  let buffer = "";

  for (const line of lines) {
    if (buffer && isCityOrCepContinuation(line)) {
      buffer = `${buffer}, ${line}`;
      continue;
    }

    if (!looksLikeAddress(line)) {
      if (buffer && line.length > 2 && line.length < 80 && !SKIP_LINE.test(line)) {
        buffer = `${buffer}, ${cleanAddressLine(line)}`;
      }
      continue;
    }

    if (startsNewAddress(line)) {
      if (buffer) addresses.push(buffer);
      buffer = line;
    } else if (buffer) {
      buffer = `${buffer}, ${line}`;
    } else {
      buffer = line;
    }
  }

  if (buffer) addresses.push(buffer);

  return normalizeAddressesForRouting(addresses);
}

/**
 * OCR de etiqueta/romaneio (Vision) — extrai só endereço de entrega.
 * @param {string} rawText
 * @returns {string[]}
 */
export function parseDeliveryAddressesFromLabelText(rawText) {
  if (!rawText || !String(rawText).trim()) return [];
  const filtered = filterOcrTextForDeliveryAddress(rawText);
  return parseAddressesFromRomaneioText(filtered || rawText);
}
