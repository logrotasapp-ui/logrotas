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
  countPendingChecklistMedia,
  applyPendingMediaSyncMeta,
} from "./checklistOfflineStore.js";
import {
  buildChecklistMediaId,
  buildChecklistStoragePath,
  putChecklistMedia,
  getChecklistMediaBlob,
  hasChecklistMediaBlob,
} from "./checklistMediaStore.js";
import { logChecklist } from "./checklistLogSanitizer.js";
import { scheduleChecklistMediaUpload } from "./checklistMediaUploadQueue.js";
import { isNavigatorOnline } from "./checklistNetwork.js";
import { withChecklistDocumentLock } from "./checklistDocumentMutex.js";

export { getChecklistMediaBlob, hasChecklistMediaBlob, isNavigatorOnline };

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

function stripFotoForFirestore(foto) {
  if (!foto) return foto;
  const { previewUrl, uploadStatus, localId, mediaId, syncStatus, ...rest } = foto;
  return rest;
}

function stripAssinaturaForFirestore(assin) {
  if (!assin) return assin;
  const { imagemMediaId, ...rest } = assin;
  return rest;
}

function stripPatchForFirestore(patch) {
  if (!patch) return patch;
  const out = JSON.parse(JSON.stringify(patch));
  if (out.coleta?.fotos) {
    out.coleta.fotos = out.coleta.fotos.map(stripFotoForFirestore);
  }
  if (out.entrega?.fotos) {
    out.entrega.fotos = out.entrega.fotos.map(stripFotoForFirestore);
  }
  if (out.coleta?.assinaturas) {
    Object.keys(out.coleta.assinaturas).forEach((k) => {
      out.coleta.assinaturas[k] = stripAssinaturaForFirestore(out.coleta.assinaturas[k]);
    });
  }
  if (out.entrega?.assinaturas) {
    Object.keys(out.entrega.assinaturas).forEach((k) => {
      out.entrega.assinaturas[k] = stripAssinaturaForFirestore(out.entrega.assinaturas[k]);
    });
  }
  return out;
}

function buildRemotePatch(patch, merged) {
  const pending = countPendingChecklistMedia(merged);
  if (pending > 0) return null;
  const remote = stripPatchForFirestore(patch);
  return Object.keys(remote).length ? remote : null;
}

/**
 * Grava blob de foto/assinatura no IndexedDB (Fase 2a).
 * Upload ao Storage fica para Fase 2c.
 */
export async function captureChecklistMedia({
  uid,
  checklistId,
  contexto = "coleta",
  tipo = "foto",
  slot,
  blob,
  storageFileName,
}) {
  if (!uid || !checklistId || !blob) {
    throw new Error("uid, checklistId e blob são obrigatórios");
  }
  const mediaId = buildChecklistMediaId(checklistId, contexto, slot);
  const storagePath = buildChecklistStoragePath(uid, checklistId, contexto, storageFileName);
  await putChecklistMedia({
    mediaId,
    checklistId,
    uid,
    contexto,
    tipo,
    slot,
    storagePath,
    blob,
  });
  return { mediaId, storagePath };
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

  return withChecklistDocumentLock(checklistId, async () => {
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
  merged = applyPendingMediaSyncMeta(merged);

  const pendingMedia = merged._sync?.pendingMediaCount ?? 0;
  if (pendingMedia > 0) {
    merged._sync.state = "local_only";
  } else if (merged._sync.state === "synced" && !isNavigatorOnline()) {
    merged._sync.state = "local_only";
  }

  try {
    await saveChecklistLocal(merged);
  } catch (err) {
    logChecklist("error", "[Checklist] Falha ao gravar local", err);
    return { checklist: null, savedLocally: false, savedRemote: false };
  }

  let savedRemote = false;
  const remotePatch = buildRemotePatch(patch, merged);
  if (isNavigatorOnline() && remotePatch) {
    try {
      await persistRemoteUpdate(uid, checklistId, remotePatch);
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
  } else if (pendingMedia > 0) {
    logChecklist("log", "[Checklist] Sync remoto adiado — mídia pendente", {
      checklistId,
      pendingMedia,
    });
    if (isNavigatorOnline()) {
      scheduleChecklistMediaUpload({ uid, checklistId });
    }
  }

  return {
    checklist: stripChecklistStorageMeta(merged),
    savedLocally: true,
    savedRemote,
  };
  });
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

  const byId = new Map(
    remote
      .filter((c) => c.status === "aguardando_entrega")
      .map((c) => [c.id, c])
  );
  localList.forEach((l) => {
    if (l.status === "concluido") {
      byId.delete(l.id);
      return;
    }
    const stripped = stripChecklistStorageMeta(l);
    const remoteItem = byId.get(l.id);
    if (l._sync?.state === "local_only" || !remoteItem) {
      byId.set(l.id, stripped);
      return;
    }
    if (timestampMs(l.atualizadoEm) > timestampMs(remoteItem.atualizadoEm)) {
      byId.set(l.id, stripped);
    }
  });

  return [...byId.values()]
    .filter((c) => c.status === "aguardando_entrega")
    .sort((a, b) => timestampMs(b.atualizadoEm) - timestampMs(a.atualizadoEm));
}
