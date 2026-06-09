/**
 * Persistência local (localStorage) para calculadoras offline.
 */

export const OFFLINE_KEYS = {
  viagem: "logrotas_offline_viagem",
  frete: "logrotas_offline_frete",
  otimizar: "logrotas_offline_otimizar",
};

export const AUTH_KEYS = {
  session: "logrotas_auth_session",
  registerPrefs: "logrotas_register_prefs",
  registerStep1: "logrotas_register_step1",
};

export const PROFILE_KEYS = {
  perfil: "logrotas_perfil",
};

const PROFILE_LABELS = {
  caminhoneiro: "Caminhoneiro",
  guincheiro: "Guincheiro",
  motoqueiro: "Motoqueiro",
  outros: "Outros",
};

/** Fallback de perfil a partir do cache local ou dados do cadastro. */
export function readPerfilLocalFallback() {
  const cached = readOfflineCache(PROFILE_KEYS.perfil);
  if (cached && (cached.nome || cached.email || cached.telefone)) {
    return {
      nome: cached.nome || "",
      email: cached.email || "",
      telefone: cached.telefone || "",
      tipo: cached.tipo || "Motorista Autônomo",
      veiculo: cached.veiculo || "",
    };
  }
  const step1 = readOfflineCache(AUTH_KEYS.registerStep1);
  const prefs = readOfflineCache(AUTH_KEYS.registerPrefs);
  return {
    nome: step1?.name || "",
    email: step1?.email || "",
    telefone: step1?.phone || "",
    tipo: PROFILE_LABELS[prefs?.profile] || "Motorista Autônomo",
    veiculo: prefs?.vehicle || "",
  };
}

export function writePerfilLocalCache(perfil) {
  writeOfflineCache(PROFILE_KEYS.perfil, {
    nome: perfil?.nome || "",
    email: perfil?.email || "",
    telefone: perfil?.telefone || "",
    tipo: perfil?.tipo || "Motorista Autônomo",
    veiculo: perfil?.veiculo || "",
  });
}

export const PLAN_KEYS = {
  plano: "logrotas_plano",
  planoExpiry: "logrotas_plano_expiry",
};

/** Remove todas as chaves localStorage com prefixo logrotas_. */
export function clearAllLogRotasStorage() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("logrotas_")) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* quota / modo privado */
  }
}

/** Ativa trial Pro por N dias (padrão 14). */
export function activateProTrial(days = 14) {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + days);
  try {
    localStorage.setItem(PLAN_KEYS.plano, "pro");
    localStorage.setItem(PLAN_KEYS.planoExpiry, expiry.toISOString());
  } catch {
    /* quota / modo privado */
  }
}

/** Retorna true se logrotas_plano=pro e a data de expiração ainda não passou. */
export function readProPlanActive() {
  try {
    const plano = localStorage.getItem(PLAN_KEYS.plano);
    const expiry = localStorage.getItem(PLAN_KEYS.planoExpiry);
    if (plano !== "pro" || !expiry) return false;
    if (new Date(expiry) <= new Date()) {
      localStorage.removeItem(PLAN_KEYS.plano);
      localStorage.removeItem(PLAN_KEYS.planoExpiry);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function readProTrialDaysLeft() {
  try {
    const expiry = localStorage.getItem(PLAN_KEYS.planoExpiry);
    if (!expiry) return 0;
    const ms = new Date(expiry) - new Date();
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  } catch {
    return 0;
  }
}

export function readOfflineCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeOfflineCache(key, payload) {
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    /* quota / modo privado */
  }
}
