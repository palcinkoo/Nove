import { useEffect, useState } from "react";
import {
  batteryClass,
  batteryStats,
  DeviceChips,
  isOnline,
  useDeviceHistory,
  useDevices,
  BatteryChart,
  BatteryGauge,
} from "./devices";
import { fmtRelative } from "./format";

function BatteryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="battery-stat">
      <span className="battery-stat-label">{label}</span>
      <strong className="battery-stat-value">{value}</strong>
    </div>
  );
}

export function BatteryView({
  token,
  onTokenExpired,
}: {
  token: string | null;
  onTokenExpired?: () => void;
}) {
  const { devices, loading, error: devicesError } = useDevices(token, onTokenExpired);
  const [now, setNow] = useState(() => Date.now());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const selected = devices.find((d) => d.deviceId === selectedId) ?? devices[0] ?? null;
  const { history, error: historyError } = useDeviceHistory(
    token,
    selected?.deviceId ?? null,
    onTokenExpired
  );
  const stats = batteryStats(history.battery);

  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h2>Battery</h2>
          <p className="muted">
            Charge history · {devices.length} paired {devices.length === 1 ? "device" : "devices"}
          </p>
        </div>
        {!loading && (
          <span className={`pill ${devicesError ? "pill-offline" : "pill-online"}`}>
            <span className="pill-dot" />
            {devicesError ? "Sync error" : "Live"}
          </span>
        )}
      </div>

      {devicesError && <p className="hint hint-error">Couldn’t load devices: {devicesError}</p>}

      {devices.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🔋</span>
          <h3>No battery data yet</h3>
          <p>
            Pair a device first — battery telemetry is recorded with every heartbeat and appears
            here as a live history chart.
          </p>
        </div>
      ) : (
        <>
          <DeviceChips
            devices={devices}
            selectedId={selected?.deviceId ?? null}
            onSelect={setSelectedId}
            now={now}
          />

          <div className="battery-grid">
            <div className="battery-side">
              <BatteryGauge battery={selected?.battery ?? null} />
              <p className="battery-side-note">
                {selected ? (
                  <>
                    {isOnline(selected, now)
                      ? `Online · last seen ${fmtRelative(selected.lastSeen, now)}`
                      : `Offline · last seen ${fmtRelative(selected.lastSeen, now)}`}
                  </>
                ) : null}
              </p>
            </div>

            <div className="battery-main">
              <BatteryChart points={history.battery} />
              {historyError && <p className="hint hint-error">History unavailable: {historyError}</p>}

              <div className="battery-stats">
                <BatteryStat label="Current" value={stats ? `${stats.current}%` : "—"} />
                <BatteryStat label="Minimum" value={stats ? `${stats.min}%` : "—"} />
                <BatteryStat label="Maximum" value={stats ? `${stats.max}%` : "—"} />
                <BatteryStat label="Average" value={stats ? `${stats.avg}%` : "—"} />
                <BatteryStat label="Samples" value={stats ? `${stats.samples}` : "—"} />
              </div>
            </div>
          </div>

          <div className="battery-list-panel">
            <div className="panel-head">
              <h3>All devices</h3>
            </div>
            <div className="battery-list">
              {devices.map((d) => {
                const online = isOnline(d, now);
                return (
                  <button
                    key={d.deviceId}
                    className={`battery-row ${d.deviceId === selected?.deviceId ? "active" : ""}`}
                    onClick={() => setSelectedId(d.deviceId)}
                  >
                    <span className={`ov-device-dot ${online ? "ok" : "off"}`} aria-hidden="true" />
                    <code>{d.deviceId}</code>
                    <span className="battery-row-track">
                      <span
                        className={`ov-device-fill ${batteryClass(d.battery)}`}
                        style={{ width: `${d.battery ?? 0}%` }}
                      />
                    </span>
                    <strong>{d.battery === null ? "—" : `${d.battery}%`}</strong>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
