import { useEffect, useState } from "react";
import { ActivityFeed, useActivity } from "./activity";
import {
  batteryClass,
  batteryStats,
  DeviceChips,
  isOnline,
  useDeviceHistory,
  useDevices,
  BatteryChart,
  BatteryGauge,
  type DeviceSummary,
} from "./devices";
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

function DeviceHero({
  device,
  history,
  now,
}: {
  device: DeviceSummary | null;
  history: { battery: Array<{ t: number; b: number }> };
  now: number;
}) {
  if (!device) return null;
  const online = isOnline(device, now);
  const stats = batteryStats(history.battery);
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
            <dt>Interval</dt>
            <dd>{device.interval ? `${device.interval}s` : "—"}</dd>
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
      <div className="device-hero-chart">
        <BatteryChart points={history.battery} />
      </div>
    </section>
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
          <button className="btn-primary" onClick={() => onNavigate("devices")}>
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

          <DeviceHero device={selected} history={history} now={now} />

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
              <div className="overview-devices">
                {devices.slice(0, 5).map((d) => (
                  <OverviewDeviceRow
                    key={d.deviceId}
                    device={d}
                    now={now}
                    onOpen={() => onNavigate("devices")}
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
