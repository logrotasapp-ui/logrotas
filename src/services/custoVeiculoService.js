/**
 * Custo de ter o veículo por km (sem combustível).
 * Função pura — usada pela UI Meu Veículo e pelas calculadoras (via custoKm salvo).
 * Campo de custo vazio = R$0 (sem estimativa silenciosa). kmMes mantém fallbacks.
 */
import { parseNumeroBR, roundMoney } from "./formatUtils.js";

/** Placeholders de UI + fallback só de rodagem (kmMes). Custos vazios não usam estes valores. */
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

/** Rótulos curtos para aviso nas calculadoras. */
export const CUSTO_CAMPOS_AUSENTES_LABELS = {
  ipva: "IPVA",
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

/** Custo: vazio → 0 ausente; preenchido (incl. 0) → valor do usuário. */
function resolveValor(raw) {
  if (!campoPreenchido(raw)) {
    return { valor: 0, ausente: true };
  }
  const n = typeof raw === "number" ? raw : parseNumeroBR(raw);
  if (!Number.isFinite(n)) {
    return { valor: 0, ausente: true };
  }
  return { valor: n, ausente: false };
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
 * Campo de custo vazio → R$0 e entra em camposAusentes (sem média silenciosa).
 */
export function calcularCustoVeiculo(params = {}) {
  const P = CUSTO_VEICULO_PADROES;

  // Rodagem (exceção: mantém fallbacks)
  let kmMes;
  let kmMesEstimado;
  let kmMesFonte;
  if (campoPreenchido(params.kmMesManual)) {
    const r = resolveValor(params.kmMesManual);
    kmMes = r.valor > 0 ? r.valor : P.kmMes;
    kmMesEstimado = !(r.valor > 0);
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

  const ipva = resolveValor(params.ipvaAno);
  const seguro = resolveValor(params.seguroAno);
  const pneuV = resolveValor(params.pneuValor);
  const pneuKmVida = resolveValor(params.pneuVidaKm);
  const oleoV = resolveValor(params.oleoValor);
  const oleoInt = resolveValor(params.oleoIntervaloKm);
  const revisaoV = resolveValor(params.revisaoValor);
  const revisaoInt = resolveValor(params.revisaoIntervaloKm);

  const ipvaAusente = ipva.ausente;
  const seguroAusente = seguro.ausente;
  const pneuAusente = pneuV.ausente || pneuKmVida.ausente;
  const oleoAusente = oleoV.ausente || oleoInt.ausente;
  const revisaoAusente = revisaoV.ausente || revisaoInt.ausente;

  const ipvaKm = ipvaAusente ? 0 : safeDiv(ipva.valor, kmAno);
  const seguroKm = seguroAusente ? 0 : safeDiv(seguro.valor, kmAno);
  const pneuKm = pneuAusente ? 0 : safeDiv(pneuV.valor, pneuKmVida.valor);
  const oleoKm = oleoAusente ? 0 : safeDiv(oleoV.valor, oleoInt.valor);
  const revisaoKm = revisaoAusente ? 0 : safeDiv(revisaoV.valor, revisaoInt.valor);

  const manutAgg =
    params.manutencaoTotal12m != null
      ? { total: Number(params.manutencaoTotal12m) || 0, qtd: params.manutencaoQtd12m || 0 }
      : somaManutencaoUltimos12Meses(params.manutencoes);

  let manutencaoKm;
  let manutencaoAusente;
  if (manutAgg.qtd > 0 && manutAgg.total > 0) {
    manutencaoKm = safeDiv(manutAgg.total, kmAno);
    manutencaoAusente = false;
  } else {
    manutencaoKm = 0;
    manutencaoAusente = true;
  }

  const itens = [
    {
      chave: "ipva",
      label: LABELS.ipva,
      valorKm: roundMoney(ipvaKm),
      ausente: ipvaAusente,
    },
    {
      chave: "seguro",
      label: LABELS.seguro,
      valorKm: roundMoney(seguroKm),
      ausente: seguroAusente,
    },
    {
      chave: "pneu",
      label: LABELS.pneu,
      valorKm: roundMoney(pneuKm),
      ausente: pneuAusente,
    },
    {
      chave: "oleo",
      label: LABELS.oleo,
      valorKm: roundMoney(oleoKm),
      ausente: oleoAusente,
    },
    {
      chave: "revisao",
      label: LABELS.revisao,
      valorKm: roundMoney(revisaoKm),
      ausente: revisaoAusente,
    },
    {
      chave: "manutencao",
      label: LABELS.manutencao,
      valorKm: roundMoney(manutencaoKm),
      ausente: manutencaoAusente,
      extra: { total12m: roundMoney(manutAgg.total), qtd: manutAgg.qtd },
    },
  ].map((it) => ({
    ...it,
    valorKm: Number.isFinite(it.valorKm) ? it.valorKm : 0,
  }));

  const camposAusentes = itens.filter((it) => it.ausente).map((it) => it.chave);

  const custoKm = roundMoney(itens.reduce((s, it) => s + (it.valorKm || 0), 0));

  // 7 = 6 itens de custo + rodagem
  const preenchidosItens = itens.filter((it) => !it.ausente).length;
  const preenchidosRodagem = kmMesEstimado ? 0 : 1;
  const qtdPreenchidos = preenchidosItens + preenchidosRodagem;
  const qtdTotal = 7;

  return {
    custoKm: Number.isFinite(custoKm) ? custoKm : 0,
    itens,
    camposAusentes,
    qtdPreenchidos,
    qtdTotal,
    kmMes,
    kmMesEstimado,
    kmMesFonte,
    manutencaoTotal12m: roundMoney(manutAgg.total),
  };
}

/** Lê camposAusentes do payload salvo (docs antigos → []). */
export function resolveCamposAusentesSalvo(...sources) {
  for (const s of sources) {
    if (s == null) continue;
    const raw = Array.isArray(s)
      ? s
      : Array.isArray(s?.camposAusentes)
        ? s.camposAusentes
        : Array.isArray(s?.custoVeiculo?.camposAusentes)
          ? s.custoVeiculo.camposAusentes
          : null;
    if (raw) {
      return raw.filter((k) => typeof k === "string" && CUSTO_CAMPOS_AUSENTES_LABELS[k]);
    }
  }
  return [];
}

/** Texto do aviso nas calculadoras. */
export function formatAvisoCamposAusentes(camposAusentes) {
  const list = (camposAusentes || [])
    .map((k) => CUSTO_CAMPOS_AUSENTES_LABELS[k])
    .filter(Boolean);
  if (!list.length) return "";
  return `Não inclui: ${list.join(", ")}. Complete no Perfil do veículo para um cálculo mais preciso.`;
}

function camposAusentesIguais(a, b) {
  const aa = [...(a || [])].sort();
  const bb = [...(b || [])].sort();
  if (aa.length !== bb.length) return false;
  return aa.every((v, i) => v === bb[i]);
}

/** Há dados de custo persistidos (vale migrar/recalcular)? */
export function hasCustoVeiculoPersistido(saved) {
  if (!saved || typeof saved !== "object") return false;
  if (saved.atualizadoEm != null || saved.custoKm != null) return true;
  return [
    "ipvaAno",
    "seguroAno",
    "pneuValor",
    "pneuVidaKm",
    "oleoValor",
    "oleoIntervaloKm",
    "revisaoValor",
    "revisaoIntervaloKm",
    "kmMesManual",
  ].some((k) => saved[k] != null && saved[k] !== "");
}

export function custoPersistDiffers(saved, resultado) {
  if (!resultado) return true;
  const prevKm = Number(saved?.custoKm);
  const nextKm = Number(resultado.custoKm);
  if (!(Number.isFinite(prevKm) && Number.isFinite(nextKm) && prevKm === nextKm)) {
    return true;
  }
  const prevAus = resolveCamposAusentesSalvo(saved);
  return !camposAusentesIguais(prevAus, resultado.camposAusentes || []);
}

/** Payload para Firestore users/{uid}.custoVeiculo (só campos preenchidos + resultado). */
export function buildCustoVeiculoPersistPayload(form, resultado, extras = {}) {
  const numOrNull = (raw) => {
    if (!campoPreenchido(raw)) return null;
    const n = typeof raw === "number" ? raw : parseNumeroBR(raw);
    return Number.isFinite(n) ? n : null;
  };
  const payload = {
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
    camposAusentes: Array.isArray(resultado?.camposAusentes)
      ? [...resultado.camposAusentes]
      : [],
    atualizadoEm: new Date().toISOString(),
  };
  const odo = Number(extras.odometro);
  if (Number.isFinite(odo) && odo > 0) {
    payload.odometro = odo;
    payload.odometroAtualizadoEm =
      extras.odometroAtualizadoEm || new Date().toISOString();
  }
  return payload;
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

/**
 * Lê o custoKm já gravado (users/{uid}.custoVeiculo ou cache). Não recalcula.
 * Aceita o objeto persistido ou um perfil com `.custoVeiculo`.
 * @returns {number} > 0 se configurado; 0 se ausente/inválido
 */
export function resolveCustoKmSalvo(...sources) {
  for (const s of sources) {
    if (s == null) continue;
    const raw =
      typeof s === "number"
        ? s
        : s?.custoKm != null
          ? s.custoKm
          : s?.custoVeiculo?.custoKm;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/** Maior km entre registros de manutenção (+ data desse registro). */
export function maiorKmManutencoes(manutencoes) {
  let maxKm = 0;
  let date = null;
  (manutencoes || []).forEach((m) => {
    const km = Number(m?.km);
    if (!Number.isFinite(km) || km <= 0) return;
    if (km > maxKm) {
      maxKm = km;
      date = m.date || null;
    }
  });
  return maxKm > 0 ? { km: maxKm, date } : null;
}

/**
 * Odômetro exibido = max(manual salvo, maior km dos registros).
 * Não usa fretes/jornadas.
 * @returns {{ km: number|null, origem: "manual"|"registro"|null, atualizadoEm: string|null, dataOrigem: string|null }}
 */
export function resolveOdometroAtual({ odometroSalvo, odometroAtualizadoEm, manutencoes } = {}) {
  const manual = Number(odometroSalvo);
  const hasManual = Number.isFinite(manual) && manual > 0;
  const fromReg = maiorKmManutencoes(manutencoes);
  const regKm = fromReg?.km || 0;
  if (!hasManual && !(regKm > 0)) {
    return { km: null, origem: null, atualizadoEm: null, dataOrigem: null };
  }
  const km = Math.max(hasManual ? manual : 0, regKm);
  if (hasManual && manual >= regKm) {
    return {
      km,
      origem: "manual",
      atualizadoEm: odometroAtualizadoEm || null,
      dataOrigem: null,
    };
  }
  return {
    km,
    origem: "registro",
    atualizadoEm: null,
    dataOrigem: fromReg?.date || null,
  };
}

function parseDataManutencao(dateStr) {
  return parseDataBR(dateStr);
}

function mesesDesde(dateStr, agora = new Date()) {
  const d = parseDataManutencao(dateStr);
  if (!d) return null;
  const meses =
    (agora.getFullYear() - d.getFullYear()) * 12 + (agora.getMonth() - d.getMonth());
  return meses >= 0 ? meses : null;
}

/**
 * Alertas de próxima manutenção por tipo (registro mais recente com nextKm).
 * Com odômetro: faltam = nextKm - km. Sem odômetro: alerta por tempo (meses desde a data).
 */
export function listarProximasManutencoes(manutencoes, odometroKm, agora = new Date()) {
  const byType = new Map();
  (manutencoes || []).forEach((m) => {
    const type = String(m?.type || "").trim();
    if (!type) return;
    const nextKm = Number(m?.nextKm);
    const hasNext = Number.isFinite(nextKm) && nextKm > 0;
    if (!hasNext) return;
    const prev = byType.get(type);
    const d = parseDataManutencao(m.date);
    const prevD = prev ? parseDataManutencao(prev.date) : null;
    const km = Number(m?.km) || 0;
    const prevKm = prev ? Number(prev.km) || 0 : 0;
    let newer = false;
    if (!prev) newer = true;
    else if (d && prevD) newer = d > prevD;
    else if (d && !prevD) newer = true;
    else if (!d && !prevD) newer = km >= prevKm;
    if (newer) byType.set(type, m);
  });

  const hasOdo = Number.isFinite(Number(odometroKm)) && Number(odometroKm) > 0;
  const odo = hasOdo ? Number(odometroKm) : null;

  return Array.from(byType.entries())
    .map(([type, m]) => {
      const nextKm = Number(m.nextKm);
      const meses = mesesDesde(m.date, agora);
      if (hasOdo) {
        const faltam = nextKm - odo;
        let status = "ok";
        if (faltam <= 0) status = "vencido";
        else if (faltam <= 2000) status = "proximo";
        return {
          type,
          nextKm,
          date: m.date || "",
          faltam,
          status,
          modo: "km",
          mesesDesdeUltima: meses,
        };
      }
      return {
        type,
        nextKm,
        date: m.date || "",
        faltam: null,
        status: meses != null && meses >= 12 ? "vencido" : meses != null && meses >= 10 ? "proximo" : "ok",
        modo: "tempo",
        mesesDesdeUltima: meses,
      };
    })
    .sort((a, b) => {
      if (a.modo === "km" && b.modo === "km") return (a.faltam ?? 0) - (b.faltam ?? 0);
      return (b.mesesDesdeUltima ?? 0) - (a.mesesDesdeUltima ?? 0);
    });
}

/** Mescla odômetro no payload de custoVeiculo sem apagar outros campos. */
export function mergeCustoVeiculoOdometro(basePayload, odometro, odometroAtualizadoEm) {
  const base = basePayload && typeof basePayload === "object" ? { ...basePayload } : {};
  const n = Number(odometro);
  if (Number.isFinite(n) && n > 0) {
    base.odometro = n;
    base.odometroAtualizadoEm =
      odometroAtualizadoEm || new Date().toISOString();
  }
  return base;
}
