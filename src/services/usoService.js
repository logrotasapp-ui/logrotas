import { doc, getDoc, updateDoc, serverTimestamp, increment } from "firebase/firestore";
import { db } from "../firebase.js";

import { getPlanoAtual } from "./planoService.js";

/** Fuso do Brasil para definir o mês corrente (chave YYYY-MM). */
const TZ_BRASIL = "America/Sao_Paulo";

/** Chaves de uso mensal em users/{uid}.usoMensal["2026-07"] */
export const USO_CHAVES = [
  "frete",
  "despesas",
  "manutencao",
  "documentos",
  "checklist",
];

/** Limites do plano FREE (parte B). */
export const FREE_LIMITS = {
  frete: 3,
  despesas: 5,
  manutencao: 3,
  documentos: 3,
  checklist: 2,
};

/** Mensagens padrão de limite FREE (parte B). */
export const MSG_LIMITE = {
  frete:
    "Você atingiu o limite grátis de cálculos de frete deste mês. Assine para uso ilimitado.",
  despesas:
    "Você atingiu o limite grátis de despesas deste mês. Assine para uso ilimitado.",
  manutencao:
    "Você atingiu o limite grátis de manutenções deste mês. Assine para uso ilimitado.",
  documentos:
    "Você atingiu o limite grátis de documentos deste mês. Assine para uso ilimitado.",
  checklist:
    "Você atingiu o limite grátis de checklists deste mês. Assine para uso ilimitado.",
};

function isUsoChaveValida(chave) {
  return USO_CHAVES.includes(chave);
}

/**
 * Chave do mês corrente no fuso America/Sao_Paulo — ex: "2026-07".
 * @param {Date} [date]
 * @returns {string}
 */
export function getMesChaveBrasil(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ_BRASIL,
      year: "numeric",
      month: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}`;
}

function emptyContadoresMes() {
  return {
    frete: 0,
    despesas: 0,
    manutencao: 0,
    documentos: 0,
    checklist: 0,
  };
}

function normalizarContadoresMes(raw) {
  const base = emptyContadoresMes();
  if (!raw || typeof raw !== "object") return base;
  for (const k of USO_CHAVES) {
    const n = parseInt(raw[k], 10);
    base[k] = Number.isFinite(n) && n > 0 ? n : 0;
  }
  return base;
}

/**
 * Lê contadores do mês corrente em users/{uid}.usoMensal.
 * @param {string} uid
 * @returns {Promise<{ mesChave: string, frete: number, despesas: number, manutencao: number, documentos: number, checklist: number }>}
 */
export async function getUsoMes(uid) {
  const mesChave = getMesChaveBrasil();
  const vazio = { mesChave, ...emptyContadoresMes() };
  if (!uid) return vazio;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return vazio;
    const usoMensal = snap.data()?.usoMensal || {};
    const mesData = normalizarContadoresMes(usoMensal[mesChave]);
    return { mesChave, ...mesData };
  } catch {
    return vazio;
  }
}

/**
 * Incrementa +1 o contador da ação no mês corrente (atômico, só sobe).
 * Falha silenciosa offline — não bloqueia o fluxo.
 * @param {string} uid
 * @param {string} chave — frete | despesas | manutencao | documentos | checklist
 */
export async function incrementarUso(uid, chave) {
  if (!uid || !isUsoChaveValida(chave)) return;
  const mesChave = getMesChaveBrasil();
  try {
    await updateDoc(doc(db, "users", uid), {
      [`usoMensal.${mesChave}.${chave}`]: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch {
    /* offline ou doc inexistente */
  }
}

/**
 * Verifica se o usuário ainda pode usar a ação no mês (uso < limite).
 * @param {string} uid
 * @param {string} chave
 * @param {number} limite
 * @returns {Promise<boolean>}
 */
export async function podeUsar(uid, chave, limite) {
  if (!uid || !isUsoChaveValida(chave)) return true;
  if (!Number.isFinite(limite) || limite < 0) return true;
  const uso = await getUsoMes(uid);
  return (uso[chave] || 0) < limite;
}

/**
 * Checa limite mensal só para usuário FREE.
 * @returns {Promise<{ bloqueado: boolean, mensagem: string }>}
 */
export async function checarLimiteFree(uid, perfil, chave) {
  if (getPlanoAtual(perfil).isPago) {
    return { bloqueado: false, mensagem: "" };
  }
  const ok = await podeUsar(uid, chave, FREE_LIMITS[chave]);
  return {
    bloqueado: !ok,
    mensagem: ok ? "" : MSG_LIMITE[chave] || "",
  };
}
