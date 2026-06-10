import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase.js";

export const HISTORY_COLLECTIONS = {
  fretes: "fretes",
  despesas: "despesas",
  manutencao: "manutencao",
  documentos: "documentos",
  financeiro: "financeiro",
};

function colRef(uid, name) {
  return collection(db, "users", uid, name);
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
  };
  if (!uid) return out;

  await Promise.all(
    Object.values(HISTORY_COLLECTIONS).map(async (name) => {
      const snap = await getDocs(colRef(uid, name));
      out[name] = sortByDateDesc(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      );
    })
  );

  return out;
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
    descricao: data.type || "Manutenção",
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
  return addHistoryItem(uid, HISTORY_COLLECTIONS.documentos, docData);
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
