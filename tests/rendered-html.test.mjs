import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the Book Scout dashboard and removes the starter", async () => {
  const [layout, page, dashboard, packageJson] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/BookScout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /lang="ko"/);
  assert.match(layout, /책갈피 \| 관심도서 재고·대출 확인/);
  assert.match(page, /<BookScout \/>/);
  assert.match(dashboard, /기다리던 책을/);
  assert.match(dashboard, /알라딘에서 찾기/);
  assert.match(dashboard, /보정도서관/);
  assert.doesNotMatch(`${layout}\n${page}\n${dashboard}\n${packageJson}`, /codex-preview|react-loading-skeleton|SkeletonPreview/);
});
