import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDQgXb5Smvd0C8csLsq0WPIaahweH2Ox5E",
  authDomain: "logrotas-85e7e.firebaseapp.com",
  projectId: "logrotas-85e7e",
  storageBucket: "logrotas-85e7e.firebasestorage.app",
  messagingSenderId: "404332371972",
  appId: "1:404332371972:web:fb1234a8c8294536121551",
  measurementId: "G-14W4Z6VH7H",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
