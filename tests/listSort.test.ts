import assert from "node:assert/strict";
import test from "node:test";
import { byNumber, byText, reviewTotal } from "../lib/listSort";

type Row = { id: number; n: number | null; s: string | null };
const rows: Row[] = [
  { id: 1, n: 3, s: "2021-05-01" },
  { id: 2, n: null, s: null },
  { id: 3, n: 1, s: "2019-01-01" },
  { id: 4, n: 2, s: "2024-03-19" },
];
const ids = (list: Row[]) => list.map((row) => row.id);

test("missing values stay last in both directions", () => {
  assert.deepEqual(ids([...rows].sort(byNumber((row) => row.n, "asc"))), [3, 4, 1, 2]);
  assert.deepEqual(ids([...rows].sort(byNumber((row) => row.n, "desc"))), [1, 4, 3, 2]);
  assert.deepEqual(ids([...rows].sort(byText((row) => row.s, "asc"))), [3, 1, 4, 2]);
  assert.deepEqual(ids([...rows].sort(byText((row) => row.s, "desc"))), [4, 1, 3, 2]);
});

test("review total adds 100자평 and reviews, null when both missing", () => {
  assert.equal(reviewTotal({ commentCount: 3, reviewCount: null }), 3);
  assert.equal(reviewTotal({ commentCount: 3, reviewCount: 2 }), 5);
  assert.equal(reviewTotal({}), null);
});
