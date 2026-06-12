import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase.js";

const PROFILE_LABELS = {
  caminhoneiro: "Caminhoneiro",
  guincheiro: "Guincheiro",
  motoqueiro: "Motoqueiro",
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
    email: data.email || "",
    telefone: data.telefone || "",
    documento: data.documento || "",
    tipo: data.tipo || "Motorista Autônomo",
    veiculo: data.veiculo || "",
  };
}

export function perfilToFirestorePayload(perfil) {
  return {
    nome: perfil.nome?.trim() || "",
    email: perfil.email?.trim() || "",
    telefone: perfil.telefone?.trim() || "",
    documento: perfil.documento?.trim() || "",
    tipo: perfil.tipo || "Motorista Autônomo",
    veiculo: perfil.veiculo || "",
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

export async function loadUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return snap.data();
}

export async function ensureGoogleUserProfile(user) {
  const existing = await loadUserProfile(user.uid);
  if (existing) return existing;

  const payload = {
    nome: user.displayName || "",
    email: user.email || "",
    telefone: "",
    documento: "",
    profile: "",
    tipo: "Motorista Autônomo",
    veiculo: "",
    authProvider: "google",
  };
  await saveUserProfile(user.uid, payload);
  return payload;
}
