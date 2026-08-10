import { useEffect, useState } from "react";
import { ActivityFeed, useActivity } from "./activity";
import { batteryClass, isOnline, useDevices, type DeviceSummary } from "./devices";
import { fmtRelative } from "./format";
import type { ConsoleTab } from "./console";

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

export function OverviewView({
  token,
  onTokenExpired,
  onNavigate,
}: {
  token: string | null;
  onTokenExpired?: () => void;
  onNavigate: (tab: ConsoleTab) => void;
}) {
  const { devices, loading } = useDevices(token, onTokenExpired);
  const { items: activity } = useActivity(token, onTokenExpired);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const onlineCount = devices.filter((d) => isOnline(d, now)).length;
  const lowCount = devices.filter((d) => (d.battery ?? 100) <= 15).length;
  const avgBattery = devices.length
    ? Math.round(devices.reduce((sum, d) => sum + (d.battery ?? 0), 0) / devices.length)
    : null;

  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h2>Overview</h2>
          <p className="muted">Fleet status at a glance · live telemetry from paired devices</p>
        </div>
        {!loading && (
          <span className="pill pill-online">
            <span className="pill-dot" />
            Live
          </span>
        )}
      </div>

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
            <button className="link-btn" onClick={() => onNavigate("activity")}>
              View all →
            </button>
          </div>
          <ActivityFeed items={activity.slice(0, 8)} now={now} />
        </div>

        <div className="overview-panel">
          <div className="panel-head">
            <h3>Devices</h3>
            <button className="link-btn" onClick={() => onNavigate("devices")}>
              Manage →
            </button>
          </div>
          {devices.length === 0 ? (
            <div className="empty-inline">
              <p className="muted">No devices paired yet — pair the first one with the code from the app.</p>
              <button className="btn-primary" onClick={() => onNavigate("devices")}>
                Pair a device
              </button>
            </div>
          ) : (
            <div className="overview-devices">
              {devices.slice(0, 5).map((d) => (
                <OverviewDeviceRow key={d.deviceId} device={d} now={now} onOpen={() => onNavigate("devices")} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
