import { isNavigatorOnline } from "./checklistNetwork.js";
import { processAllPendingChecklistMedia } from "./checklistMediaUploadQueue.js";
import { logChecklist } from "./checklistLogSanitizer.js";

let activeUid = null;
let onlineHandler = null;

/**
 * Registra listener de reconexão e processa filas UPLOAD_MEDIA pendentes.
 * Retorna função de cleanup.
 */
export function initChecklistConnectivity(uid) {
  if (!uid || typeof window === "undefined") return () => {};

  disposeChecklistConnectivity();
  activeUid = uid;

  onlineHandler = () => {
    if (!isNavigatorOnline() || activeUid !== uid) return;
    logChecklist("log", "[Checklist] Reconexão detectada — processando filas");
    void processAllPendingChecklistMedia(uid).catch((err) => {
      logChecklist("warn", "[Checklist] Falha ao processar filas na reconexão", err);
    });
  };

  window.addEventListener("online", onlineHandler);

  if (isNavigatorOnline()) {
    void processAllPendingChecklistMedia(uid).catch((err) => {
      logChecklist("warn", "[Checklist] Falha ao processar filas no boot", err);
    });
  }

  return disposeChecklistConnectivity;
}

export function disposeChecklistConnectivity() {
  if (onlineHandler && typeof window !== "undefined") {
    window.removeEventListener("online", onlineHandler);
  }
  onlineHandler = null;
  activeUid = null;
}
