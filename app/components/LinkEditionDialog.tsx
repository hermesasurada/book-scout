"use client";
/* eslint-disable @next/next/no-img-element -- cover URLs are supplied dynamically by Aladin */

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { SearchBook } from "../../lib/books";
import { Icon } from "./Icon";
import { toast } from "./Toaster";

// Pick the Aladin edition for a reading record imported without a match.
export function LinkEditionDialog({ readingId, title, author, onClose }: { readingId: number; title: string; author: string; onClose: () => void }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState(title.split(/\s[-–—]\s|\s?\(/)[0]);
  const [results, setResults] = useState<SearchBook[] | null>(null);
  const [busy, setBusy] = useState(false);

  const search = useCallback(async (q: string) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/aladin/search?q=${encodeURIComponent(q)}`);
      const data = (await response.json()) as { books?: SearchBook[] };
      setResults(data.books ?? []);
    } catch {
      setResults([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    dialog.current?.showModal();
    // Start with the record's own title so most links are one click.
    const initial = title.split(/\s[-–—]\s|\s?\(/)[0].trim();
    if (initial.length < 2) return;
    const timer = window.setTimeout(() => void search(initial), 0);
    return () => window.clearTimeout(timer);
  }, [search, title]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length >= 2) await search(query.trim());
  }

  async function link(book: SearchBook) {
    setBusy(true);
    try {
      const resolved = await fetch("/api/books/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId: book.itemId }),
      }).then((response) => response.json() as Promise<{ bookId?: number; error?: string }>);
      if (!resolved.bookId) throw new Error(resolved.error);
      const response = await fetch(`/api/readings/${readingId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookId: resolved.bookId }),
      });
      if (!response.ok) throw new Error();
      toast("판본을 연결했습니다.");
      router.refresh();
      dialog.current?.close();
    } catch (error) {
      toast(error instanceof Error && error.message ? error.message : "연결하지 못했습니다.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(event) => event.target === dialog.current && dialog.current?.close()}
      className="m-auto w-[min(560px,calc(100vw-24px))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/40"
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] text-muted">판본 연결</p>
            <h2 className="truncate text-[16px] font-bold">{title}</h2>
            {author && <p className="truncate text-[12.5px] text-muted">{author}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={() => dialog.current?.close()} aria-label="닫기">
            <Icon name="x" />
          </button>
        </div>
        <form onSubmit={submit} className="mt-4 flex gap-2">
          <input className="field h-9 flex-1" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="알라딘 검색어" />
          <button className="btn btn-primary h-9" disabled={busy || query.trim().length < 2}>검색</button>
        </form>
        <ul className="mt-3 max-h-[50vh] overflow-y-auto">
          {results?.length === 0 && <li className="py-6 text-center text-[13px] text-muted">검색 결과가 없습니다.</li>}
          {results?.map((book) => (
            <li key={book.itemId || book.isbn13}>
              <button
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-sunken disabled:opacity-50"
                onClick={() => void link(book)}
                disabled={busy}
              >
                <span className="cover h-[52px] w-9">{book.cover ? <img src={book.cover} alt="" /> : null}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold">{book.title}</span>
                  <span className="block truncate text-[12px] text-muted">
                    {[book.author, book.publisher, book.pubDate?.slice(0, 4)].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="text-[12px] text-accent">선택</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </dialog>
  );
}
