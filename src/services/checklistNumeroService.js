import { readOfflineCache, writeOfflineCache } from "./offlineStorage.js";

function seqKey(uid, tipoPrefix) {
  const ano = new Date().getFullYear();
  return `logrotas_checklist_seq_${uid}_${tipoPrefix}_${ano}`;
}

/** Aloca próximo número AV-/FR- localmente (sem Firestore). */
export function alocarNumeroLocal(uid, tipoPrefix) {
  if (!uid || !tipoPrefix) throw new Error("uid e tipoPrefix obrigatórios");
  const key = seqKey(uid, tipoPrefix);
  const atual = readOfflineCache(key);
  const next = (typeof atual === "number" ? atual : parseInt(atual, 10) || 0) + 1;
  writeOfflineCache(key, next);
  const ano = new Date().getFullYear();
  return `${tipoPrefix}-${ano}-${String(next).padStart(4, "0")}`;
}

/** Atualiza contador local após sync remoto com número maior (Fase 3+). */
export function registrarNumeroRemoto(uid, tipoPrefix, numero) {
  const m = String(numero || "").match(new RegExp(`^${tipoPrefix}-(\\d{4})-(\\d{4})$`));
  if (!m) return;
  const seq = parseInt(m[2], 10);
  if (Number.isNaN(seq)) return;
  const key = seqKey(uid, tipoPrefix);
  const atual = readOfflineCache(key);
  const prev = typeof atual === "number" ? atual : parseInt(atual, 10) || 0;
  if (seq > prev) writeOfflineCache(key, seq);
}
