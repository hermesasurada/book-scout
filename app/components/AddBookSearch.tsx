"use client";
/* eslint-disable @next/next/no-img-element -- cover URLs are supplied dynamically by Aladin */

import { FormEvent, useEffect, useRef, useState } from "react";
import type { SearchBook } from "../../lib/books";
import { Icon } from "./Icon";
import { notifyBooksChanged, toast } from "./Toaster";

// Global "find a book on Aladin" field. It sits in the header on every page so
// adding a book is always the first thing under the menu.
export function AddBookSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchBook[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const open = results !== null || error !== "";

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !typing)) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (event.key === "Escape") dismiss();
    };
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) dismiss();
    };
    const dismiss = () => {
      setResults(null);
      setError("");
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, []);

  async function search(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    setSearching(true);
    setError("");
    try {
      const response = await fetch(`/api/aladin/search?q=${encodeURIComponent(q)}`);
      const data = (await response.json()) as { books?: SearchBook[]; error?: string };
      if (!response.ok) throw new Error(data.error);
      setResults(data.books ?? []);
      if (!data.books?.length) setError("알라딘에서 검색 결과를 찾지 못했습니다.");
    } catch (caught) {
      setResults(null);
      setError(caught instanceof Error && caught.message ? caught.message : "검색하지 못했습니다.");
    } finally {
      setSearching(false);
    }
  }

  async function addToWatchlist(book: SearchBook) {
    setAdding(book.itemId || book.isbn13);
    try {
      const response = await fetch("/api/books", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(book),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "저장하지 못했습니다.");
      toast(`‘${book.title}’을 관심도서에 담았습니다.`);
      setResults((current) => current?.filter((item) => item !== book) ?? null);
      notifyBooksChanged();
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "저장하지 못했습니다.", "error");
    } finally {
      setAdding(null);
    }
  }

  return (
    <div ref={rootRef} className="relative w-full max-w-xl">
      <form onSubmit={search} className="relative">
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
        <label className="sr-only-x" htmlFor="add-book-query">알라딘에서 책 찾기</label>
        <input
          ref={inputRef}
          id="add-book-query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="책 제목, 저자, ISBN으로 알라딘 검색"
          className="field h-9 w-full pl-9 pr-20"
          autoComplete="off"
        />
        <button
          className="btn btn-primary absolute right-1 top-1/2 h-7 -translate-y-1/2 px-2.5 text-[12px]"
          disabled={searching || query.trim().length < 2}
        >
          {searching ? "검색 중" : "검색"}
        </button>
      </form>

      {open && (
        <div className="card absolute inset-x-0 top-11 z-40 max-h-[70vh] overflow-y-auto p-1.5 shadow-xl">
          {error ? (
            <p className="px-3 py-6 text-center text-[13px] text-muted">{error}</p>
          ) : (
            <ul>
              {results?.map((book) => (
                <li key={book.itemId || book.isbn13} className="flex items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-sunken">
                  <div className="cover h-[52px] w-9">{book.cover ? <img src={book.cover} alt="" /> : null}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold">{book.title}</p>
                    <p className="truncate text-[12px] text-muted">
                      {[book.author, book.publisher, book.pubDate?.slice(0, 4)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <button
                    className="btn h-7 px-2.5 text-[12px]"
                    onClick={() => void addToWatchlist(book)}
                    disabled={adding !== null}
                  >
                    <Icon name="bookmark" />
                    {adding === (book.itemId || book.isbn13) ? "담는 중" : "관심도서"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
