import { getChecklistMediaBlob } from "./checklistMediaStore.js";
import { isChecklistDownloadUrl } from "./storageService.js";

const mediaPreviewCache = new Map();

/**
 * Resolve URL de exibição para foto/assinatura (prep Fase 4 PDF).
 * Ordem: previewUrl blob → mediaId IndexedDB → url HTTPS.
 */
export async function resolveChecklistImagePreview({ mediaId, imagemMediaId, url, imagemUrl, previewUrl }) {
  const resolvedMediaId = mediaId || imagemMediaId;
  const resolvedUrl = url || imagemUrl;

  if (previewUrl && String(previewUrl).startsWith("blob:")) return previewUrl;
  if (resolvedUrl && isChecklistDownloadUrl(resolvedUrl)) return resolvedUrl;

  if (resolvedMediaId) {
    if (mediaPreviewCache.has(resolvedMediaId)) {
      return mediaPreviewCache.get(resolvedMediaId);
    }
    const blob = await getChecklistMediaBlob(resolvedMediaId);
    if (blob) {
      const objUrl = URL.createObjectURL(blob);
      mediaPreviewCache.set(resolvedMediaId, objUrl);
      return objUrl;
    }
  }

  return previewUrl || resolvedUrl || "";
}

export function revokeChecklistImagePreview(mediaId) {
  if (!mediaId || !mediaPreviewCache.has(mediaId)) return;
  const url = mediaPreviewCache.get(mediaId);
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
  mediaPreviewCache.delete(mediaId);
}

export function clearChecklistImagePreviewCache() {
  mediaPreviewCache.forEach((url) => {
    if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
  });
  mediaPreviewCache.clear();
}
