/**
 * V171 — Calculadora de Viagem (lógica local; rede via routingService).
 */
import { parseNumeroBR } from "./formatUtils.js";

/**
 * @returns {{ ok: true, result: object } | { ok: false, error: string }}
 */
export function calculateTripCosts(input) {
  const {
    distanciaKm,
    isElec,
    consumo,
    defaultConsumo,
    combustivelPreco,
    pedagioTotalReais,
    totalAxles,
  } = input;

  // V235 — entrada tolerante: aceita "6,4", "6.4", "1.250", "1.234,56", "R$ 6,49"
  if (!distanciaKm || parseNumeroBR(distanciaKm) <= 0) {
    return { ok: false, error: "⚠️ Preencha a distância em km." };
  }
  if (!combustivelPreco || parseNumeroBR(combustivelPreco) <= 0) {
    return {
      ok: false,
      error: `⚠️ Preencha o preço do ${isElec ? "kWh" : "combustível"}.`,
    };
  }

  const cons = parseNumeroBR(consumo) || (isElec ? 0.2 : defaultConsumo);
  const dist = parseNumeroBR(distanciaKm);
  const preco = parseNumeroBR(combustivelPreco);

  const custoComb = isElec
    ? (dist / 100) * cons * preco
    : (dist / cons) * preco;
  // V234 — pedágio POR EIXO: o valor informado é a tarifa base (1 eixo);
  // escala com os eixos do veículo (carretinha = +1 eixo)
  const eixos = Math.max(1, parseInt(totalAxles, 10) || 1);
  const custoPed = (parseNumeroBR(pedagioTotalReais) || 0) * eixos;
  const total = custoComb + custoPed;

  return {
    ok: true,
    result: {
      dist,
      custoComb,
      custoPed,
      total,
      litros: isElec ? null : dist / cons,
      cons,
      totalAxles: eixos,
    },
  };
}

