import assert from "node:assert/strict";
import test from "node:test";
import { isDailyCheckStale } from "../lib/dailyCheck";

const now = new Date("2026-11-07T00:30:00Z");

test("a run within 26 hours is on time, even while today's run is in progress", () => {
  assert.equal(isDailyCheckStale("2026-11-05 23:05:00", now), false);
});

test("a run older than 26 hours is stale", () => {
  assert.equal(isDailyCheckStale("2026-11-05 22:00:00", now), true);
});

test("no check history is not stale", () => {
  assert.equal(isDailyCheckStale(null, now), false);
});
