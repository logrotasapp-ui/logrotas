/**
 * V171 — Calculadora de Viagem (lógica local; rede via routingService).
 */
import { parseNumeroBR } from "./formatUtils.js";
import {
  CALC_VIAGEM,
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

  if (!isElec && !(cons > 0)) {
    return {
      ok: false,
      error:
        "⚠️ Não foi possível calcular: consumo do veículo inválido. Confira o cadastro do veículo no seu perfil.",
    };
  }

  const custoComb = isElec
    ? (dist / 100) * cons * preco
    : (dist / cons) * preco;

  const totalEixos = totalEixosPedagio({ vehicleId, vehicleAxles, trailerExtra });
  const custoPed = custoPedagioEscalado(pedagioTotalReais, {
    vehicleId,
    vehicleAxles,
    trailerExtra,
    context: CALC_VIAGEM,
  });
  const custoKmRaw = Number(input.custoKmVeiculo);
  const custoKmVeiculo =
    Number.isFinite(custoKmRaw) && custoKmRaw > 0 ? custoKmRaw : 0;
  const custoVeiculo =
    custoKmVeiculo > 0 && dist > 0 ? custoKmVeiculo * dist : 0;
  const total = custoComb + custoPed + custoVeiculo;

  return {
    ok: true,
    result: {
      dist,
      custoComb,
      custoPed,
      custoVeiculo,
      custoKmVeiculo,
      total,
      litros: isElec ? null : dist / cons,
      cons,
      totalAxles: totalEixos,
      pedagioDescricao: descricaoPedagioResultado({
        vehicleId,
        vehicleLabel,
        totalEixos,
        trailerExtra,
      }),
    },
  };
}
