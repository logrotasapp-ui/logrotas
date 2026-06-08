import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase.js";

const COLLECTION = "betaCodes";

export function normalizeBetaCode(raw) {
  return String(raw || "").trim().toUpperCase();
}

/** Valida se o código existe e ainda não foi usado (passo 1 do cadastro). */
export async function validateBetaCode(rawCode) {
  const code = normalizeBetaCode(rawCode);
  if (!code) {
    return { ok: false, error: "Informe seu código de acesso beta." };
  }

  const snap = await getDoc(doc(db, COLLECTION, code));
  if (!snap.exists()) {
    return { ok: false, error: "Código inválido. Verifique e tente novamente." };
  }

  if (snap.data()?.used === true) {
    return { ok: false, error: "Este código já foi utilizado." };
  }

  return { ok: true, code };
}

/** Marca o código como usado após criar conta (passo 3). Transação atômica. */
export async function consumeBetaCode(rawCode, email) {
  const code = normalizeBetaCode(rawCode);
  const usedBy = String(email || "").trim().toLowerCase();
  if (!code || !usedBy) {
    return { ok: false, error: "Código ou e-mail inválido." };
  }

  try {
    await runTransaction(db, async (transaction) => {
      const ref = doc(db, COLLECTION, code);
      const snap = await transaction.get(ref);
      if (!snap.exists()) {
        throw Object.assign(new Error("invalid"), { reason: "invalid" });
      }
      if (snap.data()?.used === true) {
        throw Object.assign(new Error("used"), { reason: "used" });
      }
      transaction.update(ref, {
        used: true,
        usedBy,
        usedAt: serverTimestamp(),
      });
    });
    return { ok: true, code };
  } catch (e) {
    if (e?.reason === "invalid") {
      return { ok: false, error: "Código inválido. Verifique e tente novamente." };
    }
    if (e?.reason === "used") {
      return { ok: false, error: "Este código já foi utilizado." };
    }
    return { ok: false, error: "Não foi possível confirmar o código. Tente novamente." };
  }
}
