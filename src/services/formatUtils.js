/**
 * Máscara de quilometragem enquanto digita (pt-BR, inteiro).
 * Só dígitos; ponto de milhar automático. Ex: "40000" → "40.000".
 */
export function formatEnquantoDigitaKm(texto) {
  const digits = String(texto ?? "").replace(/\D/g, "");
  if (!digits) return "";
  let intPart = digits.replace(/^0+/, "");
  if (!intPart) intPart = "0";
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Máscara de dinheiro estilo caixa eletrônico (cents-first, pt-BR).
 * Só dígitos contam; vírgula/ponto digitados são ignorados. Sempre 2 casas decimais.
 * Ex: "5" → "0,05"; "5500" → "55,00"; "550000" → "5.500,00".
 * String vazia (sem dígitos) → "" (campo não preenchido).
 */
export function formatEnquantoDigitaMoeda(texto) {
  const digits = String(texto ?? "").replace(/\D/g, "");
  if (!digits) return "";
  const padded = digits.length < 3 ? digits.padStart(3, "0") : digits;
  const dec = padded.slice(-2);
  let intPart = padded.slice(0, -2).replace(/^0+/, "");
  if (!intPart) intPart = "0";
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${intFormatted},${dec}`;
}

/**
 * V235 — Entrada numérica tolerante (pt-BR e en):
 *  a) "6,4" → 6.4 (vírgula = decimal)
 *  b) "6.4" / "6.49" → decimal (ponto com 1-2 dígitos depois)
 *  c) "1.250" → 1250 (ponto com exatamente 3 dígitos = milhar)
 *  d) "1.234,56" → 1234.56 (com ponto E vírgula, o último separador é o decimal)
 *  e) Ignora espaços e "R$"
 * Entrada inválida → NaN (mesmo comportamento do parseFloat nas validações).
 */
export function parseNumeroBR(texto) {
  if (typeof texto === "number") return texto;
  let s = String(texto ?? "")
    .replace(/r\$/gi, "")
    .replace(/[\s\u00A0]/g, "");
  if (!s) return NaN;

  const temVirgula = s.includes(",");
  const temPonto = s.includes(".");

  if (temVirgula && temPonto) {
    const decimalSep = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
    const milharSep = decimalSep === "," ? "." : ",";
    s = s.split(milharSep).join("").replace(decimalSep, ".");
  } else if (temVirgula) {
    const partes = s.split(",");
    const dec = partes.pop();
    s = `${partes.join("")}.${dec}`;
  } else if (temPonto) {
    const partes = s.split(".");
    if (partes.length > 2) {
      s = partes.join(""); // múltiplos pontos = separador de milhar
    } else {
      const [inteiro, frac] = partes;
      // exatamente 3 dígitos após o ponto = milhar ("1.250"); "0.125" continua decimal
      if (frac.length === 3 && inteiro !== "" && inteiro !== "0" && inteiro !== "-0") {
        s = inteiro + frac;
      }
    }
  }

  const v = parseFloat(s);
  return Number.isFinite(v) ? v : NaN;
}

/** Arredonda valor monetário para 2 casas decimais. */
export function roundMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

/**
 * Normaliza valor já salvo/carregado (reais) para o formato do campo mascarado.
 * Evita "1600" → "16,00" (cents-first cru): interpreta o número em reais e formata.
 * Vazio permanece "" (compatível com campo não preenchido).
 */
export function formatMoedaParaCampo(raw) {
  if (raw == null || String(raw).trim() === "") return "";
  const n = typeof raw === "number" ? raw : parseNumeroBR(raw);
  if (!Number.isFinite(n)) return formatEnquantoDigitaMoeda(String(raw));
  return formatEnquantoDigitaMoeda(String(Math.round(roundMoney(n) * 100)));
}

/**
 * Normaliza km já salvo/carregado para o formato do campo (milhar com ponto).
 * Vazio permanece "".
 */
export function formatKmParaCampo(raw) {
  if (raw == null || String(raw).trim() === "") return "";
  const n = typeof raw === "number" ? raw : parseNumeroBR(raw);
  if (!Number.isFinite(n)) return formatEnquantoDigitaKm(String(raw));
  return formatEnquantoDigitaKm(String(Math.round(Math.abs(n))));
}

/** R$ 1.234,56 */
export function formatMoeda(n) {
  return `R$ ${roundMoney(n).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** R$ 3,50/km */
export function formatMoedaKm(n) {
  return `${formatMoeda(n)}/km`;
}

/** 42.000 km (aceita string ou número) */
export function formatKm(n) {
  const raw = String(n ?? "").replace(/\./g, "").replace(",", ".");
  const v = parseFloat(raw);
  if (!Number.isFinite(v)) return String(n ?? "");
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/** 8,3 km */
export function formatKmDecimal(n, decimals = 1) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${v.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} km`;
}

/** Número decimal pt-BR (ex: 3,5) */
export function formatDecimal(n, decimals = 1) {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n ?? "");
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** R$ 1,85/kWh */
export function formatKwhPrice(n) {
  return `R$ ${formatDecimal(n ?? 0, 2)}/kWh`;
}

/** 3,5 km/L */
export function formatConsumoKmL(n) {
  return `${formatDecimal(n ?? 0, 1)} km/L`;
}

/** plural(2, 'eixo', 'eixos') → "2 eixos" */
export function plural(n, singular, pluralForm) {
  const count = Number(n) || 0;
  if (count === 1) return `1 ${singular}`;
  return `${count} ${pluralForm}`;
}

/** pluralWord(2, 'eixo', 'eixos') → "eixos" */
export function pluralWord(n, singular, pluralForm) {
  return (Number(n) || 0) === 1 ? singular : pluralForm;
}

export function pluralDias(n) {
  const count = Math.abs(Number(n) || 0);
  return count === 1 ? "1 dia" : `${count} dias`;
}

/** Rótulo do gráfico de lucro: valor inteiro abaixo de R$ 10k, "k" a partir de R$ 10k. */
export function formatGraficoLucro(lucro) {
  const v = roundMoney(lucro);
  if (v === 0) return "—";
  const abs = Math.abs(v);
  const sign = v >= 0 ? "+" : "-";
  if (abs >= 10000) {
    const kStr = (abs / 1000).toLocaleString("pt-BR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    });
    return `${sign}R$ ${kStr}k`;
  }
  return `${sign}R$ ${Math.round(abs).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

export function pluralFretes(n) {
  if (n === 0) return "Nenhuma viagem ainda";
  return plural(n, "viagem", "viagens");
}

export function pluralRegistros(n) {
  return plural(n, "registro", "registros");
}

export function pluralDocumentosVencidos(n) {
  if (n === 1) return "1 documento VENCIDO!";
  return `${n} documentos VENCIDOS!`;
}

export function pluralDocumentosVence(n, dias) {
  const doc = n === 1 ? "documento" : "documentos";
  const verb = n === 1 ? "vence" : "vencem";
  return `${n} ${doc} ${verb} em até ${dias} dias`;
}

/** Arredonda custos do frete e recalcula total/lucro antes de salvar. */
export function roundFreteCostsForSave(item) {
  if (!item) return item;
  const hasBreakdown =
    item.energyCost != null ||
    item.tollCost != null ||
    item.arlaCost != null ||
    item.custoComb != null;

  if (hasBreakdown) {
    const energyCost = roundMoney(item.energyCost ?? item.custoComb ?? 0);
    const tollCost = roundMoney(item.tollCost ?? item.pedagio ?? 0);
    const arlaCost = roundMoney(item.arlaCost || 0);
    const custoVeiculo = roundMoney(item.custoVeiculo || 0);
    const custoTotal = roundMoney(energyCost + tollCost + arlaCost + custoVeiculo);
    const freteSugerido = roundMoney(item.freteSugerido || 0);
    const lucro = roundMoney(freteSugerido - custoTotal);
    return { ...item, energyCost, tollCost, arlaCost, custoVeiculo, custoTotal, freteSugerido, lucro };
  }

  const custoTotal = roundMoney(item.custoTotal || 0);
  const freteSugerido = roundMoney(item.freteSugerido || 0);
  const lucro = roundMoney(freteSugerido - custoTotal);
  return { ...item, custoTotal, freteSugerido, lucro };
}
