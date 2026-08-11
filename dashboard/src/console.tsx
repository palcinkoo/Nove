import { useState, type ReactElement } from "react";
import type { User } from "firebase/auth";
import { signOut } from "./auth";
import { OverviewView } from "./overview";
import { DevicesView } from "./devices";
import { ActivityView } from "./activity";
import { BatteryView } from "./battery";

export type ConsoleTab = "overview" | "battery" | "activity" | "devices";

const ICONS: Record<ConsoleTab, ReactElement> = {
  overview: (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="6" height="6" rx="1.5" />
      <rect x="11" y="3" width="6" height="6" rx="1.5" />
      <rect x="3" y="11" width="6" height="6" rx="1.5" />
      <rect x="11" y="11" width="6" height="6" rx="1.5" />
    </svg>
  ),
  battery: (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="7" width="13" height="7" rx="1.5" />
      <line x1="17.5" y1="9.5" x2="17.5" y2="11.5" />
      <line x1="4.5" y1="9.2" x2="4.5" y2="11.8" />
      <line x1="7" y1="8.4" x2="7" y2="12.6" />
    </svg>
  ),
  activity: (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="2.5 11 6 11 8 4.5 11 15.5 13 9 15.5 11 17.5 11" />
    </svg>
  ),
  devices: (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="2.5" width="8" height="15" rx="2" />
      <line x1="8.5" y1="14.5" x2="11.5" y2="14.5" />
    </svg>
  ),
};

const NAV: Array<{ label: string; items: Array<{ id: ConsoleTab; label: string; desc: string }> }> = [
  {
    label: "Monitoring",
    items: [
      { id: "overview", label: "Dashboard", desc: "Fleet at a glance" },
      { id: "battery", label: "Battery", desc: "Charge history" },
      { id: "activity", label: "Activity", desc: "Event timeline" },
    ],
  },
  {
    label: "Management",
    items: [{ id: "devices", label: "Devices", desc: "Pair & manage" }],
  },
];

const TAB_LABEL = Object.fromEntries(NAV.flatMap((s) => s.items.map((i) => [i.id, i.label])));

type BackendStatus = {
  online: boolean;
  unknown: boolean;
  version?: string;
};

function Sidebar({
  tab,
  onTab,
  user,
  status,
}: {
  tab: ConsoleTab;
  onTab: (t: ConsoleTab) => void;
  user: User | null;
  status: BackendStatus;
}) {
  const email = user?.email ?? user?.displayName ?? "";
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-mark">SU</span>
        <div className="brand-text">
          <h1>System Utility</h1>
          <p>Monitoring console</p>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Dashboard sections">
        {NAV.map((section) => (
          <div className="nav-section" key={section.label}>
            <span className="nav-group-label">{section.label}</span>
            {section.items.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${tab === item.id ? "active" : ""}`}
                onClick={() => onTab(item.id)}
              >
                <span className="nav-icon">{ICONS[item.id]}</span>
                <span className="nav-text">
                  <strong>{item.label}</strong>
                  <small>{item.desc}</small>
                </span>
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className={`pill ${status.online ? "pill-online" : status.unknown ? "pill-checking" : "pill-offline"}`}>
          <span className="pill-dot" />
          {status.unknown
            ? "Checking backend…"
            : status.online
              ? `Backend online · v${status.version ?? "?"}`
              : "Backend offline"}
        </div>
        {user && (
          <div className="sidebar-user">
            <span className="user-avatar">
              {user.photoURL ? (
                <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
              ) : (
                (email[0] ?? "U").toUpperCase()
              )}
            </span>
            <span className="sidebar-user-meta">
              <strong>{email}</strong>
              <button className="btn-ghost" onClick={() => void signOut()}>
                Sign out
              </button>
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}

export function Console({
  token,
  user,
  status,
  onTokenExpired,
}: {
  token: string | null;
  user: User | null;
  status: BackendStatus;
  onTokenExpired?: () => void;
}) {
  const [tab, setTab] = useState<ConsoleTab>("overview");

  return (
    <div className="console">
      <Sidebar tab={tab} onTab={setTab} user={user} status={status} />
      <main className="console-main">
        <div className="console-topbar">
          <div className="console-breadcrumb">
            <span>Monitoring</span>
            <span className="crumb-sep">/</span>
            <strong>{TAB_LABEL[tab]}</strong>
          </div>
          <span className="console-updated">
            Auto-refresh <strong>10–15s</strong> · AES-256-GCM
          </span>
        </div>
        <div className="console-content">
          {tab === "overview" && (
            <OverviewView token={token} onTokenExpired={onTokenExpired} onNavigate={setTab} />
          )}
          {tab === "battery" && <BatteryView token={token} onTokenExpired={onTokenExpired} />}
          {tab === "activity" && <ActivityView token={token} onTokenExpired={onTokenExpired} />}
          {tab === "devices" && <DevicesView token={token} onTokenExpired={onTokenExpired} />}
        </div>
      </main>
    </div>
  );
}
