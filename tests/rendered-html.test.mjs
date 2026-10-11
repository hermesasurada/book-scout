import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("app shell, watchlist and book page are wired", async () => {
  const [layout, home, watch, watchlist, shell, search, bookPage] = await Promise.all([
    read("app/layout.tsx"),
    read("app/page.tsx"),
    read("app/watch/page.tsx"),
    read("app/watch/Watchlist.tsx"),
    read("app/components/AppShell.tsx"),
    read("app/components/AddBookSearch.tsx"),
    read("app/books/[id]/page.tsx"),
  ]);

  assert.match(layout, /lang="ko"/);
  assert.match(layout, /<AppShell>/);
  assert.match(home, /redirect\("\/watch"\)/);
  assert.match(watch, /<Watchlist \/>/);
  assert.match(shell, /<AddBookSearch \/>/);
  assert.match(search, /알라딘 검색/);
  assert.match(bookPage, /보정도서관/);
  // No intro copy or stats summary above the list (user decision).
  assert.doesNotMatch(watchlist, /MY READING WATCHLIST|기다리던 책을|className="summary"/);
});
