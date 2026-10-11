// Reading-pattern statistics. Pure functions over reading rows so the stats
// page can switch years instantly and tests can pin the arithmetic.
import { bookCategory } from "./books";

export type StatReading = {
  bookId: number | null;
  title: string;
  author: string;
  category: string | null;
  pages: number | null;
  status: "reading" | "finished" | "stopped";
  startedAt: string | null;
  finishedAt: string | null;
  stoppedAt: string | null;
  datesUnknown: boolean;
  round: number;
  rating: number | null;
};

const DAY = 86400000;

export function daysInclusive(start: string, end: string) {
  return Math.round((Date.parse(end) - Date.parse(start)) / DAY) + 1;
}

export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// "피터 린치, 존 로스차일드 (지은이), 고영태 (옮긴이)" → "피터 린치"
export function primaryAuthor(author: string) {
  return author
    .replace(/\([^)]*\)/g, " ")
    .split(/[,|·]/)[0]
    .replace(/\s+(지음|옮김|엮음|외)\s*$/, "")
    .trim();
}

/** Finished with a real date, optionally within a year ("" = all years). */
export function finishedIn(readings: StatReading[], year: string) {
  return readings.filter(
    (reading) => reading.status === "finished" && reading.finishedAt && !reading.datesUnknown && (!year || reading.finishedAt.startsWith(year)),
  );
}

export function summary(readings: StatReading[], year: string, today: string) {
  const finished = finishedIn(readings, year);
  const durations = finished.filter((reading) => reading.startedAt).map((reading) => daysInclusive(reading.startedAt!, reading.finishedAt!)).filter((days) => days > 0);
  const withPages = finished.filter((reading) => reading.pages);
  const pages = withPages.reduce((sum, reading) => sum + (reading.pages ?? 0), 0);
  const speeds = withPages
    .filter((reading) => reading.startedAt)
    .map((reading) => (reading.pages ?? 0) / daysInclusive(reading.startedAt!, reading.finishedAt!))
    .filter((speed) => Number.isFinite(speed) && speed > 0);
  const stopped = readings.filter((reading) => reading.status === "stopped" && (!year || (reading.stoppedAt ?? reading.startedAt ?? "").startsWith(year)));
  const undated = year ? 0 : readings.filter((reading) => reading.status === "finished" && reading.datesUnknown).length;

  // Year-to-date against the same span of the previous year.
  let previousSamePeriod: number | null = null;
  if (year && year === today.slice(0, 4)) {
    const previousYear = String(Number(year) - 1);
    const cutoff = `${previousYear}${today.slice(4)}`;
    previousSamePeriod = finishedIn(readings, previousYear).filter((reading) => reading.finishedAt! <= cutoff).length;
  }

  return {
    finished: finished.length,
    undated,
    pages,
    pagesCovered: withPages.length,
    medianDays: median(durations),
    pagesPerDay: median(speeds),
    stopped: stopped.length,
    stopRate: finished.length + stopped.length ? stopped.length / (finished.length + stopped.length) : null,
    previousSamePeriod,
  };
}

export function byMonth(readings: StatReading[], year: string) {
  const counts = Array.from({ length: 12 }, () => 0);
  for (const reading of finishedIn(readings, year)) counts[Number(reading.finishedAt!.slice(5, 7)) - 1] += 1;
  return counts.map((value, index) => ({ label: `${index + 1}월`, value }));
}

export function byYear(readings: StatReading[]) {
  const map = new Map<string, number>();
  for (const reading of finishedIn(readings, "")) {
    const year = reading.finishedAt!.slice(0, 4);
    map.set(year, (map.get(year) ?? 0) + 1);
  }
  const years = [...map.keys()].sort();
  if (!years.length) return [];
  const result = [];
  for (let year = Number(years[0]); year <= Number(years.at(-1)); year += 1) {
    result.push({ label: `${year}`, value: map.get(String(year)) ?? 0 });
  }
  return result;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function byWeekday(readings: StatReading[], year: string) {
  const counts = Array.from({ length: 7 }, () => 0);
  for (const reading of finishedIn(readings, year)) counts[new Date(`${reading.finishedAt}T00:00:00Z`).getUTCDay()] += 1;
  return counts.map((value, index) => ({ label: WEEKDAYS[index], value }));
}

const DURATION_BUCKETS: Array<{ label: string; max: number }> = [
  { label: "하루", max: 1 },
  { label: "2–7일", max: 7 },
  { label: "8–14일", max: 14 },
  { label: "15–30일", max: 30 },
  { label: "31–60일", max: 60 },
  { label: "61일+", max: Infinity },
];

export function durationBuckets(readings: StatReading[], year: string) {
  const counts = DURATION_BUCKETS.map(() => 0);
  for (const reading of finishedIn(readings, year)) {
    if (!reading.startedAt) continue;
    const days = daysInclusive(reading.startedAt, reading.finishedAt!);
    if (days < 1) continue;
    counts[DURATION_BUCKETS.findIndex((bucket) => days <= bucket.max)] += 1;
  }
  return DURATION_BUCKETS.map((bucket, index) => ({ label: bucket.label, value: counts[index] }));
}

function topCounts(values: string[], limit: number) {
  const map = new Map<string, number>();
  values.filter(Boolean).forEach((value) => map.set(value, (map.get(value) ?? 0) + 1));
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

/** Finished books per category; undated (pre-2021) reads count toward "all". */
function finishedForTaste(readings: StatReading[], year: string) {
  return readings.filter((reading) => reading.status === "finished" && (year ? !reading.datesUnknown && reading.finishedAt?.startsWith(year) : true));
}

export function topCategories(readings: StatReading[], year: string, limit = 8) {
  return topCounts(finishedForTaste(readings, year).map((reading) => bookCategory(reading)), limit);
}

export function topAuthors(readings: StatReading[], year: string, limit = 8) {
  const list = topCounts(finishedForTaste(readings, year).map((reading) => primaryAuthor(reading.author)), limit);
  return list.filter((item) => item.value > 1);
}

/** Books in progress per day (start..finish/stop, or today while reading). */
export function activeDays(readings: StatReading[], from: string, to: string, today: string) {
  const counts = new Map<string, number>();
  for (const reading of readings) {
    if (!reading.startedAt || reading.datesUnknown) continue;
    const end = reading.status === "finished" ? reading.finishedAt : reading.status === "stopped" ? reading.stoppedAt : today;
    if (!end) continue;
    const start = reading.startedAt > from ? reading.startedAt : from;
    const stop = end < to ? end : to;
    for (let day = Date.parse(start); day <= Date.parse(stop); day += DAY) {
      const key = new Date(day).toISOString().slice(0, 10);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

export function rereads(readings: StatReading[]) {
  const map = new Map<string, { bookId: number | null; title: string; rounds: number }>();
  for (const reading of readings) {
    if (reading.status !== "finished") continue;
    const key = reading.bookId ? `b${reading.bookId}` : reading.title;
    const entry = map.get(key) ?? { bookId: reading.bookId, title: reading.title, rounds: 0 };
    entry.rounds += 1;
    map.set(key, entry);
  }
  return [...map.values()].filter((entry) => entry.rounds > 1).sort((a, b) => b.rounds - a.rounds);
}

export function statYears(readings: StatReading[]) {
  return [...new Set(finishedIn(readings, "").map((reading) => reading.finishedAt!.slice(0, 4)))].sort().reverse();
}
