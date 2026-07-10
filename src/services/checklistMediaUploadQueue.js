import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase.js";
import { idbGetMedia } from "./checklistIndexedDb.js";
import {
  getChecklistLocal,
  saveChecklistLocal,
  listChecklistsLocal,
  stripChecklistStorageMeta,
  countPendingChecklistMedia,
  applyPendingMediaSyncMeta,
} from "./checklistOfflineStore.js";
import { atualizarChecklist } from "./checklistService.js";
import { isNavigatorOnline } from "./checklistNetwork.js";
import { isChecklistDownloadUrl } from "./storageService.js";
import { logChecklist } from "./checklistLogSanitizer.js";
import { withChecklistDocumentLock } from "./checklistDocumentMutex.js";

const uploadListeners = new Set();
let queueMutex = Promise.resolve();

function notifyUploadProgress(payload) {
  uploadListeners.forEach((fn) => {
    try {
      fn(payload);
    } catch (err) {
      logChecklist("warn", "[Checklist] Listener de upload falhou", err);
    }
  });
}

export function subscribeChecklistUploadProgress(listener) {
  uploadListeners.add(listener);
  return () => uploadListeners.delete(listener);
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

function buildChecklistFirestorePayload(local) {
  const payload = {
    status: local.status,
    numero: local.numero,
    freteId: local.freteId,
    avulso: local.avulso,
    enviadoEm: local.enviadoEm,
    cliente: local.cliente,
    veiculo: local.veiculo,
    servico: local.servico,
    origem: local.origem,
    destino: local.destino,
    coleta: local.coleta
      ? {
          ...local.coleta,
          fotos: (local.coleta.fotos || []).map(stripFotoForFirestore),
          assinaturas: Object.fromEntries(
            Object.entries(local.coleta.assinaturas || {}).map(([k, v]) => [
              k,
              stripAssinaturaForFirestore(v),
            ])
          ),
        }
      : local.coleta,
    entrega: local.entrega
      ? {
          ...local.entrega,
          fotos: (local.entrega.fotos || []).map(stripFotoForFirestore),
          assinaturas: Object.fromEntries(
            Object.entries(local.entrega.assinaturas || {}).map(([k, v]) => [
              k,
              stripAssinaturaForFirestore(v),
            ])
          ),
        }
      : local.entrega,
  };
  return JSON.parse(JSON.stringify(payload));
}

export async function flushChecklistToRemote(uid, checklistId) {
  if (!uid || !checklistId || !isNavigatorOnline()) {
    return { flushed: false, checklist: null };
  }

  let local = await getChecklistLocal(checklistId);
  if (!local || local.uid !== uid) {
    return { flushed: false, checklist: null };
  }

  local = applyPendingMediaSyncMeta(local);
  const pending = countPendingChecklistMedia(local);
  if (pending > 0) {
    return { flushed: false, checklist: stripChecklistStorageMeta(local), pending };
  }

  try {
    const payload = buildChecklistFirestorePayload(local);
    await atualizarChecklist(uid, checklistId, payload);
    local._sync = {
      ...local._sync,
      state: "synced",
      pendingMediaCount: 0,
      lastRemoteSyncAt: new Date().toISOString(),
    };
    await saveChecklistLocal(local);
    const stripped = stripChecklistStorageMeta(local);
    logChecklist("log", "[Checklist] Flush remoto concluído", { checklistId });
    return { flushed: true, checklist: stripped };
  } catch (err) {
    local._sync = { ...local._sync, state: "local_only" };
    await saveChecklistLocal(local);
    logChecklist("warn", "[Checklist] Flush remoto falhou", { checklistId, err });
    return { flushed: false, checklist: stripChecklistStorageMeta(local) };
  }
}

/** Monta fila UPLOAD_MEDIA derivada do checklist (ordem por criadoEm do blob). */
export async function buildUploadMediaQueue(checklist) {
  if (!checklist) return [];

  const raw = [];

  (checklist.coleta?.fotos || []).forEach((foto) => {
    if (foto?.mediaId && !foto?.url?.trim()) {
      raw.push({
        kind: "foto",
        contexto: "coleta",
        mediaId: foto.mediaId,
        slot: foto.tipo,
      });
    }
  });

  ["responsavel", "prestador"].forEach((bloco) => {
    const assin = checklist.coleta?.assinaturas?.[bloco];
    if (assin?.imagemMediaId && !assin?.imagemUrl?.trim()) {
      raw.push({
        kind: "assinatura",
        contexto: "coleta",
        mediaId: assin.imagemMediaId,
        slot: bloco,
      });
    }
  });

  (checklist.entrega?.fotos || []).forEach((foto) => {
    if (foto?.mediaId && !foto?.url?.trim()) {
      raw.push({
        kind: "foto",
        contexto: "entrega",
        mediaId: foto.mediaId,
        slot: foto.tipo,
      });
    }
  });

  ["recebedor", "prestador"].forEach((bloco) => {
    const assin = checklist.entrega?.assinaturas?.[bloco];
    if (assin?.imagemMediaId && !assin?.imagemUrl?.trim()) {
      raw.push({
        kind: "assinatura",
        contexto: "entrega",
        mediaId: assin.imagemMediaId,
        slot: bloco,
      });
    }
  });

  const withTs = await Promise.all(
    raw.map(async (item) => {
      const row = await idbGetMedia(item.mediaId);
      return { ...item, criadoEm: row?.criadoEm || "", storagePath: row?.storagePath || "" };
    })
  );

  return withTs.sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm)));
}

async function uploadBlobAtPath(storagePath, blob) {
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
  const downloadUrl = await getDownloadURL(storageRef);
  if (!isChecklistDownloadUrl(downloadUrl)) {
    throw new Error("URL de download inválida após upload.");
  }
  return downloadUrl;
}

function applyUploadedUrlToChecklist(local, item, downloadUrl) {
  const next = JSON.parse(JSON.stringify(local));

  if (item.kind === "foto") {
    const fotos =
      item.contexto === "entrega" ? next.entrega?.fotos || [] : next.coleta?.fotos || [];
    const idx = fotos.findIndex((f) => f.mediaId === item.mediaId);
    if (idx >= 0) {
      fotos[idx] = {
        ...fotos[idx],
        url: downloadUrl,
        syncStatus: "synced",
        uploadStatus: undefined,
      };
      if (item.contexto === "entrega") {
        next.entrega = { ...next.entrega, fotos };
      } else {
        next.coleta = { ...next.coleta, fotos };
      }
    }
  } else if (item.kind === "assinatura") {
    const assinaturas =
      item.contexto === "entrega"
        ? { ...(next.entrega?.assinaturas || {}) }
        : { ...(next.coleta?.assinaturas || {}) };
    const atual = assinaturas[item.slot];
    if (atual?.imagemMediaId === item.mediaId) {
      assinaturas[item.slot] = { ...atual, imagemUrl: downloadUrl };
      if (item.contexto === "entrega") {
        next.entrega = { ...next.entrega, assinaturas };
      } else {
        next.coleta = { ...next.coleta, assinaturas };
      }
    }
  }

  return applyPendingMediaSyncMeta(next);
}

async function uploadSingleChecklistMedia(uid, checklistId, item) {
  const row = await idbGetMedia(item.mediaId);
  if (!row?.blob) {
    throw new Error(`Blob ausente para mediaId ${item.mediaId}`);
  }
  const path = row.storagePath || item.storagePath;
  if (!path) {
    throw new Error(`storagePath ausente para mediaId ${item.mediaId}`);
  }
  if (row.uid && row.uid !== uid) {
    throw new Error("uid da mídia não confere");
  }
  return uploadBlobAtPath(path, row.blob);
}

/**
 * Processa fila UPLOAD_MEDIA de um checklist (serial, mutex global).
 */
export async function processChecklistMediaUploadQueue({ uid, checklistId }) {
  if (!uid || !checklistId || !isNavigatorOnline()) {
    return { uploaded: 0, failed: 0, checklist: null };
  }

  const run = () =>
    withChecklistDocumentLock(checklistId, async () => {
      let local = await getChecklistLocal(checklistId);
      if (!local || local.uid !== uid) {
        return { uploaded: 0, failed: 0, checklist: null };
      }

      const queue = await buildUploadMediaQueue(local);
      if (!queue.length) {
        const flush = await flushChecklistToRemote(uid, checklistId);
        if (flush.checklist) {
          notifyUploadProgress({ checklistId, phase: "done", checklist: flush.checklist });
        }
        return { uploaded: 0, failed: 0, checklist: flush.checklist };
      }

      let uploaded = 0;
      let failed = 0;
      const total = queue.length;

      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        notifyUploadProgress({
          checklistId,
          phase: "uploading",
          current: i + 1,
          total,
          pending: total - i,
        });

        local = await getChecklistLocal(checklistId);
        if (!local) break;

        const stillPending =
          item.kind === "foto"
            ? (item.contexto === "entrega" ? local.entrega?.fotos : local.coleta?.fotos || []).some(
                (f) => f.mediaId === item.mediaId && !f.url?.trim()
              )
            : (item.contexto === "entrega"
                ? local.entrega?.assinaturas?.[item.slot]
                : local.coleta?.assinaturas?.[item.slot]
              )?.imagemMediaId === item.mediaId &&
              !(item.contexto === "entrega"
                ? local.entrega?.assinaturas?.[item.slot]
                : local.coleta?.assinaturas?.[item.slot]
              )?.imagemUrl?.trim();

        if (!stillPending) continue;

        try {
          const url = await uploadSingleChecklistMedia(uid, checklistId, item);
          local = applyUploadedUrlToChecklist(local, item, url);
          await saveChecklistLocal(local);
          uploaded += 1;
          notifyUploadProgress({
            checklistId,
            phase: "progress",
            checklist: stripChecklistStorageMeta(local),
            current: i + 1,
            total,
            pending: countPendingChecklistMedia(local),
          });
        } catch (err) {
          failed += 1;
          logChecklist("error", "[Checklist] Falha upload mídia", {
            checklistId,
            mediaId: item.mediaId,
            err,
          });
        }
      }

      local = await getChecklistLocal(checklistId);
      let finalChecklist = local ? stripChecklistStorageMeta(local) : null;
      const pending = local ? countPendingChecklistMedia(local) : 0;

      if (local && pending === 0) {
        const flush = await flushChecklistToRemote(uid, checklistId);
        if (flush.checklist) finalChecklist = flush.checklist;
      }

      notifyUploadProgress({
        checklistId,
        phase: "done",
        checklist: finalChecklist,
        uploaded,
        failed,
        pending,
      });

      return { uploaded, failed, checklist: finalChecklist };
    });

  queueMutex = queueMutex.then(run).catch((err) => {
    logChecklist("error", "[Checklist] Erro na fila UPLOAD_MEDIA", err);
    return { uploaded: 0, failed: 0, checklist: null };
  });

  return queueMutex;
}

/** Agenda processamento (fire-and-forget). */
export function scheduleChecklistMediaUpload({ uid, checklistId }) {
  if (!uid || !checklistId || !isNavigatorOnline()) return;
  void processChecklistMediaUploadQueue({ uid, checklistId });
}

/** Processa todos os checklists do usuário com mídia pendente. */
export async function processAllPendingChecklistMedia(uid) {
  if (!uid || !isNavigatorOnline()) return { processed: 0 };

  const list = await listChecklistsLocal(uid, (c) => countPendingChecklistMedia(c) > 0);
  if (!list.length) return { processed: 0 };

  logChecklist("log", "[Checklist] Processando filas pendentes", { count: list.length });
  for (const item of list) {
    await processChecklistMediaUploadQueue({ uid, checklistId: item.id });
  }
  return { processed: list.length };
}
