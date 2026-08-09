import { initializeApp } from "firebase/app";
import { getAuth, browserLocalPersistence, setPersistence } from "firebase/auth";

const env = import.meta.env;

// Public Firebase web config for the "android-a0d2c" project. Firebase web
// config values are safe to embed in client code (they are not secrets) —
// set VITE_FIREBASE_* env vars to override when using a different project.
export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "AIzaSyAz9HqYmyZwqvzBcu1b0182JFvvKXbl344",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "android-a0d2c.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "android-a0d2c",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "android-a0d2c.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "528365608617",
  appId: env.VITE_FIREBASE_APP_ID || "1:528365608617:web:a879ed5e3e8e34fa5293b8",
};

export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId
);

export const app = firebaseConfigured ? initializeApp(firebaseConfig) : null;
export const auth = firebaseConfigured ? getAuth(app!) : null;

// Keep the user signed in across page reloads.
if (auth) {
  setPersistence(auth, browserLocalPersistence).catch(() => {});
}
