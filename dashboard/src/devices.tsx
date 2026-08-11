import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { ActivityFeed } from "./activity";
import { fmtDateTime, fmtRelative, fmtTime } from "./format";

export type DeviceConfig = {
  heartbeat_interval?: number;
  sync_interval?: number;
  scan_interval?: number;
  location_interval?: number;
  updatedAt?: number;
};

export type DeviceSummary = {
  deviceId: string;
  status: string;
  battery: number | null;
  interval: number | null;
  lastSeen: number | null;
  updatedAt: number | null;
  pairedAt: number | null;
  config?: DeviceConfig | null;
};

export async function sendDeviceCommand(
  token: string,
  deviceId: string,
  type: string,
  extra?: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`/api/devices/${encodeURIComponent(deviceId)}/command`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    body: JSON.stringify({ type, ...extra }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
}

export type BatteryPoint = { t: number; b: number };

export type DeviceHistory = {
  battery: BatteryPoint[];
  events: Array<{ type: string; ts: number; data?: Record<string, unknown> }>;
};

type DevicesResponse = { success: boolean; devices: DeviceSummary[] };

export const isOnline = (d: DeviceSummary, now: number): boolean => {
  if (!d.lastSeen) return false;
  const grace = Math.max((d.interval || 60) * 2.5 * 1000, 120_000);
  return now - d.lastSeen < grace;
};

export const batteryClass = (b: number | null): string => {
  if (b === null) return "";
  if (b <= 15) return "low";
  if (b <= 40) return "mid";
  return "";
};

async function fetchDevices(
  token: string,
  signal?: AbortSignal,
  onUnauthorized?: () => void
): Promise<DeviceSummary[]> {
  const res = await fetch("/api/devices", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal,
  });
  if (res.status === 401 && onUnauthorized) onUnauthorized();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as DevicesResponse;
  return data.devices ?? [];
}

export type ModuleEntry = { t?: number } & Record<string, unknown>;

export type ModulesResponse = { success: boolean; modules: Record<string, ModuleEntry[]> };

export async function fetchDeviceModules(
  token: string,
  deviceId: string,
  modules?: string[],
  signal?: AbortSignal
): Promise<Record<string, ModuleEntry[]>> {
  const q =
    modules && modules.length ? `?module=${modules.map(encodeURIComponent).join(",")}` : "";
  const res = await fetch(`/api/devices/${encodeURIComponent(deviceId)}/modules${q}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as ModulesResponse;
  return data.modules ?? {};
}

export function useDeviceModules(
  token: string | null,
  deviceId: string | null,
  modules: string[],
  onUnauthorized?: () => void
) {
  const [data, setData] = useState<Record<string, ModuleEntry[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const moduleKey = modules.join(",");

  useEffect(() => {
    if (!token || !deviceId) {
      setData({});
      setLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();

    const poll = async () => {
      try {
        const m = await fetchDeviceModules(token, deviceId, modules, controller.signal);
        if (!cancelled) {
          setData(m);
          setError(null);
        }
      } catch (e) {
        if (!cancelled && (e as Error).name !== "AbortError") {
          setError((e as Error).message);
          if ((e as Error).message === "HTTP 401" && onUnauthorized) onUnauthorized();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    poll();
    const timer = setInterval(poll, 15000);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [token, deviceId, onUnauthorized, moduleKey]);

  return { data, error, loading };
}

export async function fetchDeviceHistory(
  token: string,
  deviceId: string,
  signal?: AbortSignal
): Promise<DeviceHistory> {
  const res = await fetch(`/api/devices/${encodeURIComponent(deviceId)}/history`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { battery?: BatteryPoint[]; events?: DeviceHistory["events"] };
  return { battery: data.battery ?? [], events: data.events ?? [] };
}

export function useDeviceHistory(
  token: string | null,
  deviceId: string | null,
  onTokenExpired?: () => void
) {
  const [history, setHistory] = useState<DeviceHistory>({ battery: [], events: [] });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !deviceId) {
      setHistory({ battery: [], events: [] });
      setError(null);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();

    const poll = async () => {
      try {
        const h = await fetchDeviceHistory(token, deviceId, controller.signal);
        if (!cancelled) {
          setHistory(h);
          setError(null);
        }
      } catch (e) {
        if (!cancelled && (e as Error).name !== "AbortError") {
          setError((e as Error).message);
          if ((e as Error).message === "HTTP 401" && onTokenExpired) onTokenExpired();
        }
      }
    };

    poll();
    const timer = setInterval(poll, 10000);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [token, deviceId, onTokenExpired]);

  return { history, error };
}

export function batteryStats(points: BatteryPoint[]) {
  if (points.length === 0) return null;
  const values = points.map((p) => p.b);
  return {
    current: values[values.length - 1],
    min: Math.min(...values),
    max: Math.max(...values),
    avg: Math.round(values.reduce((s, v) => s + v, 0) / values.length),
    samples: points.length,
  };
}

export function DeviceChips({
  devices,
  selectedId,
  onSelect,
  now,
}: {
  devices: DeviceSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  now: number;
}) {
  if (devices.length === 0) return null;
  return (
    <div className="device-chips" role="tablist" aria-label="Select device">
      {devices.map((d) => {
        const online = isOnline(d, now);
        return (
          <button
            key={d.deviceId}
            role="tab"
            aria-selected={d.deviceId === selectedId}
            className={`device-chip ${d.deviceId === selectedId ? "active" : ""}`}
            onClick={() => onSelect(d.deviceId)}
          >
            <span className={`device-chip-dot ${online ? "ok" : "off"}`} aria-hidden="true" />
            <code>{d.deviceId}</code>
            <span className="device-chip-batt">{d.battery === null ? "—" : `${d.battery}%`}</span>
          </button>
        );
      })}
    </div>
  );
}

export function useDevices(token: string | null, onUnauthorized?: () => void) {
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!token) {
      setDevices([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();

    const poll = async () => {
      try {
        const list = await fetchDevices(token, controller.signal, onUnauthorized);
        if (!cancelled) {
          setDevices(list);
          setError(null);
        }
      } catch (e) {
        if (!cancelled && (e as Error).name !== "AbortError") {
          setError((e as Error).message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    poll();
    const timer = setInterval(poll, 10000);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [token, onUnauthorized, reload]);

  return { devices, error, loading, refresh: () => setReload((r) => r + 1) };
}

async function pairDevice(token: string, code: string): Promise<string> {
  const res = await fetch("/api/pair", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    body: JSON.stringify({ code }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; deviceId?: string };
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.deviceId || "";
}

export function PairDeviceCard({
  token,
  onPaired,
  onUnauthorized,
}: {
  token: string;
  onPaired: () => void;
  onUnauthorized?: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setMessage({ ok: false, text: "Enter the exact 6-digit code shown in the Android app." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await pairDevice(token, trimmed);
      setCode("");
      setMessage({
        ok: true,
        text: "Device paired successfully — it will appear below with live telemetry.",
      });
      onPaired();
    } catch (err) {
      const e = err as Error;
      if (e.message === "Device already paired") {
        onPaired();
      }
      setMessage({
        ok: false,
        text:
          e.message === "HTTP 401"
            ? "Session expired — signing in again."
            : e.message === "Invalid or expired code"
              ? "Invalid or expired code — reopen the Android app so it re-sends the code, then try again within 5 minutes."
              : e.message,
      });
      if (e.message === "HTTP 401" && onUnauthorized) onUnauthorized();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="pair-card">
      <div className="pair-card-head">
        <div>
          <h2>Pair a device</h2>
          <p>
            Open the Android app and enter the 6-digit code shown on the setup screen, then tap{" "}
            <em>Pair</em>. The code expires after 5 minutes and the device appears here as soon as
            it is bound to your account.
          </p>
        </div>
        <span className="pill pill-online">
          <span className="pill-dot" />
          Code TTL 5 min
        </span>
      </div>
      <form className="pair-form" onSubmit={(e) => void submit(e)}>
        <input
          className="pair-code-input"
          type="text"
          inputMode="numeric"
          maxLength={6}
          placeholder="••••••"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          aria-label="6-digit pairing code"
          autoComplete="one-time-code"
        />
        <button className="btn-primary" disabled={busy}>
          {busy ? "Pairing…" : "Pair device"}
        </button>
      </form>
      {message && <p className={`hint ${message.ok ? "pair-ok" : "hint-error"}`}>{message.text}</p>}
    </section>
  );
}

export function BatteryGauge({ battery }: { battery: number | null }) {
  const b = battery ?? 0;
  const r = 34;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, b)) / 100) * c;
  const cls = b <= 15 ? "low" : b <= 40 ? "mid" : "ok";
  return (
    <div className="battery-gauge">
      <svg viewBox="0 0 84 84" role="img" aria-label={`Battery ${b}%`}>
        <circle cx="42" cy="42" r={r} fill="none" strokeWidth="8" className="gauge-track" />
        <circle
          cx="42"
          cy="42"
          r={r}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          className={`gauge-fill ${cls}`}
          strokeDasharray={`${dash.toFixed(2)} ${c.toFixed(2)}`}
          transform="rotate(-90 42 42)"
        />
      </svg>
      <div className="gauge-label">
        <strong>{battery === null ? "—" : `${battery}%`}</strong>
        <span>Battery</span>
      </div>
    </div>
  );
}

export function BatteryChart({ points }: { points: BatteryPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 600;
  const h = 170;
  const pad = 10;

  if (points.length === 0) {
    return (
      <div className="chart-empty">
        No battery history yet — the chart fills in as the device sends heartbeats.
      </div>
    );
  }

  const ts = points.map((p) => p.t);
  const minT = Math.min(...ts);
  const maxT = Math.max(...ts);
  const span = Math.max(maxT - minT, 1);

  const x = (t: number) => pad + ((t - minT) / span) * (w - pad * 2);
  const y = (b: number) => h - pad - (Math.max(0, Math.min(100, b)) / 100) * (h - pad * 2);

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.b).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(maxT).toFixed(1)},${(h - pad).toFixed(1)} L${x(minT).toFixed(1)},${(
    h - pad
  ).toFixed(1)} Z`;

  const last = points[points.length - 1];
  const hoverPt = hover !== null ? points[hover] : null;

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const idx = Math.round(ratio * (points.length - 1));
    setHover(Math.min(Math.max(idx, 0), points.length - 1));
  };

  return (
    <div className="chart-wrap">
      <div className="chart-top">
        <span className="chart-title">Battery history</span>
        <span className="chart-range">
          {fmtTime(minT)} → {fmtTime(maxT)} · {points.length} samples
        </span>
      </div>
      <div className="battery-chart" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="chart-svg">
          <defs>
            <linearGradient id="batteryFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4f8cff" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#4f8cff" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#batteryFill)" />
          <path d={line} fill="none" stroke="#4f8cff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {hoverPt && (
            <line
              x1={x(hoverPt.t)}
              y1={pad}
              x2={x(hoverPt.t)}
              y2={h - pad}
              stroke="rgba(230,233,242,0.35)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {hoverPt && (
            <circle cx={x(hoverPt.t)} cy={y(hoverPt.b)} r="4" fill="#4f8cff" stroke="#fff" strokeWidth="1.5" />
          )}
        </svg>
        {hoverPt && (
          <div
            className="chart-tooltip"
            style={{ left: `${(x(hoverPt.t) / w) * 100}%` }}
          >
            <strong>{hoverPt.b}%</strong>
            <span>{fmtDateTime(hoverPt.t)}</span>
          </div>
        )}
        <span className="chart-min">{last.b}% now</span>
      </div>
    </div>
  );
}

function DeviceCard({
  device,
  now,
  onOpen,
}: {
  device: DeviceSummary;
  now: number;
  onOpen: () => void;
}) {
  const online = isOnline(device, now);
  return (
    <article className="device-card" onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}>
      <div className="device-head">
        <code className="device-id">{device.deviceId}</code>
        <span className={`device-pill ${online ? "device-online" : "device-offline"}`}>
          <span className="pill-dot" />
          {online ? "Online" : "Offline"}
        </span>
      </div>

      <div className="battery">
        <div className="battery-label">
          <span>Battery</span>
          <strong>{device.battery === null ? "—" : `${device.battery}%`}</strong>
        </div>
        <div className="battery-track">
          <div
            className={`battery-fill ${batteryClass(device.battery)}`}
            style={{ width: `${device.battery ?? 0}%` }}
          />
        </div>
      </div>

      <dl className="device-meta">
        <div>
          <dt>Status</dt>
          <dd>{device.status || "unknown"}</dd>
        </div>
        <div>
          <dt>Last seen</dt>
          <dd>{fmtRelative(device.lastSeen, now)}</dd>
        </div>
        <div>
          <dt>Interval</dt>
          <dd>{device.interval ? `${device.interval}s` : "—"}</dd>
        </div>
        <div>
          <dt>Paired</dt>
          <dd>{fmtDateTime(device.pairedAt)}</dd>
        </div>
      </dl>
      <span className="device-open">View telemetry →</span>
    </article>
  );
}

function DeviceDetail({
  token,
  device,
  now,
  onClose,
  onTokenExpired,
}: {
  token: string;
  device: DeviceSummary;
  now: number;
  onClose: () => void;
  onTokenExpired?: () => void;
}) {
  const { history, error } = useDeviceHistory(token, device.deviceId, onTokenExpired);
  const online = isOnline(device, now);

  return (
    <section className="device-detail">
      <header className="detail-head">
        <button className="btn-ghost" onClick={onClose}>← Back to devices</button>
        <div className="detail-title">
          <code>{device.deviceId}</code>
          <span className={`device-pill ${online ? "device-online" : "device-offline"}`}>
            <span className="pill-dot" />
            {online ? "Online" : "Offline"}
          </span>
        </div>
      </header>

      {error && <p className="hint hint-error">History unavailable: {error}</p>}

      <div className="detail-grid">
        <BatteryGauge battery={device.battery} />
        <dl className="detail-stats">
          <div>
            <dt>Status</dt>
            <dd>{device.status || "unknown"}</dd>
          </div>
          <div>
            <dt>Heartbeat interval</dt>
            <dd>{device.interval ? `${device.interval}s` : "—"}</dd>
          </div>
          <div>
            <dt>Last seen</dt>
            <dd>{fmtRelative(device.lastSeen, now)}</dd>
          </div>
          <div>
            <dt>Last heartbeat</dt>
            <dd>{fmtDateTime(device.lastSeen)}</dd>
          </div>
          <div>
            <dt>Paired</dt>
            <dd>{fmtDateTime(device.pairedAt)}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{fmtDateTime(device.updatedAt)}</dd>
          </div>
        </dl>
      </div>

      <BatteryChart points={history.battery} />

      <div className="detail-section">
        <h3>Activity</h3>
        {history.events.length === 0 ? (
          <p className="muted">No events recorded yet — pairing and permission changes appear here.</p>
        ) : (
          <ActivityFeed items={history.events.map((e) => ({ ...e, deviceId: device.deviceId }))} now={now} />
        )}
      </div>
    </section>
  );
}

export function DevicesView({
  token,
  onTokenExpired,
}: {
  token: string | null;
  onTokenExpired?: () => void;
}) {
  const { devices, error, loading, refresh } = useDevices(token, onTokenExpired);
  const [now, setNow] = useState(() => Date.now());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const onlineCount = devices.filter((d) => isOnline(d, now)).length;
  const selected = devices.find((d) => d.deviceId === selectedId) ?? null;

  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h2>Devices</h2>
          <p className="muted">
            Refreshes every 10s · {devices.length} paired · {onlineCount} online
          </p>
        </div>
        {!loading && (
          <span className={`pill ${error ? "pill-offline" : "pill-online"}`}>
            <span className="pill-dot" />
            {error ? "Sync error" : "Live"}
          </span>
        )}
      </div>

      {error && <p className="hint hint-error">Couldn’t load devices: {error}</p>}

      {token && <PairDeviceCard token={token} onPaired={refresh} onUnauthorized={onTokenExpired} />}

      {selected ? (
        <DeviceDetail
          token={token ?? ""}
          device={selected}
          now={now}
          onClose={() => setSelectedId(null)}
          onTokenExpired={onTokenExpired}
        />
      ) : !loading && !error && devices.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">📡</span>
          <h3>No devices yet</h3>
          <p>
            Enter the 6-digit code from the Android app above to pair your first device — it will
            then appear here with live telemetry, battery history and activity.
          </p>
        </div>
      ) : (
        <div className="device-grid">
          {devices.map((d) => (
            <DeviceCard key={d.deviceId} device={d} now={now} onOpen={() => setSelectedId(d.deviceId)} />
          ))}
        </div>
      )}
    </section>
  );
}
