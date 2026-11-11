const dateTime = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" });
const relative = new Intl.RelativeTimeFormat("ko-KR", { numeric: "auto" });

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  return dateTime.format(new Date(iso));
}

export function formatRelative(iso: string, nowMs = Date.now()): string {
  const diffSec = Math.round((new Date(iso).getTime() - nowMs) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return relative.format(diffSec, "second");
  if (abs < 3600) return relative.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return relative.format(Math.round(diffSec / 3600), "hour");
  return relative.format(Math.round(diffSec / 86400), "day");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}초`;
  if (s === 0) return `${m}분`;
  return `${m}분 ${s}초`;
}
