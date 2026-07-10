/** Badge de sync — Fase 2: mídia pendente também exibe badge. */
export function getChecklistSyncBadge(checklist) {
  const state = checklist?._sync?.state;
  const pendingMedia = checklist?._sync?.pendingMediaCount ?? 0;
  if (pendingMedia > 0) return "aguardando_sincronizacao";
  if (!state || state === "synced") return null;
  return "aguardando_sincronizacao";
}

export function checklistAguardandoSync(checklist) {
  return getChecklistSyncBadge(checklist) != null;
}
