import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ActivityFeed, useActivity } from "./activity";
import {
  batteryClass,
  batteryStats,
  DeviceChips,
  isOnline,
  sendDeviceCommand,
  useDeviceHistory,
  useDevices,
  BatteryChart,
  BatteryGauge,
  type DeviceSummary,
} from "./devices";
import { fmtCadence, fmtRelative } from "./format";

function StatCard({
  label,
  value,
  icon,
  accent = "",
  sub,
}: {
  label: string;
  value: string | number;
  icon: string;
  accent?: string;
  sub?: string;
}) {
  return (
    <article className={`stat-card ${accent}`}>
      <span className="stat-card-icon" aria-hidden="true">{icon}</span>
      <div className="stat-card-body">
        <span className="stat-card-label">{label}</span>
        <strong className="stat-card-value">{value}</strong>
        {sub && <span className="stat-card-sub">{sub}</span>}
      </div>
    </article>
  );
}

function OverviewDeviceRow({
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
    <button className="overview-device" onClick={onOpen}>
      <span className={`ov-device-dot ${online ? "ok" : "off"}`} aria-hidden="true" />
      <code className="ov-device-id">{device.deviceId}</code>
      <span className="ov-device-meta">
        {online ? "online" : `last seen ${fmtRelative(device.lastSeen, now)}`} ·{" "}
        {device.battery === null ? "no battery data" : `${device.battery}%`}
      </span>
      <span className="ov-device-track">
        <span
          className={`ov-device-fill ${batteryClass(device.battery)}`}
          style={{ width: `${device.battery ?? 0}%` }}
        />
      </span>
    </button>
  );
}

function DeviceHero({
  device,
  history,
  now,
  token,
}: {
  device: DeviceSummary | null;
  history: { battery: Array<{ t: number; b: number }> };
  now: number;
  token: string | null;
}) {
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!device) return null;
  const online = isOnline(device, now);
  const stats = batteryStats(history.battery);
  const cfg = device.config;

  const syncNow = async () => {
    if (!token) return;
    setSyncing(true);
    setSyncMsg(null);
    try {
      await sendDeviceCommand(token, device.deviceId, "SYNC_NOW");
      setSyncMsg({ ok: true, text: "Príkaz odoslaný — dáta sa nahrajú v priebehu niekoľkých sekúnd." });
    } catch (e) {
      setSyncMsg({ ok: false, text: (e as Error).message });
    } finally {
      setSyncing(false);
    }
  };

  const sendInterval = async (type: "UPDATE_SYNC_INTERVAL" | "UPDATE_LOCATION_INTERVAL", minutes: number) => {
    if (!token) return;
    setSyncing(true);
    setSyncMsg(null);
    const what = type === "UPDATE_SYNC_INTERVAL" ? "Nahrávanie dát" : "Sledovanie polohy";
    try {
      await sendDeviceCommand(token, device.deviceId, type, { interval_minutes: minutes });
      setSyncMsg({
        ok: true,
        text: `${what}: interval zmenený na ${fmtCadence(minutes * 60)} — prejaví sa do minúty.`,
      });
    } catch (e) {
      setSyncMsg({ ok: false, text: (e as Error).message });
    } finally {
      setSyncing(false);
    }
  };

  const UPLOAD_OPTIONS = [
    { min: 15, label: "15 min" },
    { min: 60, label: "1 hour" },
    { min: 180, label: "3 hours" },
    { min: 360, label: "6 hours" },
    { min: 720, label: "12 hours" },
    { min: 1440, label: "24 hours" },
  ];
  const LOCATION_OPTIONS = [
    { min: 30, label: "30 min" },
    { min: 60, label: "1 hour" },
    { min: 180, label: "3 hours" },
    { min: 360, label: "6 hours" },
    { min: 720, label: "12 hours" },
    { min: 1440, label: "24 hours" },
  ];
  const currentSync = Math.round((cfg?.sync_interval ?? 300) / 60);
  const currentLoc = Math.round((cfg?.location_interval ?? 300) / 60);

  return (
    <section className="device-hero">
      <div className="device-hero-info">
        <BatteryGauge battery={device.battery} />
        <div className="device-hero-meta">
          <code className="device-hero-id">{device.deviceId}</code>
          <span className={`device-pill ${online ? "device-online" : "device-offline"}`}>
            <span className="pill-dot" />
            {online ? "Online" : "Offline"}
          </span>
        </div>
        <dl className="device-hero-stats">
          <div>
            <dt>Last seen</dt>
            <dd>{fmtRelative(device.lastSeen, now)}</dd>
          </div>
          <div>
            <dt>Heartbeat</dt>
            <dd>{fmtCadence(cfg?.heartbeat_interval ?? device.interval)}</dd>
          </div>
          <div>
            <dt>Paired</dt>
            <dd>{device.pairedAt ? new Date(device.pairedAt).toLocaleDateString() : "—"}</dd>
          </div>
        </dl>
        {stats && (
          <p className="device-hero-samples">
            {stats.samples} battery samples · min {stats.min}% · max {stats.max}%
          </p>
        )}
      </div>
      <div className="device-hero-main">
        <div className="device-hero-upload">
          <div className="upload-head">
            <strong>Upload cadence</strong>
            <button className="btn-ghost" disabled={syncing || !token} onClick={() => void syncNow()}>
              {syncing ? "Odosielam…" : "Sync now"}
            </button>
          </div>
          <div className="upload-stats">
            <div>
              <dt>Heartbeat</dt>
              <dd>{fmtCadence(cfg?.heartbeat_interval)}</dd>
            </div>
            <div>
              <dt>Data sync</dt>
              <dd>{fmtCadence(cfg?.sync_interval)}</dd>
            </div>
            <div>
              <dt>Device scan</dt>
              <dd>{fmtCadence(cfg?.scan_interval)}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>{fmtCadence(cfg?.location_interval)}</dd>
            </div>
          </div>
          <div className="interval-picker">
            <label>
              <span>Data upload interval</span>
              <select
                value={UPLOAD_OPTIONS.some((o) => o.min === currentSync) ? currentSync : ""}
                disabled={syncing || !token}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v) void sendInterval("UPDATE_SYNC_INTERVAL", v);
                }}
              >
                <option value="" disabled>
                  {currentSync} min (now)
                </option>
                {UPLOAD_OPTIONS.map((o) => (
                  <option key={o.min} value={o.min}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Location tracking interval</span>
              <select
                value={LOCATION_OPTIONS.some((o) => o.min === currentLoc) ? currentLoc : ""}
                disabled={syncing || !token}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v) void sendInterval("UPDATE_LOCATION_INTERVAL", v);
                }}
              >
                <option value="" disabled>
                  {currentLoc} min (now)
                </option>
                {LOCATION_OPTIONS.map((o) => (
                  <option key={o.min} value={o.min}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {syncMsg && (
            <p className={`hint ${syncMsg.ok ? "pair-ok" : "hint-error"}`} style={{ marginTop: 8 }}>
              {syncMsg.text}
            </p>
          )}
        </div>
        <div className="device-hero-chart">
          <BatteryChart points={history.battery} />
        </div>
      </div>
    </section>
  );
}

export function OverviewView({
  token,
  onTokenExpired,
}: {
  token: string | null;
  onTokenExpired?: () => void;
}) {
  const navigate = useNavigate();
  const { devices, loading } = useDevices(token, onTokenExpired);
  const { items: activity } = useActivity(token, onTokenExpired);
  const [now, setNow] = useState(() => Date.now());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const selected = devices.find((d) => d.deviceId === selectedId) ?? devices[0] ?? null;
  const { history } = useDeviceHistory(token, selected?.deviceId ?? null, onTokenExpired);

  const onlineCount = devices.filter((d) => isOnline(d, now)).length;
  const lowCount = devices.filter((d) => (d.battery ?? 100) <= 15).length;
  const avgBattery = devices.length
    ? Math.round(devices.reduce((sum, d) => sum + (d.battery ?? 0), 0) / devices.length)
    : null;

  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h2>Dashboard</h2>
          <p className="muted">Device overview · live battery telemetry and activity</p>

        </div>
        {!loading && (
          <span className="pill pill-online">
            <span className="pill-dot" />
            Live
          </span>
        )}
      </div>

      {devices.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">📡</span>
          <h3>No devices paired yet</h3>
          <p>
            Enter the 6-digit code from the Android app to pair your first device — it will then
            appear here with live battery telemetry, history charts and activity.
          </p>
          <button className="btn-primary" onClick={() => navigate("/devices")}>
            Pair a device
          </button>
        </div>
      ) : (
        <>
          <DeviceChips
            devices={devices}
            selectedId={selected?.deviceId ?? null}
            onSelect={setSelectedId}
            now={now}
          />

          <DeviceHero device={selected} history={history} now={now} token={token} />

          <div className="stat-grid">
            <StatCard label="Devices" value={devices.length} icon="📱" sub="paired devices" />
            <StatCard label="Online now" value={onlineCount} icon="🛰️" accent="ok" sub="heartbeat within grace" />
            <StatCard
              label="Average battery"
              value={avgBattery === null ? "—" : `${avgBattery}%`}
              icon="🔋"
              sub={devices.length ? `across ${devices.length} devices` : undefined}
            />
            <StatCard
              label="Low battery"
              value={lowCount}
              icon="⚠️"
              accent={lowCount > 0 ? "bad" : ""}
              sub="at or below 15%"
            />
          </div>

          <div className="overview-cols">
            <div className="overview-panel">
              <div className="panel-head">
                <h3>Recent activity</h3>
                <button className="link-btn" onClick={() => navigate("/activity")}>
                  View all →
                </button>
              </div>
              <ActivityFeed items={activity.slice(0, 8)} now={now} />
            </div>

            <div className="overview-panel">
              <div className="panel-head">
                <h3>Devices</h3>
                <button className="link-btn" onClick={() => navigate("/devices")}>
                  Manage →
                </button>
              </div>
              <div className="overview-devices">
                {devices.slice(0, 5).map((d) => (
                  <OverviewDeviceRow
                    key={d.deviceId}
                    device={d}
                    now={now}
                    onOpen={() => navigate("/devices")}
                  />
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
