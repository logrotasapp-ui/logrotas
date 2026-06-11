import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase.js";

const COLLECTION = "checklists";

export const CHECKLIST_PERGUNTAS_PADRAO = [
  { texto: "O veículo possui avarias visíveis na lataria?", resposta: null },
  { texto: "As chaves e documentos estão disponíveis?", resposta: null },
  { texto: "Há objetos soltos ou pertences no interior?", resposta: null },
];

export const CHECKLIST_ACESSORIOS_PADRAO = [
  "Calotas",
  "Roda de liga leve",
  "Rádio/Multimídia",
  "Banco",
  "Tapete",
  "Buzina",
  "Chave de roda",
  "Macaco",
  "Triângulo",
  "Estepe",
];

export const CHECKLIST_ESTADOS_ACESSORIO = ["bom", "ausente", "quebrado", "na"];
export const CHECKLIST_ESTADOS_PNEU = ["bom", "regular", "ruim"];
export const CHECKLIST_NIVEIS_COMBUSTIVEL = ["vazio", "1/4", "1/2", "3/4", "cheio"];

export const CHECKLIST_TIPOS_SERVICO = [
  { id: "reboque_leve", label: "Reboque leve" },
  { id: "reboque_pesado", label: "Reboque pesado" },
  { id: "pane_seca", label: "Pane seca" },
  { id: "bateria", label: "Bateria" },
  { id: "outro", label: "Outro" },
];

export const CHECKLIST_MOTIVOS = [
  { id: "pane", label: "Pane" },
  { id: "colisao", label: "Colisão" },
  { id: "furto_roubo", label: "Furto/Roubo" },
  { id: "transporte", label: "Transporte" },
  { id: "outro", label: "Outro" },
];

export const CHECKLIST_FOTO_SLOTS = [
  { id: "frente", label: "Frente", obrigatoria: true, emoji: "⬆️" },
  { id: "traseira", label: "Traseira", obrigatoria: true, emoji: "⬇️" },
  { id: "lateral_esquerda", label: "Lateral Esquerda", obrigatoria: true, emoji: "⬅️" },
  { id: "lateral_direita", label: "Lateral Direita", obrigatoria: true, emoji: "➡️" },
  { id: "guincho", label: "Veículo no Guincho", obrigatoria: true, emoji: "🪝" },
  { id: "avarias", label: "Avarias", obrigatoria: false, emoji: "💥", multipla: true },
];

export const CHECKLIST_ENTREGA_FOTO_SLOTS = [
  { id: "frente", label: "Frente", obrigatoria: true, emoji: "⬆️" },
  { id: "traseira", label: "Traseira", obrigatoria: true, emoji: "⬇️" },
  { id: "lateral_esquerda", label: "Lateral Esquerda", obrigatoria: true, emoji: "⬅️" },
  { id: "lateral_direita", label: "Lateral Direita", obrigatoria: true, emoji: "➡️" },
  { id: "avarias", label: "Avarias da entrega", obrigatoria: false, emoji: "💥", multipla: true },
];

export const CHECKLIST_FOTOS_OBRIGATORIAS = CHECKLIST_FOTO_SLOTS.filter((s) => s.obrigatoria).map((s) => s.id);

function assinaturaVazia() {
  return { nome: "", documento: "", imagemUrl: "", dataHora: "", lat: null, lng: null };
}

function colRef(uid) {
  return collection(db, "users", uid, COLLECTION);
}

function stripMeta(data) {
  const { id, criadoEm, atualizadoEm, ...rest } = data || {};
  return rest;
}

/** Firestore rejeita campos `undefined` — remove recursivamente antes de gravar. */
function sanitizeFirestoreData(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeFirestoreData(item)).filter((item) => item !== undefined);
  }
  const out = {};
  Object.entries(value).forEach(([key, val]) => {
    if (val === undefined) return;
    const cleaned = sanitizeFirestoreData(val);
    if (cleaned !== undefined) out[key] = cleaned;
  });
  return out;
}

function buildColetaVazia() {
  return {
    perguntas: CHECKLIST_PERGUNTAS_PADRAO.map((p) => ({ ...p })),
    acessorios: CHECKLIST_ACESSORIOS_PADRAO.map((item) => ({ item, estado: null })),
    pneus: { dianteiro: null, traseiro: null, estepe: null },
    combustivel: null,
    observacoes: "",
    fotos: [],
    assinaturas: {
      responsavel: assinaturaVazia(),
      prestador: assinaturaVazia(),
    },
    finalizadaEm: null,
  };
}

function buildEntregaVazia() {
  return {
    fotos: [],
    recebedor: { nome: "", documento: "", mesmaPessoaColeta: null },
    conferencia: null,
    assinaturas: {
      recebedor: assinaturaVazia(),
      prestador: assinaturaVazia(),
    },
    finalizadaEm: null,
  };
}

/**
 * Mescla coleta salva (incl. parcial/legado) com defaults da vistoria.
 * Suporta campos legados no nível raiz do documento (perguntas, acessorios, etc.).
 */
export function normalizeColetaData(coleta, checklistRoot = {}) {
  const base = coleta && typeof coleta === "object" ? coleta : {};
  const legacy = checklistRoot && typeof checklistRoot === "object" ? checklistRoot : {};

  const rawPerguntas =
    (Array.isArray(base.perguntas) && base.perguntas.length > 0 && base.perguntas) ||
    (Array.isArray(legacy.perguntas) && legacy.perguntas.length > 0 && legacy.perguntas) ||
    null;

  const perguntas = CHECKLIST_PERGUNTAS_PADRAO.map((padrao, i) => {
    const salva = rawPerguntas?.[i];
    return {
      texto: salva?.texto || padrao.texto,
      resposta: salva?.resposta ?? null,
    };
  });

  const rawAcessorios =
    (Array.isArray(base.acessorios) && base.acessorios.length > 0 && base.acessorios) ||
    (Array.isArray(legacy.acessorios) && legacy.acessorios.length > 0 && legacy.acessorios) ||
    null;

  const acessoriosMap = new Map();
  (rawAcessorios || []).forEach((a) => {
    if (a?.item) acessoriosMap.set(a.item, { item: a.item, estado: a.estado ?? null });
  });
  const acessorios = CHECKLIST_ACESSORIOS_PADRAO.map((item) => ({
    item,
    estado: acessoriosMap.get(item)?.estado ?? null,
  }));

  const rawPneus = base.pneus || legacy.pneus || {};

  return {
    ...base,
    perguntas,
    acessorios,
    pneus: {
      dianteiro: rawPneus.dianteiro ?? null,
      traseiro: rawPneus.traseiro ?? null,
      estepe: rawPneus.estepe ?? null,
    },
    combustivel: base.combustivel ?? legacy.combustivel ?? null,
    observacoes: base.observacoes ?? legacy.observacoes ?? "",
    fotos: Array.isArray(base.fotos) ? base.fotos : [],
    assinaturas: {
      responsavel: { ...assinaturaVazia(), ...base.assinaturas?.responsavel },
      prestador: { ...assinaturaVazia(), ...base.assinaturas?.prestador },
    },
    finalizadaEm: base.finalizadaEm ?? null,
  };
}

/** Mescla entrega salva com defaults; ignora stub legado { enderecoConfirmado }. */
export function normalizeEntregaData(entrega) {
  const base = entrega && typeof entrega === "object" ? entrega : {};
  const legadoStub =
    base.enderecoConfirmado !== undefined &&
    !Array.isArray(base.fotos) &&
    !base.recebedor &&
    !base.conferencia &&
    !base.assinaturas;

  if (legadoStub) return buildEntregaVazia();

  return {
    fotos: Array.isArray(base.fotos) ? base.fotos : [],
    recebedor: {
      nome: "",
      documento: "",
      mesmaPessoaColeta: null,
      ...(base.recebedor || {}),
    },
    conferencia: base.conferencia ?? null,
    assinaturas: {
      recebedor: { ...assinaturaVazia(), ...base.assinaturas?.recebedor },
      prestador: { ...assinaturaVazia(), ...base.assinaturas?.prestador },
    },
    finalizadaEm: base.finalizadaEm || null,
  };
}

async function gerarNumero(uid) {
  const ano = new Date().getFullYear();
  const prefix = `${ano}-`;
  const snap = await getDocs(colRef(uid));
  let maxSeq = 0;
  snap.docs.forEach((d) => {
    const num = d.data()?.numero || "";
    if (String(num).startsWith(prefix)) {
      const seq = parseInt(String(num).slice(prefix.length), 10);
      if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  });
  return `${ano}-${String(maxSeq + 1).padStart(4, "0")}`;
}

function buildNovoDocumento(freteId, dados = {}) {
  return {
    numero: "",
    status: "coleta",
    freteId,
    cliente: {
      nome: dados.cliente?.nome || "",
      telefone: dados.cliente?.telefone || "",
    },
    veiculo: {
      placa: dados.veiculo?.placa || "",
      marca: dados.veiculo?.marca || "",
      modelo: dados.veiculo?.modelo || "",
      cor: dados.veiculo?.cor || "",
    },
    servico: {
      tipo: dados.servico?.tipo || "",
      motivo: dados.servico?.motivo || "",
    },
    origem: { endereco: dados.origem?.endereco || "" },
    destino: { endereco: dados.destino?.endereco || "" },
    coleta: buildColetaVazia(),
    entrega: buildEntregaVazia(),
  };
}

export function coletaCompleta(checklist) {
  const faltando = [];
  if (!checklist) return { completa: false, faltando: ["Checklist não encontrado"] };

  const { cliente, veiculo, servico, origem, destino, coleta } = checklist;

  if (!cliente?.nome?.trim()) faltando.push("Nome do cliente");
  if (!cliente?.telefone?.trim()) faltando.push("Telefone do cliente");
  if (!veiculo?.placa?.trim()) faltando.push("Placa do veículo");
  if (!veiculo?.marca?.trim()) faltando.push("Marca do veículo");
  if (!veiculo?.modelo?.trim()) faltando.push("Modelo do veículo");
  if (!veiculo?.cor?.trim()) faltando.push("Cor do veículo");
  if (!servico?.tipo) faltando.push("Tipo de serviço");
  if (!servico?.motivo) faltando.push("Motivo do serviço");
  if (!origem?.endereco?.trim()) faltando.push("Endereço de origem");
  if (!destino?.endereco?.trim()) faltando.push("Endereço de destino");

  const perguntas = coleta?.perguntas || [];
  perguntas.forEach((p, i) => {
    if (p.resposta !== "sim" && p.resposta !== "nao") {
      faltando.push(`Pergunta ${i + 1}: ${p.texto}`);
    }
  });

  const acessorios = coleta?.acessorios || [];
  acessorios.forEach((a) => {
    if (!a.estado) faltando.push(`Acessório: ${a.item}`);
  });

  if (!coleta?.pneus?.dianteiro) faltando.push("Pneu dianteiro");
  if (!coleta?.pneus?.traseiro) faltando.push("Pneu traseiro");
  if (!coleta?.pneus?.estepe) faltando.push("Estepe");
  if (!coleta?.combustivel) faltando.push("Nível de combustível");

  const fotos = coleta?.fotos || [];
  CHECKLIST_FOTO_SLOTS.filter((s) => s.obrigatoria).forEach((slot) => {
    if (!fotos.some((f) => f.tipo === slot.id && f.url)) {
      faltando.push(`Foto: ${slot.label}`);
    }
  });

  const assin = coleta?.assinaturas || {};
  if (!assin.responsavel?.nome?.trim()) faltando.push("Nome do responsável no local");
  if (!assin.responsavel?.documento?.trim()) faltando.push("Documento do responsável no local");
  if (!assin.responsavel?.imagemUrl) faltando.push("Assinatura do responsável no local");
  if (!assin.prestador?.nome?.trim()) faltando.push("Nome do prestador");
  if (!assin.prestador?.documento?.trim()) faltando.push("Documento do prestador");
  if (!assin.prestador?.imagemUrl) faltando.push("Assinatura do prestador");

  return { completa: faltando.length === 0, faltando };
}

export function entregaCompleta(checklist) {
  const faltando = [];
  if (!checklist) return { completa: false, faltando: ["Checklist não encontrado"] };

  const { entrega } = checklist;
  const fotos = entrega?.fotos || [];

  CHECKLIST_ENTREGA_FOTO_SLOTS.filter((s) => s.obrigatoria).forEach((slot) => {
    if (!fotos.some((f) => f.tipo === slot.id && f.url)) {
      faltando.push(`Foto entrega: ${slot.label}`);
    }
  });

  if (!entrega?.recebedor?.nome?.trim()) faltando.push("Nome de quem recebeu o veículo");
  if (!entrega?.recebedor?.documento?.trim()) faltando.push("Documento de quem recebeu o veículo");

  const conf = entrega?.conferencia;
  if (conf?.conforme !== true && conf?.conforme !== false) {
    faltando.push("Conferência na entrega");
  }
  if (conf?.conforme === false) {
    if (!conf.divergencias?.length) faltando.push("Marque ao menos um item divergente");
  }

  const assin = entrega?.assinaturas || {};
  if (!assin.recebedor?.nome?.trim()) faltando.push("Nome do recebedor (assinatura)");
  if (!assin.recebedor?.documento?.trim()) faltando.push("Documento do recebedor (assinatura)");
  if (!assin.recebedor?.imagemUrl) faltando.push("Assinatura do recebedor");
  if (!assin.prestador?.nome?.trim()) faltando.push("Nome do prestador (entrega)");
  if (!assin.prestador?.documento?.trim()) faltando.push("Documento do prestador (entrega)");
  if (!assin.prestador?.imagemUrl) faltando.push("Assinatura do prestador (entrega)");

  return { completa: faltando.length === 0, faltando };
}

export async function criarChecklist(uid, freteId, dados = {}) {
  if (!uid || !freteId) throw new Error("uid e freteId são obrigatórios");

  const numero = await gerarNumero(uid);
  const payload = buildNovoDocumento(freteId, dados);
  payload.numero = numero;

  const ref = await addDoc(colRef(uid), {
    ...sanitizeFirestoreData(payload),
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  });

  return { id: ref.id, ...payload };
}

export async function atualizarChecklist(uid, checklistId, data) {
  if (!uid || !checklistId) throw new Error("uid e checklistId são obrigatórios");

  const payload = sanitizeFirestoreData(stripMeta(data));
  await updateDoc(doc(db, "users", uid, COLLECTION, checklistId), {
    ...payload,
    atualizadoEm: serverTimestamp(),
  });

  return { id: checklistId, ...payload };
}

export async function buscarChecklistPorFrete(uid, freteId) {
  if (!uid || !freteId) return null;

  const q = query(colRef(uid), where("freteId", "==", freteId));
  const snap = await getDocs(q);
  if (snap.empty) return null;

  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

export async function listarChecklists(uid) {
  if (!uid) return [];

  const snap = await getDocs(colRef(uid));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(b.numero || "").localeCompare(String(a.numero || "")));
}
