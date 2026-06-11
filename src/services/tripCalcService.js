/**
 * V171 — Calculadora de Viagem (lógica local; rede via routingService).
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
    pedagioTotalReais,
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
  // V234 — pedágio POR EIXO: o valor informado é a tarifa base (1 eixo);
  // escala com os eixos do veículo (carretinha = +1 eixo) e dobra na ida e volta
  const eixos = Math.max(1, parseInt(totalAxles, 10) || 1);
  const custoPed =
    (parseFloat(pedagioTotalReais) || 0) * eixos * (roundTrip ? 2 : 1);
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

