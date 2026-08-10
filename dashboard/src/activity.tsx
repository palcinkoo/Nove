import { useEffect, useMemo, useState } from "react";
import { fmtDateTime, fmtRelative } from "./format";

export type ActivityItem = {
  deviceId: string;
  type: string;
  ts: number;
  data?: Record<string, unknown>;
};

type ActivityResponse = { success: boolean; activity: ActivityItem[] };

const EVENT_META: Record<string, { icon: string; label: string }> = {
  paired: { icon: "🔗", label: "Device paired to account" },
  permission_lost: { icon: "🔓", label: "Permission lost on device" },
  online: { icon: "📶", label: "Device came online" },
  offline: { icon: "📵", label: "Device went offline" },
};

export const eventMeta = (type: string): { icon: string; label: string } =>
  EVENT_META[type] ?? { icon: "⚡", label: type.replace(/_/g, " ") };

async function fetchActivity(
  token: string,
  signal?: AbortSignal,
  onUnauthorized?: () => void
): Promise<ActivityItem[]> {
  const res = await fetch("/api/activity", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal,
  });
  if (res.status === 401 && onUnauthorized) onUnauthorized();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as ActivityResponse;
  return data.activity ?? [];
}

export function useActivity(token: string | null, onUnauthorized?: () => void) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();

    const poll = async () => {
      try {
        const list = await fetchActivity(token, controller.signal, onUnauthorized);
        if (!cancelled) {
          setItems(list);
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
    const timer = setInterval(poll, 15000);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [token, onUnauthorized]);

  return { items, error, loading };
}

export function ActivityFeed({ items, now }: { items: ActivityItem[]; now: number }) {
  if (items.length === 0) {
    return (
      <div className="feed-empty">
        <span>🕐</span>
        <p>No activity yet — pairing events and permission changes will show up here.</p>
      </div>
    );
  }

  return (
    <ol className="timeline">
      {items.map((item, i) => {
        const meta = eventMeta(item.type);
        const permissions = item.data?.permissions;
        const perms = Array.isArray(permissions) ? (permissions as string[]) : [];
        return (
          <li className="timeline-item" key={`${item.deviceId}-${item.ts}-${i}`}>
            <span className="timeline-dot" aria-hidden="true" />
            <div className="timeline-body">
              <div className="timeline-head">
                <span className="timeline-icon" aria-hidden="true">{meta.icon}</span>
                <span className="timeline-label">{meta.label}</span>
                <code className="timeline-device">{item.deviceId}</code>
              </div>
              {perms.length > 0 && (
                <div className="timeline-perms">
                  {perms.map((p) => (
                    <span className="perm-chip" key={p}>
                      {p.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              )}
              <time className="timeline-time" title={fmtDateTime(item.ts)}>
                {fmtRelative(item.ts, now)}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function ActivityView({
  token,
  onTokenExpired,
}: {
  token: string | null;
  onTokenExpired?: () => void;
}) {
  const { items, error, loading } = useActivity(token, onTokenExpired);
  const [now, setNow] = useState(() => Date.now());
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const deviceIds = useMemo(
    () => Array.from(new Set(items.map((i) => i.deviceId))).sort(),
    [items]
  );

  const visible = filter ? items.filter((i) => i.deviceId === filter) : items;

  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h2>Activity</h2>
          <p className="muted">
            Refreshes every 15s · {items.length} recent events across {deviceIds.length} devices
          </p>
        </div>
        {!loading && (
          <span className={`pill ${error ? "pill-offline" : "pill-online"}`}>
            <span className="pill-dot" />
            {error ? "Sync error" : "Live"}
          </span>
        )}
      </div>

      {error && <p className="hint hint-error">Couldn’t load activity: {error}</p>}

      <div className="filter-bar">
        <button
          className={`filter-chip ${filter === null ? "active" : ""}`}
          onClick={() => setFilter(null)}
        >
          All devices
        </button>
        {deviceIds.map((id) => (
          <button
            className={`filter-chip ${filter === id ? "active" : ""}`}
            key={id}
            onClick={() => setFilter(id)}
          >
            {id}
          </button>
        ))}
      </div>

      <div className="feed-card">
        <ActivityFeed items={visible} now={now} />
      </div>
    </section>
  );
}
