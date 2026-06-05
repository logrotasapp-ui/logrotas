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
  const custoPed = (parseFloat(pedagioTotalReais) || 0) * (roundTrip ? 2 : 1);
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

