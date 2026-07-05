/**
 * V291 — Fechamento do Dia ("jornadas").
 * V293 — a jornada é autossuficiente no Financeiro (sem duplicar em Despesas):
 *  - o valor recebido entra como RECEITA (somado a partir de `jornadas`);
 *  - combustível + pedágio/outros entram no "Custo das viagens" (a partir de `jornadas`).
 *  Não cria mais despesa vinculada — o custo é lido direto do registro da jornada.
 */
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase.js";
import { HISTORY_COLLECTIONS } from "./userHistoryService.js";
import { parseNumeroBR, roundMoney } from "./formatUtils.js";

/**
 * Combustível estimado da jornada.
 * - Combustão: (km / consumo[km/L]) × preço[R$/L]
 * - Elétrico:  (km / 100) × consumo[kWh/100km] × preço[R$/kWh]
 */
export function calcularCombustivelJornada({ km, consumo, preco, isElec = false }) {
  const k = parseNumeroBR(km) || 0;
  const c = parseNumeroBR(consumo) || 0;
  const p = parseNumeroBR(preco) || 0;
  if (k <= 0 || p <= 0) return 0;
  if (isElec) return roundMoney((k / 100) * c * p);
  if (c <= 0) return 0;
  return roundMoney((k / c) * p);
}

/**
 * Salva a jornada (Fechamento do dia). O custo (combustível + pedágio/outros) fica
 * no próprio registro (`custoTotal`) e é lido pelo Financeiro — não gera despesa.
 * @returns {{ jornada: object }}
 */
export async function saveJornada(uid, dados) {
  if (!uid) throw new Error("Usuário não autenticado.");

  const jornadaRef = await addDoc(
    collection(db, "users", uid, HISTORY_COLLECTIONS.jornadas),
    { ...dados, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
  );

  return { jornada: { id: jornadaRef.id, ...dados } };
}
