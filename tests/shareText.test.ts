import assert from "node:assert/strict";
import test from "node:test";
import { shareCredits, sharePeriod, sharePublication, shareTitle } from "../lib/shareText";

test("credits turn Aladin roles into short Korean forms", () => {
  assert.equal(shareCredits("대니얼 카너먼 (지은이), 이창신 (옮긴이)"), "대니얼 카너먼 지음 · 이창신 옮김");
  assert.equal(shareCredits("로켓슬라(이요한) (지은이)"), "로켓슬라(이요한) 지음");
  assert.equal(shareCredits("마이클 루이스 지음, 박홍경 옮김"), "마이클 루이스 지음 · 박홍경 옮김");
});

test("title splits off the subtitle", () => {
  assert.deepEqual(shareTitle("궤도에 투자하라 - 반도체·AI에 이어 돈은 이미 우주로 몰린다"), { main: "궤도에 투자하라", sub: "반도체·AI에 이어 돈은 이미 우주로 몰린다" });
  assert.deepEqual(shareTitle("생각에 관한 생각"), { main: "생각에 관한 생각", sub: "" });
});

test("publication joins publisher and the publish date", () => {
  assert.equal(sharePublication("서삼독", "2020-04-27"), "서삼독 · 2020.04.27 출간");
  assert.equal(sharePublication("김영사", "2018-07"), "김영사 · 2018.07 출간");
  assert.equal(sharePublication("", null), "");
});

test("period shows the full range, year only, or nothing", () => {
  assert.deepEqual(sharePeriod({ startedAt: "2026-10-24", finishedAt: "2026-11-14", datesUnknown: false }), { range: "2026.10.24 – 2026.11.14", days: "22일" });
  assert.deepEqual(sharePeriod({ startedAt: null, finishedAt: "2026-11-14", datesUnknown: false }), { range: "2026.11.14", days: "" });
  assert.deepEqual(sharePeriod({ startedAt: null, finishedAt: "2024", datesUnknown: false }), { range: "2024년", days: "" });
  assert.deepEqual(sharePeriod({ startedAt: null, finishedAt: null, datesUnknown: true }), { range: "", days: "" });
});
