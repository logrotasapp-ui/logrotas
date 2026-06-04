import { TOLL_PER_AXLE } from "./routingService.js";

/**
 * Calculadora de Viagem — apenas lógica local (sem chamadas de API).
 * Autocomplete e distância de rota: routingService (searchAddresses, fetchDrivingDistanceKm).
 */

/**
 * @returns {{ ok: true, result: object } | { ok: false, error: string }}
 */
export function calculateTripCosts(input) {
  const {
    distanciaKm,
    roundTrip,
    isElec,
    consumo,
    defaultConsumo,
    combustivelPreco,
    pedagioPracas,
    totalAxles,
  } = input;

  if (!distanciaKm || parseFloat(distanciaKm) <= 0) {
    return { ok: false, error: "⚠️ Preencha a distância em km." };
  }
  if (!combustivelPreco || parseFloat(combustivelPreco) <= 0) {
    return {
      ok: false,
      error: `⚠️ Preencha o preço do ${isElec ? "kWh" : "combustível"}.`,
    };
  }

  const cons = parseFloat(consumo) || (isElec ? 0.2 : defaultConsumo);
  const dist = parseFloat(distanciaKm) * (roundTrip ? 2 : 1);
  const preco = parseFloat(combustivelPreco);

  const custoComb = isElec
    ? (dist / 100) * cons * preco
    : (dist / cons) * preco;
  const custoPed =
    (parseInt(pedagioPracas, 10) || 0) * TOLL_PER_AXLE * totalAxles;
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
    },
  };
}

export { TOLL_PER_AXLE };
