import { useEffect, useState, type FormEvent } from "react";
import { useAuth, useSignIn, signOut } from "./auth";
import { DevicesView } from "./devices";
import { firebaseConfigured } from "./firebase";

type BackendStatus = {
  status: string;
  version: string;
  uptime?: number;
};

type Feature = {
  icon: string;
  title: string;
  text: string;
};

const FEATURES: Feature[] = [
  {
    icon: "🔐",
    title: "AES-256-GCM Encryption",
    text: "All sensitive batch data is encrypted at rest with a rotating IV and auth tag.",
  },
  {
    icon: "🛡️",
    title: "Rate Limited API",
    text: "Telemetry capped at 50 req / 5 min, pairing at 5 req / 15 min, with IP fallback.",
  },
  {
    icon: "📡",
    title: "Device Telemetry",
    text: "Heartbeats report status, battery and interval — every 30s to 60min.",
  },
  {
    icon: "🔑",
    title: "Secure Pairing",
    text: "6-digit codes with 5-minute expiry, bound to Firebase-verified accounts.",
  },
];

const ENDPOINTS: Array<[string, string, string]> = [
  ["POST", "/api/v2/telemetry", "Device heartbeat / status update"],
  ["POST", "/api/v2/data", "Send encrypted batch data"],
  ["POST", "/api/v2/pair", "Pair a device with a user account (auth)"],
  ["GET", "/api/v2/devices", "List your devices with live telemetry (auth)"],
  ["GET", "/api/v2/devices/:deviceId", "Read device details (auth)"],
];

const fmtUptime = (s?: number) => {
  if (!s || s < 0) return "—";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
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
        <h2>{mode === "in" ? "Sign in to view your devices" : "Create your account"}</h2>
        <p className="muted">
          {mode === "in"
            ? "Sign in with Google or email to see live telemetry for your paired devices."
            : "A new Firebase account is created instantly — then sign in to pair devices."}
        </p>
      </div>

      <button
        className="btn-google"
        disabled={busy}
        onClick={() => void google()}
      >
        <GoogleIcon />
        {busy ? "Signing in…" : "Continue with Google"}
      </button>

      <div className="divider"><span>or use email</span></div>

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
    <section className="auth-card">
      <div className="auth-card-head">
        <h2>Firebase not configured yet</h2>
        <p className="muted">
          Add the Firebase web app config as <code>VITE_FIREBASE_*</code> env vars
          (API key, auth domain, project id) so the dashboard can sign you in.
        </p>
      </div>
    </section>
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
        const res = await fetch("/api/status", { headers: { Accept: "application/json" } });
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
  const signedInEmail = user?.email ?? user?.displayName ?? "";

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">SU</span>
          <div className="brand-text">
            <h1>System Utility</h1>
            <p>Secure data synchronization platform</p>
          </div>
        </div>
        <div className="topbar-right">
          {signedIn && (
            <div className="user-chip">
              <span className="user-avatar">
                {user?.photoURL ? (
                  <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
                ) : (
                  (signedInEmail[0] ?? "U").toUpperCase()
                )}
              </span>
              <span className="user-email">{signedInEmail}</span>
              <button
                className="btn-ghost"
                onClick={() => void signOut()}
                disabled={!user}
              >
                Sign out
              </button>
            </div>
          )}
          <div className={`pill ${online ? "pill-online" : unknown ? "pill-checking" : "pill-offline"}`}>
            <span className="pill-dot" />
            {unknown
              ? "Checking backend…"
              : online
                ? `Backend online · v${status?.version ?? "?"}`
                : "Backend offline"}
          </div>
        </div>
      </header>

      <main>
        {!firebaseConfigured && <ConfigNotice />}

        {!loading && !firebaseConfigured && (
          <section className="status-card">
            <div className="status-card-head">
              <h2>Backend status</h2>
              <span className="muted">updates every 10s</span>
            </div>
            <div className="status-grid">
              <div className="stat">
                <span className="stat-label">Status</span>
                <span className={`stat-value ${online ? "ok" : "bad"}`}>
                  {unknown ? "Checking…" : online ? "Online" : "Unreachable"}
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">Version</span>
                <span className="stat-value">{status?.version ?? "—"}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Uptime</span>
                <span className="stat-value">{online ? fmtUptime(status?.uptime) : "—"}</span>
              </div>
            </div>
          </section>
        )}

        {loading && <p className="muted loading-text">Checking session…</p>}

        {!loading && firebaseConfigured && !signedIn && (
          <>
            <SignInPanel />
            <section className="status-card">
              <div className="status-card-head">
                <h2>Backend status</h2>
                <span className="muted">updates every 10s</span>
              </div>
              <div className="status-grid">
                <div className="stat">
                  <span className="stat-label">Status</span>
                  <span className={`stat-value ${online ? "ok" : "bad"}`}>
                    {unknown ? "Checking…" : online ? "Online" : "Unreachable"}
                  </span>
                </div>
                <div className="stat">
                  <span className="stat-label">Version</span>
                  <span className="stat-value">{status?.version ?? "—"}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Uptime</span>
                  <span className="stat-value">{online ? fmtUptime(status?.uptime) : "—"}</span>
                </div>
              </div>
              {!online && !unknown && (
                <p className="hint">
                  The API server isn’t running. Start it with <code>npm run start:server</code>{" "}
                  (Firebase env vars required) or run <code>npm run dev:full</code> to launch both.
                </p>
              )}
            </section>
          </>
        )}

        {!loading && signedIn && (
          <DevicesView token={token} onTokenExpired={() => void refreshToken()} />
        )}

        <section className="features">
          {FEATURES.map((f) => (
            <article className="feature" key={f.title}>
              <span className="feature-icon">{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
        </section>

        <section className="endpoints">
          <h2>API endpoints</h2>
          <div className="endpoint-list">
            {ENDPOINTS.map(([method, path, desc]) => (
              <div className="endpoint" key={path}>
                <span className={`method method-${method.toLowerCase()}`}>{method}</span>
                <code className="endpoint-path">{path}</code>
                <span className="endpoint-desc">{desc}</span>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer>
        <p>
          System Utility <code>v3.1.0</code> · AES-256-GCM · Helmet · express-rate-limit
        </p>
      </footer>
    </div>
  );
}
