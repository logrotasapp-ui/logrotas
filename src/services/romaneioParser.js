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
 * OCR de etiqueta/romaneio — extrai endereço de entrega (e nome do destinatário quando possível).
 * @param {string} rawText
 * @returns {string[]}
 */
export function parseDeliveryAddressesFromLabelText(rawText) {
  if (!rawText || !String(rawText).trim()) return [];
  const filtered = filterOcrTextForDeliveryAddress(rawText);
  return parseAddressesFromRomaneioText(filtered || rawText);
}

const DEST_NOME_LINE =
  /^(?:destinat[aá]rio|para|nome(?:\s+do\s+destinat[aá]rio)?|cliente|at[eé]ncia)\s*[:\-–]\s*(.+)$/i;

function extractNomeFromLine(line) {
  const m = line.match(DEST_NOME_LINE);
  if (m) {
    const nome = cleanAddressLine(m[1]).replace(/\d{5,}/g, "").trim();
    if (nome && !looksLikeAddress(nome) && nome.length >= 3) return nome;
  }
  return "";
}

/**
 * V256 — extrai pares { nome, endereco } do OCR (cada etiqueta/linha = 1 pacote).
 * @param {string} rawText
 * @returns {Array<{ nome: string, endereco: string }>}
 */
export function parseDeliveryEntriesFromLabelText(rawText) {
  if (!rawText || !String(rawText).trim()) return [];

  const lines = String(rawText)
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter((l) => l.length > 0);

  const entries = [];
  let pendingNome = "";
  let buffer = "";

  const flushAddress = () => {
    if (!buffer) return;
    const addrs = normalizeAddressesForRouting([buffer]);
    if (addrs.length) {
      entries.push({ nome: pendingNome || "", endereco: addrs[0] });
      pendingNome = "";
    }
    buffer = "";
  };

  for (const line of lines) {
    if (TRACKING_CODE.test(line)) {
      flushAddress();
      pendingNome = "";
      continue;
    }
    if (SKIP_LINE.test(line)) continue;

    const nomeLabel = extractNomeFromLine(line);
    if (nomeLabel) {
      flushAddress();
      pendingNome = nomeLabel;
      continue;
    }

    if (looksLikePersonNameOnly(line) && !STREET_HINT.test(line)) {
      flushAddress();
      pendingNome = line;
      continue;
    }

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
      flushAddress();
      buffer = line;
    } else if (buffer) {
      buffer = `${buffer}, ${line}`;
    } else {
      buffer = line;
    }
  }
  flushAddress();

  if (entries.length === 0) {
    const addresses = parseDeliveryAddressesFromLabelText(rawText);
    return addresses.map((endereco) => ({ nome: "", endereco }));
  }

  return entries.slice(0, 50);
}

/** V260 — avalia confiança do OCR Vision para decidir fallback Claude. */
export function assessVisionOcrConfidence(rawText, entries) {
  const text = String(rawText || "").trim();
  const list = Array.isArray(entries) ? entries : [];
  const reasons = [];
  let penalty = 0;

  if (!text) {
    return { low: true, score: 0, reasons: ["sem texto"] };
  }

  const textLower = text.toLowerCase();
  if (/^brasil$/i.test(text) || (textLower.includes("brasil") && text.length < 35)) {
    penalty += 45;
    reasons.push("só Brasil");
  }

  if (list.length === 0) {
    penalty += 50;
    reasons.push("nenhuma etiqueta");
  }

  if (text.length < 45) {
    penalty += 20;
    reasons.push("texto vago");
  }

  for (const entry of list) {
    const addr = cleanAddressLine(entry?.endereco || "");
    if (!addr || addr.length < 12) {
      penalty += 20;
      reasons.push("endereço incompleto");
      continue;
    }
    if (/^brasil$/i.test(addr)) {
      penalty += 35;
      reasons.push("endereço só Brasil");
    }
    if (!STREET_HINT.test(addr) && !UF_TOKEN.test(addr)) {
      penalty += 15;
      reasons.push("sem rua ou UF");
    }
    if (!/\d/.test(addr)) {
      penalty += 10;
      reasons.push("sem número");
    }
    if (addr.split(/[,;]/).filter((p) => p.trim()).length < 2 && addr.length < 28) {
      penalty += 12;
      reasons.push("endereço curto");
    }
    if (!looksLikeAddress(addr)) {
      penalty += 25;
      reasons.push("endereço inválido");
    }
  }

  const score = Math.max(0, 100 - penalty);
  const low =
    score < 55 ||
    list.length === 0 ||
    list.every((e) => !cleanAddressLine(e?.endereco || "") || cleanAddressLine(e.endereco).length < 12);

  return { low, score, reasons: [...new Set(reasons)] };
}

/** V260 — interpreta resposta JSON do Claude Haiku ({ nome, endereco }[]). */
export function parseClaudeDeliveryEntriesResponse(responseText) {
  if (!responseText) return [];

  let s = String(responseText).trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(s);
  } catch {
    const match = s.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  const entries = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const endereco = cleanAddressLine(item.endereco || "");
    if (!endereco || endereco.length < 10 || !looksLikeAddress(endereco)) continue;
    let nome = cleanAddressLine(item.nome || "").replace(/\d{5,}/g, "").trim();
    if (nome && looksLikeAddress(nome)) nome = "";
    entries.push({ nome: nome || "", endereco });
  }

  return entries.slice(0, 50);
}
