// Text for the 완독 share image (X, 16:9). Kept free of DOM so it can be tested.
import { dotDate, isYearOnly, daysBetween, type ReadingView } from "./readings";

const ROLES: Record<string, string> = { 지은이: "지음", 옮긴이: "옮김", 엮은이: "엮음", 그린이: "그림", 그림: "그림", 감수: "감수" };

/** "대니얼 카너먼 (지은이), 이창신 (옮긴이)" → "대니얼 카너먼 지음 · 이창신 옮김" */
export function shareCredits(author: string) {
  return author
    .split(/,\s*/)
    .map((part) => part.trim().replace(/\s*\(([^()]+)\)$/, (whole, role: string) => (ROLES[role] ? ` ${ROLES[role]}` : whole)))
    .filter(Boolean)
    .join(" · ");
}

/** Aladin titles carry the subtitle after " - "; the card sets it smaller. */
export function shareTitle(title: string) {
  const [main, ...rest] = title.split(/\s[-–—]\s/);
  return { main: main.trim(), sub: rest.join(" - ").trim() };
}

/** The reading period line and its length, e.g. "2026.10.24 – 2026.11.14", "22일". */
export function sharePeriod(reading: Pick<ReadingView, "startedAt" | "finishedAt" | "datesUnknown">) {
  if (reading.datesUnknown || !reading.finishedAt) return { range: "", days: "" };
  if (isYearOnly(reading.finishedAt)) return { range: `${reading.finishedAt}년`, days: "" };
  const start = reading.startedAt && reading.startedAt !== reading.finishedAt ? reading.startedAt : null;
  const days = daysBetween(start, reading.finishedAt);
  return {
    range: start ? `${dotDate(start)} – ${dotDate(reading.finishedAt)}` : dotDate(reading.finishedAt),
    days: days && days > 1 ? `${days}일` : "",
  };
}
