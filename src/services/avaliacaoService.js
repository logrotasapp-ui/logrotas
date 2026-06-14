import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase.js";
import { readOfflineCache, writeOfflineCache, OFFLINE_KEYS } from "./offlineStorage.js";

const LOCAL_KEY = OFFLINE_KEYS.avaliacao;
const PENDING_KEY = OFFLINE_KEYS.avaliacaoPendentes;
const PRIMEIRA_SOLICITACAO_EM = 3;
const CONCLUSOES_APOS_DISPENSA = 3;
const SILENCIO_DIAS = 30;
const MAX_AVALIACOES = 2;

export const CALCULADORA_ORIGENS = {
  viagem: "viagem",
  frete: "frete",
  roteirizacao: "roteirizacao",
};

function estadoPadrao() {
  return {
    conclusoesCalculadora: 0,
    avaliacoesEnviadas: 0,
    ultimaAvaliacaoEnviadaEm: null,
    proximaSolicitacaoEmConclusao: PRIMEIRA_SOLICITACAO_EM,
  };
}

function normalizarEstado(raw) {
  const base = estadoPadrao();
  if (!raw || typeof raw !== "object") return base;
  return {
    conclusoesCalculadora: Math.max(0, parseInt(raw.conclusoesCalculadora, 10) || 0),
    avaliacoesEnviadas: Math.max(0, parseInt(raw.avaliacoesEnviadas, 10) || 0),
    ultimaAvaliacaoEnviadaEm: raw.ultimaAvaliacaoEnviadaEm || null,
    proximaSolicitacaoEmConclusao:
      Math.max(1, parseInt(raw.proximaSolicitacaoEmConclusao, 10) || PRIMEIRA_SOLICITACAO_EM),
  };
}

function buildAvaliacaoPayload(uid, { nota, comentario = "", calculadora = "", perfil = {} }) {
  const n = parseInt(nota, 10);
  return {
    uid: String(uid),
    nome: String(perfil?.nome?.trim() || ""),
    email: String(perfil?.email?.trim() || ""),
    nota: n,
    comentario: String(comentario || "").trim(),
    calculadora: String(calculadora || ""),
    criadoEm: serverTimestamp(),
  };
}

function readPendentesLocal() {
  const raw = readOfflineCache(PENDING_KEY);
  return Array.isArray(raw) ? raw : [];
}

function writePendentesLocal(lista) {
  writeOfflineCache(PENDING_KEY, Array.isArray(lista) ? lista : []);
}

function queueAvaliacaoPendente(uid, dados) {
  const n = parseInt(dados.nota, 10);
  const item = {
    uid: String(uid),
    nome: String(dados.perfil?.nome?.trim() || ""),
    email: String(dados.perfil?.email?.trim() || ""),
    nota: n,
    comentario: String(dados.comentario || "").trim(),
    calculadora: String(dados.calculadora || ""),
    enfileiradoEm: new Date().toISOString(),
  };
  const pendentes = readPendentesLocal();
  pendentes.push(item);
  writePendentesLocal(pendentes);
  return item;
}

async function persistirAvaliacaoFirestore(uid, dados) {
  const payload = buildAvaliacaoPayload(uid, dados);
  await addDoc(collection(db, "avaliacoes"), payload);
}

async function marcarAvaliacaoEnviada(uid) {
  const state = await loadAvaliacaoState(uid);
  const agora = new Date().toISOString();
  const atualizado = {
    ...state,
    avaliacoesEnviadas: state.avaliacoesEnviadas + 1,
    ultimaAvaliacaoEnviadaEm: agora,
  };
  await saveAvaliacaoState(uid, atualizado);
  return atualizado;
}

export function readAvaliacaoStateLocal() {
  return normalizarEstado(readOfflineCache(LOCAL_KEY));
}

export function writeAvaliacaoStateLocal(state) {
  writeOfflineCache(LOCAL_KEY, normalizarEstado(state));
}

function diasDesde(iso) {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / (1000 * 60 * 60 * 24);
}

export function deveExibirAvaliacao(state, sessaoJaInteragiu = false) {
  const s = normalizarEstado(state);
  if (sessaoJaInteragiu) return false;
  if (s.avaliacoesEnviadas >= MAX_AVALIACOES) return false;
  if (s.avaliacoesEnviadas >= 1 && diasDesde(s.ultimaAvaliacaoEnviadaEm) < SILENCIO_DIAS) {
    return false;
  }
  if (s.conclusoesCalculadora < s.proximaSolicitacaoEmConclusao) return false;
  return true;
}

export async function loadAvaliacaoState(uid) {
  if (!uid) return estadoPadrao();
  try {
    const snap = await getDoc(doc(db, "users", uid));
    const remoto = snap.exists() ? snap.data()?.avaliacao : null;
    if (remoto) {
      const state = normalizarEstado(remoto);
      writeAvaliacaoStateLocal(state);
      return state;
    }
  } catch (err) {
    console.error("[Avaliacao] Falha ao carregar estado remoto:", err);
  }
  return readAvaliacaoStateLocal();
}

export async function saveAvaliacaoState(uid, state) {
  const payload = normalizarEstado(state);
  writeAvaliacaoStateLocal(payload);
  if (!uid) return payload;
  try {
    await setDoc(
      doc(db, "users", uid),
      { avaliacao: payload, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch (err) {
    console.error("[Avaliacao] Falha ao salvar estado remoto:", err);
  }
  return payload;
}

/**
 * Incrementa contador de conclusões e indica se o modal deve ser exibido.
 * @returns {{ shouldShow: boolean, state: object }}
 */
export async function registrarConclusaoCalculadora(uid, origem, sessaoJaInteragiu = false) {
  const state = await loadAvaliacaoState(uid);
  const atualizado = {
    ...state,
    conclusoesCalculadora: state.conclusoesCalculadora + 1,
  };
  await saveAvaliacaoState(uid, atualizado);
  const shouldShow = deveExibirAvaliacao(atualizado, sessaoJaInteragiu);
  return { shouldShow, state: atualizado, origem };
}

export async function dispensarAvaliacao(uid) {
  const state = await loadAvaliacaoState(uid);
  const atualizado = {
    ...state,
    proximaSolicitacaoEmConclusao: state.conclusoesCalculadora + CONCLUSOES_APOS_DISPENSA,
  };
  await saveAvaliacaoState(uid, atualizado);
  return atualizado;
}

/** Reenvia avaliações enfileiradas localmente após falha de rede/permissão. */
export async function reenviarAvaliacoesPendentes(uid) {
  if (!uid) return { enviadas: 0, restantes: 0 };
  const pendentes = readPendentesLocal().filter((p) => p.uid === uid);
  if (!pendentes.length) return { enviadas: 0, restantes: 0 };

  const restantes = [];
  let enviadas = 0;

  for (const item of pendentes) {
    try {
      await persistirAvaliacaoFirestore(uid, {
        nota: item.nota,
        comentario: item.comentario,
        calculadora: item.calculadora,
        perfil: { nome: item.nome, email: item.email },
      });
      enviadas += 1;
    } catch (err) {
      console.error("[Avaliacao] Falha ao reenviar pendente:", err, item);
      restantes.push(item);
    }
  }

  const outros = readPendentesLocal().filter((p) => p.uid !== uid);
  writePendentesLocal([...outros, ...restantes]);

  if (enviadas > 0) {
    try {
      const state = await loadAvaliacaoState(uid);
      const agora = new Date().toISOString();
      await saveAvaliacaoState(uid, {
        ...state,
        avaliacoesEnviadas: state.avaliacoesEnviadas + enviadas,
        ultimaAvaliacaoEnviadaEm: agora,
      });
    } catch (err) {
      console.error("[Avaliacao] Falha ao atualizar estado após reenvio:", err);
    }
  }

  return { enviadas, restantes: restantes.length };
}

export async function enviarAvaliacao(uid, { nota, comentario = "", calculadora, perfil = {} }) {
  if (!uid) throw new Error("uid obrigatório");
  const n = parseInt(nota, 10);
  if (n < 1 || n > 5) throw new Error("Nota inválida");

  try {
    await persistirAvaliacaoFirestore(uid, { nota: n, comentario, calculadora, perfil });
  } catch (err) {
    console.error("[Avaliacao] Falha ao gravar no Firestore:", err, {
      uid,
      nota: n,
      calculadora,
    });
    queueAvaliacaoPendente(uid, { nota: n, comentario, calculadora, perfil });
    throw err;
  }

  const atualizado = await marcarAvaliacaoEnviada(uid);

  try {
    await reenviarAvaliacoesPendentes(uid);
  } catch (err) {
    console.error("[Avaliacao] Falha ao processar fila pendente:", err);
  }

  return atualizado;
}
