/**
 * Extrai candidatos a endereço a partir de texto OCR (romaneio).
 * Função pura — rápida e segura para rodar após o OCR na main thread.
 */

const SKIP_LINE =
  /^(total|subtotal|pedido|nota\s*fiscal|nf-?e?|data|hora|romaneio|cliente|cpf|cnpj|pagina|página|qtd|quant|valor|frete|obs|observacao|observação|assinatura|motorista|placa)\b/i;

const STREET_HINT =
  /(\b(r\.|rua|av\.|avenida|trav\.|travessa|alameda|rod\.|rodovia|estrada|pça|praça|praca|bc\.|beco|vl\.|vila|lg\.|largo|br-)\b)|(\d{5}-?\d{3})/i;

const NOISE_CHARS = /[|§©®™"'`]+/g;

function normalizeLine(line) {
  return line.replace(NOISE_CHARS, " ").replace(/\s+/g, " ").trim();
}

function looksLikeAddress(line) {
  if (line.length < 8 || line.length > 220) return false;
  if (SKIP_LINE.test(line)) return false;
  if (!/[a-zA-ZÀ-ú]/.test(line)) return false;
  if (STREET_HINT.test(line)) return true;
  // Linha com número + texto (ex.: "1234 Centro - São Paulo")
  return /\d/.test(line) && /[a-zA-ZÀ-ú]{3,}/.test(line);
}

function startsNewAddress(line) {
  return STREET_HINT.test(line) || /^\d{1,5}\s*[-–,]?\s*[a-zA-ZÀ-ú]/.test(line);
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
    if (!looksLikeAddress(line)) {
      if (buffer && line.length > 2 && line.length < 80 && !SKIP_LINE.test(line)) {
        buffer = `${buffer}, ${line}`;
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

  const unique = [];
  const seen = new Set();

  for (const addr of addresses) {
    const key = addr.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(addr);
  }

  return unique.slice(0, 50);
}
