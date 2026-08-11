export const fmtRelative = (ts: number | null | undefined, now: number): string => {
  if (!ts || ts <= 0) return "never";
  const diff = Math.max(0, now - ts);
  if (diff < 60_000) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

export const fmtTime = (ts: number | null | undefined): string => {
  if (!ts || ts <= 0) return "—";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export const fmtDateTime = (ts: number | null | undefined): string => {
  if (!ts || ts <= 0) return "—";
  return new Date(ts).toLocaleString();
};

export const fmtUptime = (s?: number): string => {
  if (!s || s < 0) return "—";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

// Seconds → human cadence: 60 → "60s", 300 → "5 min", 3600 → "1 h".
export const fmtCadence = (s?: number | null): string => {
  if (!s || s <= 0) return "—";
  if (s < 60) return `${s}s`;
  const m = s / 60;
  if (m < 60) return `${Number.isInteger(m) ? m : Math.round(m * 10) / 10} min`;
  const h = m / 60;
  return `${Number.isInteger(h) ? h : Math.round(h * 10) / 10} h`;
};
