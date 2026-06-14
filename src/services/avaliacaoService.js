import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase.js";
import { readOfflineCache, writeOfflineCache, OFFLINE_KEYS } from "./offlineStorage.js";

const LOCAL_KEY = OFFLINE_KEYS.avaliacao;
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

export function deveExibirAvaliacao(state, sessaoJaMostrada = false) {
  const s = normalizarEstado(state);
  if (sessaoJaMostrada) return false;
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
  } catch {
    /* fallback local */
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
  } catch {
    /* local já espelhado */
  }
  return payload;
}

/**
 * Incrementa contador de conclusões e indica se o modal deve ser exibido.
 * @returns {{ shouldShow: boolean, state: object }}
 */
export async function registrarConclusaoCalculadora(uid, origem, sessaoJaMostrada = false) {
  const state = await loadAvaliacaoState(uid);
  const atualizado = {
    ...state,
    conclusoesCalculadora: state.conclusoesCalculadora + 1,
  };
  await saveAvaliacaoState(uid, atualizado);
  const shouldShow = deveExibirAvaliacao(atualizado, sessaoJaMostrada);
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

export async function enviarAvaliacao(uid, { nota, comentario = "", calculadora, perfil = {} }) {
  if (!uid) throw new Error("uid obrigatório");
  const n = parseInt(nota, 10);
  if (n < 1 || n > 5) throw new Error("Nota inválida");

  await addDoc(collection(db, "avaliacoes"), {
    uid,
    nome: perfil.nome?.trim() || "",
    email: perfil.email?.trim() || "",
    nota: n,
    comentario: String(comentario || "").trim(),
    calculadora: calculadora || "",
    criadoEm: serverTimestamp(),
  });

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
