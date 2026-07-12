import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase.js";

const PROFILE_LABELS = {
  caminhoneiro: "Caminhoneiro",
  guincheiro: "Guincheiro",
  motoqueiro: "Motoqueiro",
  entregador: "Entregador",
  outros: "Outros",
};

export function cadastroToFirestorePayload(data) {
  return {
    nome: data.name?.trim() || "",
    email: data.email?.trim() || "",
    telefone: data.phone?.trim() || "",
    documento: data.documento?.trim() || "",
    profile: data.profile || "",
    tipo: PROFILE_LABELS[data.profile] || "Motorista Autônomo",
    veiculo: data.vehicle || "",
  };
}

export function firestoreToPerfil(data) {
  return {
    nome: data.nome || "",
    empresa: data.empresa || "",
    empresaLogoUrl: data.empresaLogoUrl || "",
    email: data.email || "",
    telefone: data.telefone || "",
    documento: data.documento || "",
    tipo: data.tipo || "Motorista Autônomo",
    veiculo: data.veiculo || "",
    servicosFechamento: Array.isArray(data.servicosFechamento)
      ? data.servicosFechamento
      : [],
    precoCombustivel: data.precoCombustivel || "",
    subscriptionStatus: data.subscriptionStatus || "",
    planType: data.planType || "",
    tipoAcesso: data.tipoAcesso || "",
    acessoVitalicio: data.acessoVitalicio === true,
    acessoValidoAte: data.acessoValidoAte ?? null,
  };
}

export function perfilToFirestorePayload(perfil) {
  return {
    nome: perfil.nome?.trim() || "",
    empresa: perfil.empresa?.trim() || "",
    empresaLogoUrl: perfil.empresaLogoUrl?.trim() || "",
    email: perfil.email?.trim() || "",
    telefone: perfil.telefone?.trim() || "",
    documento: perfil.documento?.trim() || "",
    tipo: perfil.tipo || "Motorista Autônomo",
    veiculo: perfil.veiculo || "",
    servicosFechamento: Array.isArray(perfil.servicosFechamento)
      ? perfil.servicosFechamento
      : [],
    precoCombustivel: perfil.precoCombustivel || "",
  };
}

export async function saveUserProfile(uid, payload) {
  const ref = doc(db, "users", uid);
  const existing = await getDoc(ref);
  await setDoc(
    ref,
    {
      ...payload,
      updatedAt: serverTimestamp(),
      ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
    },
    { merge: true }
  );
}

export const PROFILE_GATE_TIMEOUT_MS = 3000;

export async function loadUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return snap.data();
}

/** Boot gate: evita splash infinita offline quando getDoc não responde. */
export async function loadUserProfileWithTimeout(
  uid,
  timeoutMs = PROFILE_GATE_TIMEOUT_MS
) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("PROFILE_GATE_TIMEOUT")),
      timeoutMs
    );
  });
  try {
    return await Promise.race([loadUserProfile(uid), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Login social: só lê perfil existente — não cria conta nova no app. */
export async function ensureGoogleUserProfile(user) {
  return loadUserProfile(user.uid);
}
