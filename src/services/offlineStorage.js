/**
 * Persistência local (localStorage) para calculadoras offline.
 */

export const OFFLINE_KEYS = {
  viagem: "logrotas_offline_viagem",
  frete: "logrotas_offline_frete",
  otimizar: "logrotas_offline_otimizar",
  navegacao: "logrotas_navegacao_sessao",
  avaliacao: "logrotas_avaliacao_state",
  avaliacaoPendentes: "logrotas_avaliacao_pendentes",
  vehicles: "logrotas_vehicles",
  custoVeiculo: "logrotas_custo_veiculo",
  metaMes: "logrotas_meta_mes",
  uiState: "logrotas_ui_state",
  checklistSessao: "logrotas_checklist_sessao",
};

/**
 * Estado de navegação da UI (aba ativa + modal de calculadora aberto), para
 * restaurar a tela em que o usuário estava quando o PWA é morto em 2º plano.
 */
export function readUiState() {
  return readOfflineCache(OFFLINE_KEYS.uiState);
}

export function writeUiState(state) {
  writeOfflineCache(OFFLINE_KEYS.uiState, state || {});
}

export function clearUiState() {
  try {
    localStorage.removeItem(OFFLINE_KEYS.uiState);
  } catch {
    /* quota / modo privado */
  }
}

export const AUTH_KEYS = {
  session: "logrotas_auth_session",
  registerPrefs: "logrotas_register_prefs",
  registerStep1: "logrotas_register_step1",
  googleSemConta: "logrotas_google_sem_conta",
};

export const PROFILE_KEYS = {
  perfil: "logrotas_perfil",
};

const PROFILE_LABELS = {
  caminhoneiro: "Caminhoneiro",
  guincheiro: "Guincheiro",
  motoqueiro: "Motoqueiro",
  entregador: "Entregador",
  outros: "Outros",
};

/** Fallback de perfil a partir do cache local ou dados do cadastro. */
export function readPerfilLocalFallback() {
  const cached = readOfflineCache(PROFILE_KEYS.perfil);
  if (cached && (cached.nome || cached.email || cached.telefone)) {
    return {
      nome: cached.nome || "",
      empresa: cached.empresa || "",
      empresaLogoUrl: cached.empresaLogoUrl || "",
      email: cached.email || "",
      telefone: cached.telefone || "",
      documento: cached.documento || "",
      tipo: cached.tipo || "Motorista Autônomo",
      veiculo: cached.veiculo || "",
      subscriptionStatus: cached.subscriptionStatus || "",
      planType: cached.planType || "",
      tipoAcesso: cached.tipoAcesso || "",
      acessoVitalicio: cached.acessoVitalicio === true,
      acessoValidoAte: cached.acessoValidoAte ?? null,
    };
  }
  const step1 = readOfflineCache(AUTH_KEYS.registerStep1);
  const prefs = readOfflineCache(AUTH_KEYS.registerPrefs);
  return {
    nome: step1?.name || "",
    email: step1?.email || "",
    telefone: step1?.phone || "",
    documento: step1?.documento || "",
    tipo: PROFILE_LABELS[prefs?.profile] || "Motorista Autônomo",
    veiculo: prefs?.vehicle || "",
  };
}

export function writePerfilLocalCache(perfil) {
  writeOfflineCache(PROFILE_KEYS.perfil, {
    nome: perfil?.nome || "",
    empresa: perfil?.empresa || "",
    empresaLogoUrl: perfil?.empresaLogoUrl || "",
    email: perfil?.email || "",
    telefone: perfil?.telefone || "",
    documento: perfil?.documento || "",
    tipo: perfil?.tipo || "Motorista Autônomo",
    veiculo: perfil?.veiculo || "",
    subscriptionStatus: perfil?.subscriptionStatus || "",
    planType: perfil?.planType || "",
    tipoAcesso: perfil?.tipoAcesso || "",
    acessoVitalicio: perfil?.acessoVitalicio === true,
    acessoValidoAte: perfil?.acessoValidoAte ?? null,
  });
}

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

/** id, axles, consumption, kwh — label/emoji vêm do DEFAULT_VEHICLES. */
export function serializeVehiclesForStorage(vehicles) {
  return (vehicles || []).map((v) => ({
    id: v.id,
    axles: v.axles,
    consumption: v.consumption,
    kwh: v.kwh,
  }));
}

/** Valores salvos pelo usuário têm prioridade; veículos ausentes mantêm o default. */
export function mergeVehiclesWithDefaults(defaultVehicles, saved) {
  if (!Array.isArray(saved) || saved.length === 0) return defaultVehicles;
  const byId = Object.fromEntries(saved.filter((s) => s?.id).map((s) => [s.id, s]));
  return defaultVehicles.map((d) => {
    const s = byId[d.id];
    if (!s) return d;
    return {
      ...d,
      axles: s.axles != null ? s.axles : d.axles,
      consumption: s.consumption != null ? s.consumption : d.consumption,
      kwh: s.kwh != null ? s.kwh : d.kwh,
    };
  });
}

export function readVehiclesLocalCache(defaultVehicles) {
  return mergeVehiclesWithDefaults(defaultVehicles, readOfflineCache(OFFLINE_KEYS.vehicles));
}

export function writeVehiclesLocalCache(vehicles) {
  writeOfflineCache(OFFLINE_KEYS.vehicles, serializeVehiclesForStorage(vehicles));
}

export function clearVehiclesLocalCache() {
  try {
    localStorage.removeItem(OFFLINE_KEYS.vehicles);
  } catch {
    /* quota / modo privado */
  }
}

export function readCustoVeiculoLocalCache() {
  return readOfflineCache(OFFLINE_KEYS.custoVeiculo);
}

export function writeCustoVeiculoLocalCache(payload) {
  writeOfflineCache(OFFLINE_KEYS.custoVeiculo, payload || {});
}

const META_MES_PADRAO = 8000;

/** Meta mensal de faturamento (R$). Firestore → cache → padrão 8000. */
export function readMetaMesLocalCache(fallback = META_MES_PADRAO) {
  const raw = readOfflineCache(OFFLINE_KEYS.metaMes);
  const n = Number(raw?.metaMes ?? raw);
  if (Number.isFinite(n) && n > 0) return n;
  return fallback;
}

export function writeMetaMesLocalCache(metaMes) {
  const n = Number(metaMes);
  writeOfflineCache(OFFLINE_KEYS.metaMes, {
    metaMes: Number.isFinite(n) && n > 0 ? n : META_MES_PADRAO,
  });
}
