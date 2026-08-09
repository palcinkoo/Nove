import { useEffect, useState } from "react";

export type DeviceSummary = {
  deviceId: string;
  status: string;
  battery: number | null;
  interval: number | null;
  lastSeen: number | null;
  updatedAt: number | null;
  pairedAt: number | null;
};

type DevicesResponse = { success: boolean; devices: DeviceSummary[] };

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

export function useDevices(token: string | null, onUnauthorized?: () => void) {
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
  }, [token, onUnauthorized]);

  return { devices, error, loading };
}

const fmtRelative = (ts: number | null, now: number) => {
  if (!ts || ts <= 0) return "never";
  const diff = Math.max(0, now - ts);
  if (diff < 60_000) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const fmtDate = (ts: number | null) => {
  if (!ts || ts <= 0) return "—";
  return new Date(ts).toLocaleString();
};

export function DevicesView({ token, onTokenExpired }: { token: string | null; onTokenExpired?: () => void }) {
  const { devices, error, loading } = useDevices(token, onTokenExpired);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const isOnline = (d: DeviceSummary) => {
    if (!d.lastSeen) return false;
    const grace = Math.max((d.interval || 60) * 2.5 * 1000, 120_000);
    return now - d.lastSeen < grace;
  };

  const batteryClass = (b: number | null) => {
    if (b === null) return "";
    if (b <= 15) return "low";
    if (b <= 40) return "mid";
    return "";
  };

  const onlineCount = devices.filter(isOnline).length;

  return (
    <section className="devices">
      <div className="devices-head">
        <div>
          <h2>Live devices</h2>
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

      {!loading && !error && devices.length === 0 && (
        <div className="empty-state">
          <span className="empty-icon">📡</span>
          <h3>No devices yet</h3>
          <p>
            Pair a device using the 6-digit code from the Android app (
            <code>POST /api/v2/pair</code>), and it will appear here with live
            telemetry.
          </p>
        </div>
      )}

      <div className="device-grid">
        {devices.map((d) => {
          const online = isOnline(d);
          return (
            <article className="device-card" key={d.deviceId}>
              <div className="device-head">
                <code className="device-id">{d.deviceId}</code>
                <span className={`device-pill ${online ? "device-online" : "device-offline"}`}>
                  <span className="pill-dot" />
                  {online ? "Online" : "Offline"}
                </span>
              </div>

              <div className="battery">
                <div className="battery-label">
                  <span>Battery</span>
                  <strong>{d.battery === null ? "—" : `${d.battery}%`}</strong>
                </div>
                <div className="battery-track">
                  <div
                    className={`battery-fill ${batteryClass(d.battery)}`}
                    style={{ width: `${d.battery ?? 0}%` }}
                  />
                </div>
              </div>

              <dl className="device-meta">
                <div>
                  <dt>Status</dt>
                  <dd>{d.status || "unknown"}</dd>
                </div>
                <div>
                  <dt>Interval</dt>
                  <dd>{d.interval ? `${d.interval}s` : "—"}</dd>
                </div>
                <div>
                  <dt>Last seen</dt>
                  <dd>{fmtRelative(d.lastSeen, now)}</dd>
                </div>
                <div>
                  <dt>Paired</dt>
                  <dd>{fmtDate(d.pairedAt)}</dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </section>
  );
}
