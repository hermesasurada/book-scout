import assert from "node:assert/strict";
import test from "node:test";
import { activeDays, byMonth, byYear, primaryAuthor, rereads, summary, topAuthors, type StatReading } from "../lib/stats";

const r = (patch: Partial<StatReading>): StatReading => ({
  bookId: 1,
  title: "책",
  author: "홍길동 (지은이)",
  category: "국내도서>과학>물리학",
  pages: 300,
  status: "finished",
  startedAt: "2026-01-01",
  finishedAt: "2026-01-10",
  stoppedAt: null,
  datesUnknown: false,
  round: 1,
  ...patch,
});

const rows: StatReading[] = [
  r({ bookId: 1 }),
  r({ bookId: 2, startedAt: "2026-02-01", finishedAt: "2026-02-01", pages: 100 }),
  r({ bookId: 3, startedAt: "2025-01-03", finishedAt: "2025-01-05", author: "김철수, 이영희" }),
  r({ bookId: 4, startedAt: null, finishedAt: null, datesUnknown: true }),
  r({ bookId: 5, status: "stopped", finishedAt: null, stoppedAt: "2026-03-01" }),
  r({ bookId: 1, startedAt: null, finishedAt: "2026-05-05", round: 2 }),
];

test("summary counts dated finishes, pages, median duration and stop rate", () => {
  const year = summary(rows, "2026", "2026-10-11");
  assert.equal(year.finished, 3);
  assert.equal(year.pages, 700);
  assert.equal(year.medianDays, 5.5); // 10 days and 1 day
  assert.equal(year.stopped, 1);
  assert.equal(year.stopRate, 0.25);
  assert.equal(year.previousSamePeriod, 1);
  const all = summary(rows, "", "2026-10-11");
  assert.equal(all.finished, 4);
  assert.equal(all.undated, 1);
});

test("monthly and yearly finishes", () => {
  const months = byMonth(rows, "2026");
  assert.equal(months[0].value, 1);
  assert.equal(months[1].value, 1);
  assert.equal(months[4].value, 1);
  assert.deepEqual(byYear(rows), [{ label: "2025", value: 1 }, { label: "2026", value: 3 }]);
});

test("active days", () => {
  const days = activeDays(rows, "2026-01-01", "2026-12-31", "2026-10-11");
  assert.equal(days.get("2026-01-05"), 2); // the finished book and the one later stopped
  assert.equal(days.get("2026-02-01"), 2);
  assert.equal(days.has("2025-01-04"), false);
});

test("authors and re-reads", () => {
  assert.equal(primaryAuthor("피터 린치, 존 로스차일드 (지은이), 고영태 (옮긴이)"), "피터 린치");
  assert.equal(primaryAuthor("김초엽 지음"), "김초엽");
  assert.deepEqual(topAuthors(rows, ""), [{ label: "홍길동", value: 4 }]);
  assert.deepEqual(rereads(rows), [{ bookId: 1, title: "책", rounds: 2 }]);
});

test("year-only finishes count toward the year, not months or durations", () => {
  const withYear = [...rows, r({ bookId: 6, startedAt: null, finishedAt: "2026", pages: 200 }), r({ bookId: 7, startedAt: null, finishedAt: "2025" })];
  const year = summary(withYear, "2026", "2026-10-11");
  assert.equal(year.finished, 4);
  assert.equal(year.pages, 900);
  assert.equal(year.medianDays, 5.5);
  assert.equal(year.previousSamePeriod, 1);
  assert.equal(byMonth(withYear, "2026").reduce((sum, month) => sum + month.value, 0), 3);
  assert.deepEqual(byYear(withYear), [{ label: "2025", value: 2 }, { label: "2026", value: 4 }]);
});
