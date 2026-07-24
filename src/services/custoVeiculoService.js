/**
 * Custo de ter o veículo por km (sem combustível).
 * Função pura — usada pela UI Meu Veículo e, na etapa 4, por outras telas.
 */
import { parseNumeroBR, roundMoney } from "./formatUtils.js";

/** Médias padrão quando o campo está vazio (nunca inventar zero). */
export const CUSTO_VEICULO_PADROES = {
  kmMes: 2000,
  ipvaAno: 1500,
  seguroAno: 2400,
  pneuValor: 1600,
  pneuVidaKm: 40000,
  oleoValor: 350,
  oleoIntervaloKm: 10000,
  revisaoValor: 600,
  revisaoIntervaloKm: 10000,
  manutencaoKmPadrao: 0.055,
};

/** Mínimo para aceitar a média automática (abaixo disso = amostra fraca → usa padrão). */
export const KM_MES_AUTO_MINIMO = 500;

const LABELS = {
  ipva: "IPVA + licenciamento",
  seguro: "Seguro",
  pneu: "Pneus",
  oleo: "Óleo",
  revisao: "Revisão",
  manutencao: "Manutenção",
};

/** Campo preenchido pelo usuário (não vazio / não NaN). Zero explícito conta como preenchido. */
export function campoPreenchido(raw) {
  if (raw == null) return false;
  if (typeof raw === "number") return Number.isFinite(raw);
  const s = String(raw).trim();
  if (!s) return false;
  return Number.isFinite(parseNumeroBR(s));
}

function resolveValor(raw, padrao) {
  if (!campoPreenchido(raw)) {
    return { valor: padrao, estimado: true };
  }
  const n = typeof raw === "number" ? raw : parseNumeroBR(raw);
  if (!Number.isFinite(n)) {
    return { valor: padrao, estimado: true };
  }
  return { valor: n, estimado: false };
}

function safeDiv(numerador, denominador) {
  const n = Number(numerador);
  const d = Number(denominador);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return 0;
  const r = n / d;
  return Number.isFinite(r) ? r : 0;
}

function parseDataBR(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const p = dateStr.split("/");
  if (p.length !== 3) return null;
  const dia = parseInt(p[0], 10);
  const mes = parseInt(p[1], 10) - 1;
  const ano = parseInt(p[2], 10);
  if (![dia, mes, ano].every(Number.isFinite)) return null;
  const d = new Date(ano, mes, dia);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Soma km de fretes (distance) + jornadas (km) em um mês/ano. */
export function somarKmMes(historicoFretes, jornadas, mes, ano) {
  const fretesKm = (historicoFretes || []).reduce((a, f) => {
    if (!f?.date) return a;
    const p = String(f.date).split("/");
    if (p.length !== 3) return a;
    if (parseInt(p[1], 10) - 1 !== mes || parseInt(p[2], 10) !== ano) return a;
    return a + (Number(f.distance) || 0);
  }, 0);
  const jornadasKm = (jornadas || []).reduce((a, j) => {
    const dt = j?.data || j?.date || "";
    if (!dt) return a;
    const p = String(dt).split("/");
    if (p.length !== 3) return a;
    if (parseInt(p[1], 10) - 1 !== mes || parseInt(p[2], 10) !== ano) return a;
    return a + (Number(j.km) || 0);
  }, 0);
  return fretesKm + jornadasKm;
}

/**
 * Média de km/mês dos últimos 3 meses (calendário).
 * Só aceita automático se média >= KM_MES_AUTO_MINIMO; senão usa padrão estimado.
 * @returns {{ kmMes: number, estimado: boolean, fonte: "auto"|"padrao", totalKm: number, mediaBruta: number }}
 */
export function mediaKmMesUltimos3Meses(historicoFretes, jornadas, agora = new Date()) {
  let totalKm = 0;
  for (let i = 0; i < 3; i++) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    totalKm += somarKmMes(historicoFretes, jornadas, d.getMonth(), d.getFullYear());
  }
  const mediaBruta = totalKm > 0 ? safeDiv(totalKm, 3) : 0;
  if (!(mediaBruta >= KM_MES_AUTO_MINIMO)) {
    return {
      kmMes: CUSTO_VEICULO_PADROES.kmMes,
      estimado: true,
      fonte: "padrao",
      totalKm,
      mediaBruta,
    };
  }
  return {
    kmMes: roundMoney(mediaBruta) || mediaBruta,
    estimado: false,
    fonte: "auto",
    totalKm,
    mediaBruta,
  };
}

/** Soma cost das manutenções com date nos últimos 12 meses. */
export function somaManutencaoUltimos12Meses(manutencoes, agora = new Date()) {
  const limite = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  limite.setFullYear(limite.getFullYear() - 1);
  let total = 0;
  let qtd = 0;
  (manutencoes || []).forEach((m) => {
    const d = parseDataBR(m?.date);
    if (!d || d < limite || d > agora) return;
    const c = Number(m.cost) || 0;
    if (c > 0) {
      total += c;
      qtd += 1;
    }
  });
  return { total: roundMoney(total), qtd };
}

/**
 * Calcula custo de posse do veículo por km.
 * @param {object} params — campos brutos do form + dados auxiliares
 * @returns {{
 *   custoKm: number,
 *   itens: Array<{chave:string,label:string,valorKm:number,estimado:boolean,extra?:object}>,
 *   qtdPreenchidos: number,
 *   qtdTotal: number,
 *   kmMes: number,
 *   kmMesEstimado: boolean,
 *   kmMesFonte: "manual"|"auto"|"padrao",
 *   manutencaoTotal12m: number,
 * }}
 */
export function calcularCustoVeiculo(params = {}) {
  const P = CUSTO_VEICULO_PADROES;

  // Rodagem
  let kmMes;
  let kmMesEstimado;
  let kmMesFonte;
  if (campoPreenchido(params.kmMesManual)) {
    const r = resolveValor(params.kmMesManual, P.kmMes);
    kmMes = r.valor > 0 ? r.valor : P.kmMes;
    kmMesEstimado = r.estimado || !(r.valor > 0);
    kmMesFonte = kmMesEstimado ? "padrao" : "manual";
  } else if (campoPreenchido(params.kmMesAuto) && Number(params.kmMesAuto) > 0) {
    kmMes = Number(params.kmMesAuto);
    kmMesEstimado = params.kmMesAutoEstimado === true;
    kmMesFonte = kmMesEstimado ? "padrao" : "auto";
  } else {
    kmMes = P.kmMes;
    kmMesEstimado = true;
    kmMesFonte = "padrao";
  }
  if (!(kmMes > 0) || !Number.isFinite(kmMes)) {
    kmMes = P.kmMes;
    kmMesEstimado = true;
    kmMesFonte = "padrao";
  }

  const kmAno = kmMes * 12;

  const ipva = resolveValor(params.ipvaAno, P.ipvaAno);
  const seguro = resolveValor(params.seguroAno, P.seguroAno);
  const pneuV = resolveValor(params.pneuValor, P.pneuValor);
  const pneuKmVida = resolveValor(params.pneuVidaKm, P.pneuVidaKm);
  const oleoV = resolveValor(params.oleoValor, P.oleoValor);
  const oleoInt = resolveValor(params.oleoIntervaloKm, P.oleoIntervaloKm);
  const revisaoV = resolveValor(params.revisaoValor, P.revisaoValor);
  const revisaoInt = resolveValor(params.revisaoIntervaloKm, P.revisaoIntervaloKm);

  const ipvaKm = safeDiv(ipva.valor, kmAno);
  const seguroKm = safeDiv(seguro.valor, kmAno);
  const pneuKm = safeDiv(pneuV.valor, pneuKmVida.valor > 0 ? pneuKmVida.valor : P.pneuVidaKm);
  const oleoKm = safeDiv(oleoV.valor, oleoInt.valor > 0 ? oleoInt.valor : P.oleoIntervaloKm);
  const revisaoKm = safeDiv(
    revisaoV.valor,
    revisaoInt.valor > 0 ? revisaoInt.valor : P.revisaoIntervaloKm
  );

  const manutAgg =
    params.manutencaoTotal12m != null
      ? { total: Number(params.manutencaoTotal12m) || 0, qtd: params.manutencaoQtd12m || 0 }
      : somaManutencaoUltimos12Meses(params.manutencoes);

  let manutencaoKm;
  let manutencaoEstimado;
  if (manutAgg.qtd > 0 && manutAgg.total > 0) {
    manutencaoKm = safeDiv(manutAgg.total, kmAno);
    manutencaoEstimado = false;
  } else {
    manutencaoKm = P.manutencaoKmPadrao;
    manutencaoEstimado = true;
  }

  const itens = [
    {
      chave: "ipva",
      label: LABELS.ipva,
      valorKm: roundMoney(ipvaKm),
      estimado: ipva.estimado,
    },
    {
      chave: "seguro",
      label: LABELS.seguro,
      valorKm: roundMoney(seguroKm),
      estimado: seguro.estimado,
    },
    {
      chave: "pneu",
      label: LABELS.pneu,
      valorKm: roundMoney(pneuKm),
      estimado: pneuV.estimado || pneuKmVida.estimado,
    },
    {
      chave: "oleo",
      label: LABELS.oleo,
      valorKm: roundMoney(oleoKm),
      estimado: oleoV.estimado || oleoInt.estimado,
    },
    {
      chave: "revisao",
      label: LABELS.revisao,
      valorKm: roundMoney(revisaoKm),
      estimado: revisaoV.estimado || revisaoInt.estimado,
    },
    {
      chave: "manutencao",
      label: LABELS.manutencao,
      valorKm: roundMoney(manutencaoKm),
      estimado: manutencaoEstimado,
      extra: { total12m: roundMoney(manutAgg.total), qtd: manutAgg.qtd },
    },
  ].map((it) => ({
    ...it,
    valorKm: Number.isFinite(it.valorKm) ? it.valorKm : 0,
  }));

  const custoKm = roundMoney(itens.reduce((s, it) => s + (it.valorKm || 0), 0));

  // 7 = 6 itens de custo + rodagem
  const preenchidosItens = itens.filter((it) => !it.estimado).length;
  const preenchidosRodagem = kmMesEstimado ? 0 : 1;
  const qtdPreenchidos = preenchidosItens + preenchidosRodagem;
  const qtdTotal = 7;

  return {
    custoKm: Number.isFinite(custoKm) ? custoKm : 0,
    itens,
    qtdPreenchidos,
    qtdTotal,
    kmMes,
    kmMesEstimado,
    kmMesFonte,
    manutencaoTotal12m: roundMoney(manutAgg.total),
  };
}

/** Payload para Firestore users/{uid}.custoVeiculo (só campos preenchidos + resultado). */
export function buildCustoVeiculoPersistPayload(form, resultado) {
  const numOrNull = (raw) => {
    if (!campoPreenchido(raw)) return null;
    const n = typeof raw === "number" ? raw : parseNumeroBR(raw);
    return Number.isFinite(n) ? n : null;
  };
  return {
    ipvaAno: numOrNull(form.ipvaAno),
    seguroAno: numOrNull(form.seguroAno),
    pneuValor: numOrNull(form.pneuValor),
    pneuVidaKm: numOrNull(form.pneuVidaKm),
    oleoValor: numOrNull(form.oleoValor),
    oleoIntervaloKm: numOrNull(form.oleoIntervaloKm),
    revisaoValor: numOrNull(form.revisaoValor),
    revisaoIntervaloKm: numOrNull(form.revisaoIntervaloKm),
    kmMesManual: numOrNull(form.kmMesManual),
    custoKm: resultado?.custoKm ?? 0,
    atualizadoEm: new Date().toISOString(),
  };
}

export function formFromCustoVeiculoPersist(saved) {
  const str = (v) => (v == null || v === "" ? "" : String(v));
  if (!saved || typeof saved !== "object") {
    return {
      ipvaAno: "",
      seguroAno: "",
      pneuValor: "",
      pneuVidaKm: "",
      oleoValor: "",
      oleoIntervaloKm: "",
      revisaoValor: "",
      revisaoIntervaloKm: "",
      kmMesManual: "",
    };
  }
  return {
    ipvaAno: str(saved.ipvaAno),
    seguroAno: str(saved.seguroAno),
    pneuValor: str(saved.pneuValor),
    pneuVidaKm: str(saved.pneuVidaKm),
    oleoValor: str(saved.oleoValor),
    oleoIntervaloKm: str(saved.oleoIntervaloKm),
    revisaoValor: str(saved.revisaoValor),
    revisaoIntervaloKm: str(saved.revisaoIntervaloKm),
    kmMesManual: str(saved.kmMesManual),
  };
}
