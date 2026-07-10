export const CHECKLIST_SYNC_BADGE_LABEL = "⏳ Sync pendente";

function assinaturaPendenteSync(assin) {
  return !!assin?.imagemMediaId && !assin?.imagemUrl?.trim();
}

/** Contagem detalhada de mídias pendentes de upload ao Storage. */
export function getChecklistPendingMediaBreakdown(checklist) {
  if (!checklist) return { fotos: 0, assinaturas: 0, total: 0 };

  let fotos = 0;
  let assinaturas = 0;

  (checklist.coleta?.fotos || []).forEach((f) => {
    if (f?.mediaId && !f?.url?.trim()) fotos += 1;
  });
  (checklist.entrega?.fotos || []).forEach((f) => {
    if (f?.mediaId && !f?.url?.trim()) fotos += 1;
  });

  ["responsavel", "prestador"].forEach((k) => {
    if (assinaturaPendenteSync(checklist.coleta?.assinaturas?.[k])) assinaturas += 1;
  });
  ["recebedor", "prestador"].forEach((k) => {
    if (assinaturaPendenteSync(checklist.entrega?.assinaturas?.[k])) assinaturas += 1;
  });

  return { fotos, assinaturas, total: fotos + assinaturas };
}

/** Rótulo curto para o header — ex: "2 fotos · 1 assinatura". */
export function getChecklistPendingMediaLabel(checklist) {
  const { fotos, assinaturas, total } = getChecklistPendingMediaBreakdown(checklist);
  if (total === 0) return null;

  const parts = [];
  if (fotos > 0) parts.push(`${fotos} foto${fotos > 1 ? "s" : ""}`);
  if (assinaturas > 0) parts.push(`${assinaturas} assinatura${assinaturas > 1 ? "s" : ""}`);
  return parts.join(" · ");
}

/** Badge de sync — Fase 2: mídia pendente também exibe badge. */
export function getChecklistSyncBadge(checklist) {
  const state = checklist?._sync?.state;
  const pendingMedia = checklist?._sync?.pendingMediaCount ?? getChecklistPendingMediaBreakdown(checklist).total;
  if (pendingMedia > 0) return "aguardando_sincronizacao";
  if (!state || state === "synced") return null;
  return "aguardando_sincronizacao";
}

export function checklistAguardandoSync(checklist) {
  return getChecklistSyncBadge(checklist) != null;
}
