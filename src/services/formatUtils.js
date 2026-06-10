/** Arredonda valor monetário para 2 casas decimais. */
export function roundMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
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
    const custoTotal = roundMoney(energyCost + tollCost + arlaCost);
    const freteSugerido = roundMoney(item.freteSugerido || 0);
    const lucro = roundMoney(freteSugerido - custoTotal);
    return { ...item, energyCost, tollCost, arlaCost, custoTotal, freteSugerido, lucro };
  }

  const custoTotal = roundMoney(item.custoTotal || 0);
  const freteSugerido = roundMoney(item.freteSugerido || 0);
  const lucro = roundMoney(freteSugerido - custoTotal);
  return { ...item, custoTotal, freteSugerido, lucro };
}
