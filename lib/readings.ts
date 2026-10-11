// Shapes and formatting for reading records on the client.

export type ReadingStatus = "reading" | "finished" | "stopped";

export type ReadingView = {
  id: number;
  bookId: number | null;
  title: string;
  author: string;
  publisher: string;
  status: ReadingStatus;
  startedAt: string | null;
  finishedAt: string | null;
  stoppedAt: string | null;
  datesUnknown: boolean;
  round: number;
  review: string;
  memo: string;
  currentPage: number | null;
  matchStatus: string;
  source: string;
  cover: string | null;
  pages: number | null;
  category: string | null;
  noteCount: number;
};

export const statusLabels: Record<ReadingStatus, string> = {
  reading: "읽는 중",
  finished: "완독",
  stopped: "중단",
};

/** "2026.08.08" */
export function dotDate(value: string | null | undefined) {
  return value ? value.replace(/-/g, ".") : "";
}

export function daysBetween(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  return days > 0 ? days : null;
}

/** The date a record belongs to on a timeline. */
export function readingDate(reading: Pick<ReadingView, "status" | "finishedAt" | "stoppedAt" | "startedAt">) {
  if (reading.status === "finished") return reading.finishedAt;
  if (reading.status === "stopped") return reading.stoppedAt ?? reading.startedAt;
  return reading.startedAt;
}

export function readingPeriod(reading: ReadingView) {
  if (reading.datesUnknown) return "2021년 이전 · 날짜 미상";
  const end = reading.status === "finished" ? reading.finishedAt : reading.status === "stopped" ? reading.stoppedAt : null;
  const days = daysBetween(reading.startedAt, end);
  if (reading.status === "reading") return reading.startedAt ? `${dotDate(reading.startedAt)}부터` : "";
  const range = reading.startedAt && end && reading.startedAt !== end ? `${dotDate(reading.startedAt)} – ${dotDate(end).slice(5)}` : dotDate(end);
  return days && days > 1 ? `${range} · ${days}일` : range;
}

export function progress(reading: Pick<ReadingView, "currentPage" | "pages">) {
  if (!reading.currentPage || !reading.pages) return null;
  return Math.min(100, Math.round((reading.currentPage / reading.pages) * 100));
}
