import { useCallback, useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getIdToken,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { auth } from "./firebase";

export type AuthState = {
  user: User | null;
  loading: boolean;
  token: string | null;
  refreshToken: () => Promise<string | null>;
};

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const t = await getIdToken(u);
          setToken(t);
        } catch {
          setToken(null);
        }
      } else {
        setToken(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const refreshToken = useCallback(async () => {
    if (!auth?.currentUser) return null;
    const t = await getIdToken(auth.currentUser, true);
    setToken(t);
    return t;
  }, []);

  return { user, loading, token, refreshToken };
}

export const signOut = () => (auth ? fbSignOut(auth) : Promise.resolve());

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  "auth/operation-not-allowed":
    "This sign-in method isn’t enabled. Enable it in Firebase console → Authentication → Sign-in method.",
  "auth/invalid-credential": "Invalid email or password.",
  "auth/wrong-password": "Invalid email or password.",
  "auth/user-not-found": "No account found for this email.",
  "auth/email-already-in-use": "An account with this email already exists.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/popup-blocked":
    "Popup blocked. Allow popups for this site, or use email sign-in instead.",
  "auth/popup-closed-by-user": "Sign-in popup was closed before finishing.",
  "auth/unauthorized-domain":
    "This domain isn’t authorized. Add it in Firebase console → Authentication → Settings → Authorized domains.",
  "auth/network-request-failed": "Network error — check your connection.",
};

const friendlyError = (code: string | undefined, message: string) =>
  (code && AUTH_ERROR_MESSAGES[code]) || message || "Something went wrong.";

export type SignInState = {
  busy: boolean;
  error: string | null;
  google: () => Promise<void>;
  email: (email: string, password: string, mode: "in" | "up") => Promise<void>;
};

export function useSignIn(): SignInState {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      const err = e as { code?: string; message?: string };
      setError(friendlyError(err.code, err.message ?? ""));
    } finally {
      setBusy(false);
    }
  }, []);

  const google = useCallback(
    () => run(() => signInWithPopup(auth!, new GoogleAuthProvider())),
    [run]
  );

  const email = useCallback(
    (email: string, password: string, mode: "in" | "up") =>
      run(() =>
        mode === "in"
          ? signInWithEmailAndPassword(auth!, email, password)
          : createUserWithEmailAndPassword(auth!, email, password)
      ),
    [run]
  );

  return { busy, error, google, email };
}
