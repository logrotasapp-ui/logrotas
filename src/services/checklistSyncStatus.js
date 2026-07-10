/** Badge de sync — Fase 1: local_only e syncing exibem pendência. */
export function getChecklistSyncBadge(checklist) {
  const state = checklist?._sync?.state;
  if (!state || state === "synced") return null;
  return "aguardando_sincronizacao";
}

export function checklistAguardandoSync(checklist) {
  return getChecklistSyncBadge(checklist) != null;
}
