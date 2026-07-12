/**
 * Resolução central do plano do usuário a partir do perfil Firestore (users/{uid}).
 * Não usa localStorage — ver App para fallback offline.
 */

/** @typedef {"free"|"frete"|"completo"|"vitalicio"|"trial"} PlanoSlug */

/**
 * @param {unknown} value — Firestore Timestamp, Date, ISO string ou { seconds }
 * @returns {Date|null}
 */
export function parseFirestoreDate(value) {
  if (value == null) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value.seconds === "number") {
    return new Date(value.seconds * 1000);
  }
  return null;
}

/**
 * @param {object|null|undefined} perfil — saída de firestoreToPerfil
 * @returns {{ isPago: boolean, plano: PlanoSlug, motivo: string }}
 */
export function getPlanoAtual(perfil) {
  if (!perfil || typeof perfil !== "object") {
    return { isPago: false, plano: "free", motivo: "sem-perfil" };
  }

  if (perfil.acessoVitalicio === true) {
    return { isPago: true, plano: "vitalicio", motivo: "acesso-vitalicio" };
  }

  const tipoAcesso = String(perfil.tipoAcesso || "").trim().toLowerCase();
  const validoAte = parseFirestoreDate(perfil.acessoValidoAte);
  const agora = new Date();

  if (tipoAcesso === "trial" && validoAte && validoAte > agora) {
    return { isPago: true, plano: "trial", motivo: "trial-ativo" };
  }

  const subStatus = String(perfil.subscriptionStatus || "").trim().toLowerCase();
  const planType = String(perfil.planType || "").trim().toUpperCase();

  if (subStatus === "ativo" && planType === "FRETE") {
    return { isPago: true, plano: "frete", motivo: "assinatura-frete-ativa" };
  }

  if (subStatus === "ativo" && planType === "COMPLETO") {
    return {
      isPago: true,
      plano: "completo",
      motivo: "assinatura-completo-ativa",
    };
  }

  if (tipoAcesso === "trial" && validoAte && validoAte <= agora) {
    return { isPago: false, plano: "free", motivo: "trial-expirado" };
  }

  return { isPago: false, plano: "free", motivo: "sem-acesso-pago" };
}

/** Dias restantes do trial (0 se não aplicável). */
export function getTrialDiasRestantes(perfil) {
  const validoAte = parseFirestoreDate(perfil?.acessoValidoAte);
  if (!validoAte) return 0;
  const ms = validoAte.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

/** Perfil carregado do Firestore traz ao menos um campo de acesso? */
export function perfilTemCamposAcesso(perfil) {
  if (!perfil || typeof perfil !== "object") return false;
  return (
    perfil.acessoVitalicio === true ||
    !!perfil.tipoAcesso ||
    !!perfil.subscriptionStatus ||
    !!perfil.planType ||
    perfil.acessoValidoAte != null
  );
}

/**
 * Mapeia getPlanoAtual → state legado do App (plan: "pro"|"free").
 * @returns {{ plan: "pro"|"free", trialDias: number, planoInfo: ReturnType<typeof getPlanoAtual> }}
 */
export function planStateFromPerfil(perfil) {
  const planoInfo = getPlanoAtual(perfil);
  return {
    plan: planoInfo.isPago ? "pro" : "free",
    trialDias:
      planoInfo.plano === "trial" ? getTrialDiasRestantes(perfil) : 0,
    planoInfo,
  };
}
