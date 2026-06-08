import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  deleteUser,
} from "firebase/auth";
import { auth } from "../firebase.js";

const googleProvider = new GoogleAuthProvider();

export function subscribeAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function signInWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function signUpWithEmail(email, password) {
  return createUserWithEmailAndPassword(auth, email.trim(), password);
}

export async function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export async function signOutUser() {
  return signOut(auth);
}

export async function deleteCurrentUser() {
  const user = auth.currentUser;
  if (user) await deleteUser(user);
}

export function getAuthErrorMessage(code) {
  const messages = {
    "auth/invalid-email": "E-mail inválido.",
    "auth/user-disabled": "Esta conta foi desativada.",
    "auth/user-not-found": "E-mail ou senha incorretos.",
    "auth/wrong-password": "E-mail ou senha incorretos.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/email-already-in-use": "Este e-mail já está cadastrado.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/too-many-requests": "Muitas tentativas. Tente novamente em alguns minutos.",
    "auth/popup-closed-by-user": "Login cancelado.",
    "auth/cancelled-popup-request": "Login cancelado.",
    "auth/network-request-failed": "Sem conexão. Verifique sua internet.",
  };
  return messages[code] || "Não foi possível concluir. Tente novamente.";
}
