/**
 * V291 — Fechamento do Dia ("jornadas").
 * Grava a jornada do motorista de app e alimenta Financeiro/Despesas sem duplicar:
 *  - o valor recebido entra como ENTRADA (somado no Financeiro a partir de `jornadas`);
 *  - combustível + pedágio/outros entram como SAÍDA (1 despesa vinculada por jornada).
 */
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase.js";
import { addDespesaWithFinanceiro, HISTORY_COLLECTIONS } from "./userHistoryService.js";
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
 * Salva a jornada + a despesa vinculada (combustível + pedágio/outros).
 * @returns {{ jornada: object, despesa: object|null }}
 */
export async function saveJornada(uid, dados) {
  if (!uid) throw new Error("Usuário não autenticado.");

  const jornadaRef = await addDoc(
    collection(db, "users", uid, HISTORY_COLLECTIONS.jornadas),
    { ...dados, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
  );
  const jornadaId = jornadaRef.id;

  const custoSaida = roundMoney(
    (dados.combustivelCalculado || 0) + (dados.pedagioOutros || 0)
  );

  let despesa = null;
  if (custoSaida > 0) {
    despesa = await addDespesaWithFinanceiro(uid, {
      categoria: "Combustível",
      descricao: `Fechamento do dia · ${dados.servico || "Jornada"}`,
      valor: custoSaida,
      date: dados.data || "",
      jornadaId,
    });
  }

  return { jornada: { id: jornadaId, ...dados }, despesa };
}
