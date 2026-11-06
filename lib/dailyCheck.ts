// The daily run takes minutes, so allow a margin past 24 hours before calling it late.
const STALE_AFTER_MS = 26 * 60 * 60 * 1000;

// checked_at is SQLite CURRENT_TIMESTAMP: UTC, "YYYY-MM-DD HH:MM:SS".
export function isDailyCheckStale(lastRunAt: string | null, now = new Date()): boolean {
  if (!lastRunAt) return false;
  return now.getTime() - Date.parse(`${lastRunAt.replace(" ", "T")}Z`) > STALE_AFTER_MS;
}
