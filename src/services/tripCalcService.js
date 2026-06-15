/**
 * V171 — Calculadora de Viagem (lógica local; rede via routingService).
 */
import { parseNumeroBR } from "./formatUtils.js";
import {
  custoPedagioEscalado,
  descricaoPedagioResultado,
  totalEixosPedagio,
} from "./pedagioCalcService.js";

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
    vehicleId,
    vehicleLabel,
    vehicleAxles,
    trailerExtra = 0,
  } = input;

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

  const totalEixos = totalEixosPedagio({ vehicleId, vehicleAxles, trailerExtra });
  const custoPed = custoPedagioEscalado(pedagioTotalReais, { vehicleId, totalEixos });
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
      totalAxles: totalEixos,
      pedagioDescricao: descricaoPedagioResultado({ vehicleId, vehicleLabel, totalEixos }),
    },
  };
}
