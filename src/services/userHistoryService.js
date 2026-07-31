import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase.js";
import { incrementUsageCounter, USAGE_COUNTERS } from "./usageStatsService.js";

export const HISTORY_COLLECTIONS = {
  fretes: "fretes",
  despesas: "despesas",
  manutencao: "manutencao",
  documentos: "documentos",
  financeiro: "financeiro",
  jornadas: "jornadas",
};

/**
 * Campos queryáveis:
 * - fretes/despesas/manutencao/financeiro/jornadas: createdAt (Timestamp)
 *   (negócio: date/data em DD/MM/YYYY — incompatível com where Date)
 * - documentos: expiry (vencimento string DD/MM/YYYY)
 */
const HISTORY_QUERY_SPECS = {
  fretes: { field: "createdAt", days: 90, order: "desc", lim: 100 },
  despesas: { field: "createdAt", days: 90, order: "desc", lim: 100 },
  manutencao: { field: "createdAt", days: 180, order: "desc", lim: 50 },
  documentos: { field: "expiry", days: null, order: "asc", lim: 50 },
  financeiro: { field: "createdAt", days: 90, order: "desc", lim: 100 },
  jornadas: { field: "createdAt", days: 90, order: "desc", lim: 100 },
};

function colRef(uid, name) {
  return collection(db, "users", uid, name);
}

function daysAgoThreshold(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function buildHistoryQuery(uid, name) {
  const spec = HISTORY_QUERY_SPECS[name];
  const parts = [colRef(uid, name)];
  if (spec.days != null) {
    parts.push(where(spec.field, ">=", daysAgoThreshold(spec.days)));
  }
  parts.push(orderBy(spec.field, spec.order));
  parts.push(limit(spec.lim));
  return query(...parts);
}

function mapHistoryDocs(snap) {
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function stripMeta(data) {
  const { id, createdAt, updatedAt, ...rest } = data || {};
  return rest;
}

function sortByDateDesc(items) {
  return [...items].sort((a, b) => {
    const da = a?.date || a?.expiry || "";
    const db_ = b?.date || b?.expiry || "";
    if (da && db_ && da !== db_) {
      const pa = da.split("/").reverse().join("");
      const pb = db_.split("/").reverse().join("");
      return pb.localeCompare(pa);
    }
    return String(b?.id || "").localeCompare(String(a?.id || ""));
  });
}

export async function loadUserHistory(uid) {
  const out = {
    fretes: [],
    despesas: [],
    manutencao: [],
    documentos: [],
    financeiro: [],
    jornadas: [],
  };
  if (!uid) return out;

  // Leitura resiliente: uma coleção que falhar (ex.: regra ainda não deployada)
  // NÃO pode derrubar as demais. Cada coleção é lida isoladamente.
  await Promise.allSettled(
    Object.values(HISTORY_COLLECTIONS).map(async (name) => {
      try {
        const snap = await getDocs(buildHistoryQuery(uid, name));
        out[name] =
          name === HISTORY_COLLECTIONS.documentos
            ? mapHistoryDocs(snap)
            : sortByDateDesc(mapHistoryDocs(snap));
      } catch (err) {
        console.warn(`[LogRotas] Falha ao ler coleção "${name}":`, err?.code || err);
        out[name] = [];
      }
    })
  );

  return out;
}

/** Coleções que alimentam a Home (estado App). */
const HOME_HISTORY_COLLECTIONS = [
  HISTORY_COLLECTIONS.fretes,
  HISTORY_COLLECTIONS.despesas,
  HISTORY_COLLECTIONS.manutencao,
  HISTORY_COLLECTIONS.documentos,
  HISTORY_COLLECTIONS.jornadas,
];

/**
 * Listeners limitados da Home. Retorna unsubscribe de todos.
 */
export function subscribeUserHistory(uid, { onData, onError }) {
  if (!uid) return () => {};

  const state = {
    fretes: [],
    despesas: [],
    manutencao: [],
    documentos: [],
    jornadas: [],
  };
  const unsubs = [];

  for (const name of HOME_HISTORY_COLLECTIONS) {
    const q = buildHistoryQuery(uid, name);
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items =
          name === HISTORY_COLLECTIONS.documentos
            ? mapHistoryDocs(snap)
            : sortByDateDesc(mapHistoryDocs(snap));
        state[name] = items;
        onData({ ...state });
      },
      (err) => {
        console.warn(`[LogRotas] onSnapshot "${name}":`, err?.code || err);
        onError?.(err);
      }
    );
    unsubs.push(unsub);
  }

  return () => {
    unsubs.forEach((u) => {
      try {
        u();
      } catch {
        /* ignore */
      }
    });
  };
}

export async function addHistoryItem(uid, collectionName, data) {
  const payload = stripMeta(data);
  const ref = await addDoc(colRef(uid, collectionName), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: ref.id, ...payload };
}

export async function updateHistoryItem(uid, collectionName, id, data) {
  const payload = stripMeta(data);
  await updateDoc(doc(db, "users", uid, collectionName, id), {
    ...payload,
    updatedAt: serverTimestamp(),
  });
  return { id, ...payload };
}

export async function deleteHistoryItem(uid, collectionName, id) {
  await deleteDoc(doc(db, "users", uid, collectionName, id));
}

async function deleteFinanceiroBySource(uid, sourceCollection, sourceId) {
  const q = query(
    colRef(uid, HISTORY_COLLECTIONS.financeiro),
    where("sourceCollection", "==", sourceCollection),
    where("sourceId", "==", sourceId)
  );
  const snap = await getDocs(q);
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

function financeiroPayload(tipo, sourceCollection, sourceId, data) {
  const base = {
    tipo,
    sourceCollection,
    sourceId,
    date: data.date || data.expiry || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (tipo === "receita") {
    return {
      ...base,
      valor: data.freteSugerido || 0,
      custo: data.custoTotal || 0,
      lucro: data.lucro || 0,
      descricao: [data.origin, data.dest].filter(Boolean).join(" → ") || "Frete",
    };
  }

  if (tipo === "despesa") {
    return {
      ...base,
      valor: data.valor || 0,
      descricao: data.descricao || data.categoria || "Despesa",
      categoria: data.categoria || "",
    };
  }

  return {
    ...base,
    valor: data.cost || 0,
    descricao: data.types?.join(" + ") || data.type || "Manutenção",
    veiculo: data.vehicle || "",
  };
}

export async function addFreteWithFinanceiro(uid, frete) {
  const payload = stripMeta(frete);
  const batch = writeBatch(db);
  const freteRef = doc(colRef(uid, HISTORY_COLLECTIONS.fretes));
  const finRef = doc(colRef(uid, HISTORY_COLLECTIONS.financeiro));

  batch.set(freteRef, {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(
    finRef,
    financeiroPayload("receita", HISTORY_COLLECTIONS.fretes, freteRef.id, payload)
  );
  await batch.commit();
  void incrementUsageCounter(uid, USAGE_COUNTERS.fretes);
  return { id: freteRef.id, ...payload };
}

export async function updateFreteWithFinanceiro(uid, id, frete) {
  const payload = stripMeta(frete);
  await updateHistoryItem(uid, HISTORY_COLLECTIONS.fretes, id, payload);
  await deleteFinanceiroBySource(uid, HISTORY_COLLECTIONS.fretes, id);
  await addDoc(
    colRef(uid, HISTORY_COLLECTIONS.financeiro),
    financeiroPayload("receita", HISTORY_COLLECTIONS.fretes, id, payload)
  );
  return { id, ...payload };
}

export async function deleteFreteWithFinanceiro(uid, id) {
  await deleteFinanceiroBySource(uid, HISTORY_COLLECTIONS.fretes, id);
  await deleteHistoryItem(uid, HISTORY_COLLECTIONS.fretes, id);
}

export async function addDespesaWithFinanceiro(uid, despesa) {
  const payload = stripMeta(despesa);
  const batch = writeBatch(db);
  const despRef = doc(colRef(uid, HISTORY_COLLECTIONS.despesas));
  const finRef = doc(colRef(uid, HISTORY_COLLECTIONS.financeiro));

  batch.set(despRef, {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(
    finRef,
    financeiroPayload("despesa", HISTORY_COLLECTIONS.despesas, despRef.id, payload)
  );
  await batch.commit();
  void incrementUsageCounter(uid, USAGE_COUNTERS.despesas);
  return { id: despRef.id, ...payload };
}

export async function updateDespesaWithFinanceiro(uid, id, despesa) {
  const payload = stripMeta(despesa);
  await updateHistoryItem(uid, HISTORY_COLLECTIONS.despesas, id, payload);
  await deleteFinanceiroBySource(uid, HISTORY_COLLECTIONS.despesas, id);
  await addDoc(
    colRef(uid, HISTORY_COLLECTIONS.financeiro),
    financeiroPayload("despesa", HISTORY_COLLECTIONS.despesas, id, payload)
  );
  return { id, ...payload };
}

export async function deleteDespesaWithFinanceiro(uid, id) {
  await deleteFinanceiroBySource(uid, HISTORY_COLLECTIONS.despesas, id);
  await deleteHistoryItem(uid, HISTORY_COLLECTIONS.despesas, id);
}

export async function addManutencaoWithFinanceiro(uid, item) {
  const payload = stripMeta(item);
  const batch = writeBatch(db);
  const maintRef = doc(colRef(uid, HISTORY_COLLECTIONS.manutencao));
  const finRef = doc(colRef(uid, HISTORY_COLLECTIONS.financeiro));

  batch.set(maintRef, {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(
    finRef,
    financeiroPayload("manutencao", HISTORY_COLLECTIONS.manutencao, maintRef.id, payload)
  );
  await batch.commit();
  void incrementUsageCounter(uid, USAGE_COUNTERS.manutencoes);
  return { id: maintRef.id, ...payload };
}

export async function updateManutencaoWithFinanceiro(uid, id, item) {
  const payload = stripMeta(item);
  await updateHistoryItem(uid, HISTORY_COLLECTIONS.manutencao, id, payload);
  await deleteFinanceiroBySource(uid, HISTORY_COLLECTIONS.manutencao, id);
  await addDoc(
    colRef(uid, HISTORY_COLLECTIONS.financeiro),
    financeiroPayload("manutencao", HISTORY_COLLECTIONS.manutencao, id, payload)
  );
  return { id, ...payload };
}

export async function deleteManutencaoWithFinanceiro(uid, id) {
  await deleteFinanceiroBySource(uid, HISTORY_COLLECTIONS.manutencao, id);
  await deleteHistoryItem(uid, HISTORY_COLLECTIONS.manutencao, id);
}

export async function addDocumento(uid, docData) {
  const saved = await addHistoryItem(uid, HISTORY_COLLECTIONS.documentos, docData);
  void incrementUsageCounter(uid, USAGE_COUNTERS.documentos);
  return saved;
}

export async function deleteDocumento(uid, id) {
  return deleteHistoryItem(uid, HISTORY_COLLECTIONS.documentos, id);
}

export async function clearAllUserHistory(uid) {
  if (!uid) return;

  for (const name of Object.values(HISTORY_COLLECTIONS)) {
    const snap = await getDocs(colRef(uid, name));
    if (snap.empty) continue;

    let batch = writeBatch(db);
    let count = 0;

    for (const d of snap.docs) {
      batch.delete(d.ref);
      count += 1;
      if (count >= 450) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }

    if (count > 0) await batch.commit();
  }
}
