// Validation for reading edits coming from the UI.
import type { ReadingStatus } from "../db/schema";

const STATUSES: ReadingStatus[] = ["reading", "finished", "stopped"];
const isDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

export type ReadingPatch = Partial<{
  status: ReadingStatus;
  startedAt: string | null;
  finishedAt: string | null;
  stoppedAt: string | null;
  /** 날짜 모름: clears the dates. */
  datesUnknown: boolean;
  review: string;
  memo: string;
  currentPage: number | null;
  bookId: number | null;
}>;

export function readingPatch(input: Record<string, unknown>): ReadingPatch | string {
  const patch: ReadingPatch = {};
  if ("status" in input) {
    if (!STATUSES.includes(input.status as ReadingStatus)) return "상태가 올바르지 않습니다.";
    patch.status = input.status as ReadingStatus;
  }
  for (const key of ["startedAt", "finishedAt", "stoppedAt"] as const) {
    if (!(key in input)) continue;
    const value = input[key];
    if (value === null || value === "") patch[key] = null;
    else if (isDate(value)) patch[key] = value;
    else return "날짜 형식이 올바르지 않습니다.";
  }
  if ("datesUnknown" in input) {
    patch.datesUnknown = Boolean(input.datesUnknown);
    if (patch.datesUnknown) Object.assign(patch, { startedAt: null, finishedAt: null, stoppedAt: null });
  }
  if ("review" in input) patch.review = String(input.review ?? "").slice(0, 500);
  if ("memo" in input) patch.memo = String(input.memo ?? "").slice(0, 10000);
  if ("currentPage" in input) {
    const value = input.currentPage;
    patch.currentPage = value === null || value === "" ? null : Math.max(0, Math.round(Number(value))) || null;
  }
  if ("bookId" in input) {
    const value = Number(input.bookId);
    patch.bookId = Number.isInteger(value) && value > 0 ? value : null;
  }
  return patch;
}

export function today() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
