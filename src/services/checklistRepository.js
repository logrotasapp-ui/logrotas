import {
  buildNovoChecklistDocumento,
  atualizarChecklist,
  buscarChecklistPorId,
  buscarChecklistPorFrete,
  criarChecklistComId,
  listarChecklistsAvulsosEmAndamento,
} from "./checklistService.js";
import { alocarNumeroLocal } from "./checklistNumeroService.js";
import {
  buildChecklistSyncMeta,
  saveChecklistLocal,
  getChecklistLocal,
  getChecklistLocalByFreteId,
  listChecklistsLocal,
  stripChecklistStorageMeta,
} from "./checklistOfflineStore.js";
import { logChecklist } from "./checklistLogSanitizer.js";

export function isNavigatorOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

function timestampMs(value) {
  if (!value) return 0;
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function mergePatchIntoLocal(local, patch) {
  const merged = { ...local };
  Object.entries(patch || {}).forEach(([key, val]) => {
    if (val !== null && val !== undefined) merged[key] = val;
  });
  merged._sync = {
    ...merged._sync,
    lastLocalSaveAt: new Date().toISOString(),
  };
  merged.atualizadoEm = merged._sync.lastLocalSaveAt;
  return merged;
}

async function persistRemoteCreate(uid, checklistId, doc) {
  await criarChecklistComId(uid, checklistId, doc);
}

async function persistRemoteUpdate(uid, checklistId, patch) {
  await atualizarChecklist(uid, checklistId, patch);
}

async function cacheRemoteAsLocal(uid, remote, syncState = "synced") {
  const record = {
    ...remote,
    uid,
    _sync: {
      ...buildChecklistSyncMeta(syncState),
      createdAt: remote.criadoEm || buildChecklistSyncMeta(syncState).createdAt,
      lastRemoteSyncAt: new Date().toISOString(),
    },
  };
  await saveChecklistLocal(record);
  return stripChecklistStorageMeta(record);
}

/**
 * Cria checklist (avulso ou frete) — sempre grava local; remoto se online.
 */
export async function createChecklist({ uid, avulso = false, freteId = null, dados = {} }) {
  if (!uid) throw new Error("uid é obrigatório");

  const id = crypto.randomUUID();
  const tipoPrefix = avulso ? "AV" : "FR";
  const numero = alocarNumeroLocal(uid, tipoPrefix);

  let doc = buildNovoChecklistDocumento(avulso ? null : freteId, dados);
  doc.id = id;
  doc.uid = uid;
  doc.numero = numero;
  doc._sync = buildChecklistSyncMeta("local_only");

  if (avulso) {
    doc.avulso = true;
    doc.freteId = null;
    doc.enviadoEm = null;
  } else {
    doc.avulso = false;
    doc.freteId = freteId;
  }

  doc.criadoEm = doc._sync.createdAt;
  doc.atualizadoEm = doc._sync.lastLocalSaveAt;

  await saveChecklistLocal(doc);

  let savedRemote = false;
  if (isNavigatorOnline()) {
    try {
      await persistRemoteCreate(uid, id, doc);
      doc._sync = {
        ...doc._sync,
        state: "synced",
        lastRemoteSyncAt: new Date().toISOString(),
      };
      await saveChecklistLocal(doc);
      savedRemote = true;
    } catch (err) {
      logChecklist("warn", "[Checklist] Criação remota falhou — mantido local_only", err);
    }
  }

  return { checklist: stripChecklistStorageMeta(doc), savedRemote, savedLocally: true };
}

/**
 * Salva patch no IndexedDB; tenta Firestore se online.
 */
export async function saveChecklist({ uid, checklistId, patch, baseChecklist }) {
  if (!uid || !checklistId) throw new Error("uid e checklistId obrigatórios");

  let local = await getChecklistLocal(checklistId);

  if (!local && baseChecklist) {
    local = {
      ...baseChecklist,
      id: checklistId,
      uid,
      _sync: buildChecklistSyncMeta(isNavigatorOnline() ? "synced" : "local_only"),
    };
  }

  if (!local) {
    if (isNavigatorOnline()) {
      try {
        const remote = await buscarChecklistPorId(uid, checklistId);
        if (remote) {
          local = {
            ...remote,
            uid,
            _sync: buildChecklistSyncMeta("synced"),
          };
        }
      } catch (err) {
        logChecklist("warn", "[Checklist] Falha ao buscar remoto para espelhar local", err);
      }
    }
  }

  if (!local) {
    return { checklist: null, savedLocally: false, savedRemote: false };
  }

  let merged = mergePatchIntoLocal(local, patch);

  if (merged._sync.state === "synced" && !isNavigatorOnline()) {
    merged._sync.state = "local_only";
  }

  try {
    await saveChecklistLocal(merged);
  } catch (err) {
    logChecklist("error", "[Checklist] Falha ao gravar local", err);
    return { checklist: null, savedLocally: false, savedRemote: false };
  }

  let savedRemote = false;
  if (isNavigatorOnline()) {
    try {
      await persistRemoteUpdate(uid, checklistId, patch);
      merged._sync = {
        ...merged._sync,
        state: "synced",
        lastRemoteSyncAt: new Date().toISOString(),
      };
      await saveChecklistLocal(merged);
      savedRemote = true;
    } catch (err) {
      merged._sync.state = "local_only";
      await saveChecklistLocal(merged);
      logChecklist("warn", "[Checklist] Atualização remota falhou — local_only", err);
    }
  }

  return {
    checklist: stripChecklistStorageMeta(merged),
    savedLocally: true,
    savedRemote,
  };
}

/** Carrega checklist: prioriza local se local_only ou offline. */
export async function loadChecklist(uid, checklistId) {
  if (!uid || !checklistId) return null;

  const local = await getChecklistLocal(checklistId);

  if (!isNavigatorOnline()) {
    if (local?.uid === uid) return stripChecklistStorageMeta(local);
    return null;
  }

  let remote = null;
  try {
    remote = await buscarChecklistPorId(uid, checklistId);
  } catch (err) {
    logChecklist("warn", "[Checklist] loadChecklist remoto falhou", err);
    if (local?.uid === uid) return stripChecklistStorageMeta(local);
    return null;
  }

  if (!remote) {
    if (local?.uid === uid) return stripChecklistStorageMeta(local);
    return null;
  }

  if (!local) {
    return cacheRemoteAsLocal(uid, remote);
  }

  if (local._sync?.state === "local_only") {
    return stripChecklistStorageMeta(local);
  }

  const remoteMs = timestampMs(remote.atualizadoEm);
  const localMs = timestampMs(local.atualizadoEm);
  if (remoteMs >= localMs) {
    return cacheRemoteAsLocal(uid, remote);
  }

  return stripChecklistStorageMeta(local);
}

/** Abre checklist de frete: local → remoto → cria novo. */
export async function openChecklistForFrete({ uid, frete, existente, dados = {} }) {
  if (!uid || !frete?.id) throw new Error("uid e frete.id obrigatórios");

  if (existente?.id) {
    const loaded = await loadChecklist(uid, existente.id);
    if (loaded) return loaded;
    return existente;
  }

  const local = await getChecklistLocalByFreteId(uid, frete.id);
  if (local) return stripChecklistStorageMeta(local);

  if (isNavigatorOnline()) {
    try {
      const remote = await buscarChecklistPorFrete(uid, frete.id);
      if (remote?.id) {
        return cacheRemoteAsLocal(uid, remote);
      }
    } catch (err) {
      logChecklist("warn", "[Checklist] buscarChecklistPorFrete falhou", err);
    }
  }

  const { checklist } = await createChecklist({
    uid,
    avulso: false,
    freteId: frete.id,
    dados: {
      origem: { endereco: frete.origin || dados.origem?.endereco || "" },
      destino: { endereco: frete.dest || dados.destino?.endereco || "" },
      ...dados,
    },
  });
  return checklist;
}

/** Avulsos em andamento: merge remoto + locais local_only. */
export async function listAvulsosEmAndamentoMerged(uid) {
  if (!uid) return [];

  const localList = await listChecklistsLocal(
    uid,
    (c) => c.avulso && c.status === "aguardando_entrega"
  );

  if (!isNavigatorOnline()) {
    return localList.map(stripChecklistStorageMeta).sort((a, b) => timestampMs(b.atualizadoEm) - timestampMs(a.atualizadoEm));
  }

  let remote = [];
  try {
    remote = await listarChecklistsAvulsosEmAndamento(uid);
  } catch (err) {
    logChecklist("warn", "[Checklist] listarAvulsosEmAndamento remoto falhou", err);
  }

  const byId = new Map(remote.map((c) => [c.id, c]));
  localList.forEach((l) => {
    if (l._sync?.state === "local_only" || !byId.has(l.id)) {
      byId.set(l.id, stripChecklistStorageMeta(l));
    }
  });

  return [...byId.values()].sort((a, b) => timestampMs(b.atualizadoEm) - timestampMs(a.atualizadoEm));
}
