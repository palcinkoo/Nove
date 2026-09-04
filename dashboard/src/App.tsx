import { useEffect, useState, type FormEvent } from "react";
import { useAuth, useSignIn } from "./auth";
import { firebaseConfigured } from "./firebase";
import { Console } from "./console";
import { fmtUptime } from "./format";
import { apiFetch } from "./api";

type BackendStatus = {
  status: string;
  version: string;
  uptime?: number;
};

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function SignInPanel() {
  const { busy, error, google, email } = useSignIn();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [emailValue, setEmailValue] = useState("");
  const [password, setPassword] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void email(emailValue, password, mode);
  };

  return (
    <section className="auth-card">
      <div className="auth-card-head">
        <h2>{mode === "in" ? "Sign in to your console" : "Create your account"}</h2>
        <p className="muted">
          {mode === "in"
            ? "Sign in with Google or email to monitor your paired devices."
            : "A new Firebase account is created instantly — then sign in to pair devices."}
        </p>
      </div>

      <button className="btn-google" disabled={busy} onClick={() => void google()}>
        <GoogleIcon />
        {busy ? "Signing in…" : "Continue with Google"}
      </button>

      <div className="divider">
        <span>or use email</span>
      </div>

      <form className="auth-form" onSubmit={submit}>
        <input
          type="email"
          placeholder="Email"
          value={emailValue}
          onChange={(e) => setEmailValue(e.target.value)}
          required
          autoComplete="email"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          autoComplete={mode === "in" ? "current-password" : "new-password"}
        />
        <button className="btn-primary" disabled={busy}>
          {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        type="button"
        className="auth-switch"
        onClick={() => setMode(mode === "in" ? "up" : "in")}
      >
        {mode === "in" ? "No account? Create one" : "Have an account? Sign in"}
      </button>

      {error && <p className="hint hint-error">{error}</p>}
    </section>
  );
}

function ConfigNotice() {
  return (
    <div className="auth-page">
      <section className="auth-card">
        <div className="auth-card-head">
          <h2>Firebase not configured yet</h2>
          <p className="muted">
            Add the Firebase web app config as <code>VITE_FIREBASE_*</code> env vars (API key, auth
            domain, project id) so the dashboard can sign you in.
          </p>
        </div>
      </section>
    </div>
  );
}

function AuthScreen({ status }: { status: BackendStatus | null }) {
  const online = !!status;
  return (
    <div className="auth-page">
      <div className="auth-brand">
        <span className="brand-mark">SU</span>
        <div className="brand-text">
          <h1>System Utility</h1>
          <p>Secure device monitoring console</p>
        </div>
      </div>
      <SignInPanel />
      <div className="auth-status">
        <div className={`pill ${online ? "pill-online" : "pill-offline"}`}>
          <span className="pill-dot" />
          {online ? `Backend online · v${status?.version ?? "?"}` : "Backend offline"}
        </div>
        {online && status?.uptime !== undefined && (
          <span className="muted">uptime {fmtUptime(status.uptime)}</span>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const { user, loading, token, refreshToken } = useAuth();
  const [status, setStatus] = useState<BackendStatus | null>(null);
  const [reachable, setReachable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await apiFetch("v2/status", { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as BackendStatus;
        if (!cancelled) {
          setStatus(data);
          setReachable(true);
        }
      } catch {
        if (!cancelled) {
          setStatus(null);
          setReachable(false);
        }
      }
    };

    check();
    const timer = setInterval(check, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const online = reachable === true;
  const unknown = reachable === null;
  const signedIn = !!user;

  if (!firebaseConfigured) return <ConfigNotice />;

  if (loading) {
    return (
      <div className="auth-page">
        <p className="muted loading-text">Checking session…</p>
      </div>
    );
  }

  if (!signedIn) return <AuthScreen status={online ? status : null} />;

  return (
    <Console
      token={token}
      user={user}
      status={{ online, unknown, version: status?.version }}
      onTokenExpired={() => void refreshToken()}
    />
  );
}
