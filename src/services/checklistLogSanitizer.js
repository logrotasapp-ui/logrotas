/** Mascara documentos (CPF/RG/CNH) em logs — LGPD. */

const SENSITIVE_KEYS = new Set([
  "documento",
  "cpf",
  "rg",
  "cnh",
  "telefone",
  "phone",
  "whatsapp",
]);

export function maskDocumento(val) {
  if (val == null || val === "") return val;
  const s = String(val).trim();
  if (s.length <= 3) return "***";
  return `${s.slice(0, 3)}***`;
}

export function sanitizeChecklistLog(value, depth = 0) {
  if (depth > 10) return "[profundidade-maxima]";
  if (value == null || typeof value !== "object") return value;
  if (value instanceof Error) {
    return { name: value.name, message: value.message, code: value.code };
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeChecklistLog(item, depth + 1));
  }
  const out = {};
  Object.entries(value).forEach(([key, val]) => {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      out[key] = maskDocumento(val);
    } else if (val && typeof val === "object") {
      out[key] = sanitizeChecklistLog(val, depth + 1);
    } else {
      out[key] = val;
    }
  });
  return out;
}

/** Log seguro para fluxos do checklist (mascara PII automaticamente). */
export function logChecklist(level, message, ...rest) {
  const fn = console[level] || console.log;
  if (rest.length === 0) {
    fn(message);
    return;
  }
  fn(message, ...rest.map((item) => sanitizeChecklistLog(item)));
}
