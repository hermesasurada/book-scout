"use client";
/* eslint-disable @next/next/no-img-element -- cover URLs are supplied dynamically by Aladin */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { thumb } from "../../lib/books";
import { dotDate } from "../../lib/readings";
import { Icon } from "../components/Icon";
import { leaveList, rememberListUrl } from "../components/listNav";
import { toast } from "../components/Toaster";

export type ShelfBook = {
  id: number;
  title: string;
  author: string;
  publisher: string;
  cover: string;
  purchasedAt: string;
  purchaseCount: number;
  channel: "aladin_online" | "aladin_store" | "other";
  condition: "new" | "used" | "ebook";
  store: string;
  readState: "reading" | "stopped" | "unread";
};

type State = "all" | "unread" | "reading";
const STATES: Array<{ key: State; label: string }> = [
  { key: "all", label: "전체" },
  { key: "unread", label: "안 읽음" },
  { key: "reading", label: "읽는 중" },
];
const CHANNELS: Record<ShelfBook["channel"], string> = { aladin_online: "알라딘 온라인", aladin_store: "알라딘 매장", other: "기타" };
const READ_LABEL: Record<ShelfBook["readState"], string> = { reading: "읽는 중", stopped: "중단", unread: "안 읽음" };

type Initial = { state: string; channel: string; year: string; q: string };
type View = "grid" | "list";
const VIEW_KEY = "bookscout:shelf-view";

function purchaseNote(book: ShelfBook) {
  return `${dotDate(book.purchasedAt)} · ${book.channel === "aladin_store" && book.store ? book.store : CHANNELS[book.channel]}${
    book.condition === "used" ? " · 중고" : book.condition === "ebook" ? " · eBook" : ""
  }${book.purchaseCount > 1 ? ` · ${book.purchaseCount}회 구매` : ""}`;
}

export function Shelf({ books: loaded, initial }: { books: ShelfBook[]; initial: Initial }) {
  const router = useRouter();
  // Removed books disappear at once; the server list follows on refresh.
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const books = useMemo(() => loaded.filter((book) => !removed.has(book.id)), [loaded, removed]);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>("grid");

  // The chosen view is remembered per browser; restore it before paint.
  useLayoutEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (window.localStorage.getItem(VIEW_KEY) === "list") setView("list");
    } catch {
      // storage blocked — keep the default
    }
  }, []);

  function changeView(next: View) {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // non-fatal
    }
  }
  const [state, setState] = useState<State>(STATES.some((item) => item.key === initial.state) ? (initial.state as State) : "all");
  const [channel, setChannel] = useState(initial.channel in CHANNELS ? initial.channel : "");
  const [year, setYear] = useState(initial.year);
  const [q, setQ] = useState(initial.q);

  useEffect(() => {
    const params = new URLSearchParams();
    if (state !== "all") params.set("state", state);
    if (channel) params.set("channel", channel);
    if (year) params.set("year", year);
    if (q) params.set("q", q);
    const next = `${window.location.pathname}${params.size ? `?${params}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, "", next);
    rememberListUrl(next);
  }, [state, channel, year, q]);

  const counts = useMemo(() => {
    const result: Record<State, number> = { all: books.length, unread: 0, reading: 0 };
    books.forEach((book) => {
      if (book.readState === "reading") result.reading += 1;
      else result.unread += 1;
    });
    return result;
  }, [books]);
  const years = useMemo(() => [...new Set(books.map((book) => book.purchasedAt.slice(0, 4)))].sort().reverse(), [books]);

  const filtered = books.filter((book) => {
    if (state === "unread" && !(book.readState === "unread" || book.readState === "stopped")) return false;
    if (state === "reading" && book.readState !== "reading") return false;
    if (channel && book.channel !== channel) return false;
    if (year && !book.purchasedAt.startsWith(year)) return false;
    if (q.trim() && !`${book.title} ${book.author} ${book.publisher}`.toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  });

  async function remove(ids: number[]) {
    if (!ids.length) return;
    const first = books.find((book) => book.id === ids[0]);
    const label = ids.length === 1 && first ? `‘${first.title}’을` : `${ids.length}권을`;
    if (!window.confirm(`${label} 내 서재에서 뺄까요?\n구매 이력은 도서 페이지에 남고, 거기서 다시 넣을 수 있습니다.`)) return;
    setBusy(true);
    try {
      const response = await fetch("/api/shelf", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookIds: ids }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error);
      setRemoved((current) => new Set([...current, ...ids]));
      setSelected(new Set());
      setSelecting(false);
      toast(`${ids.length}권을 내 서재에서 뺐습니다.`);
      router.refresh();
    } catch (error) {
      toast(error instanceof Error && error.message ? error.message : "삭제하지 못했습니다.", "error");
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allShownSelected = filtered.length > 0 && filtered.every((book) => selected.has(book.id));

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[22px] font-bold tracking-tight">내 서재</h1>
        {books.length > 0 &&
          (selecting ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="tabular mr-1 text-[13px] text-muted">{selected.size}권 선택</span>
              <button
                className="btn"
                onClick={() =>
                  setSelected(allShownSelected ? new Set() : new Set(filtered.map((book) => book.id)))
                }
              >
                {allShownSelected ? "선택 해제" : "보이는 책 전체 선택"}
              </button>
              <button className="btn border-bad text-bad hover:!bg-bad-soft" disabled={busy || selected.size === 0} onClick={() => void remove([...selected])}>
                <Icon name="trash" />
                삭제
              </button>
              <button className="btn btn-ghost" onClick={() => { setSelecting(false); setSelected(new Set()); }}>취소</button>
            </div>
          ) : (
            <button className="btn" onClick={() => setSelecting(true)}>
              <Icon name="check" />
              선택
            </button>
          ))}
      </div>

      {books.length === 0 ? (
        <div className="card grid min-h-56 place-items-center p-8 text-center">
          <div>
            <Icon name="shelf" className="mx-auto size-6 text-faint" />
            <p className="mt-3 text-[14px] font-semibold">아직 읽지 않은 소장 도서가 없습니다.</p>
            <p className="mt-1 text-[12.5px] text-muted">다 읽은 책은 서재에서 빠집니다. Gmail을 연결하면 알라딘 구매내역이 자동으로 채워집니다.</p>
            <Link href="/settings" className="btn mt-4">가져오기 · 설정</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-2.5">
            <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
              <div className="seg" role="group" aria-label="읽은 상태">
                {STATES.map((item) => (
                  <button key={item.key} aria-pressed={state === item.key} onClick={() => setState(item.key)}>
                    {item.label}
                    <span className="count">{counts[item.key]}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-40 flex-1 sm:max-w-64">
                <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
                <input className="field w-full pl-8" value={q} onChange={(event) => setQ(event.target.value)} placeholder="서재에서 검색" aria-label="서재에서 검색" />
              </div>
              <select className="field" value={channel} onChange={(event) => setChannel(event.target.value)} aria-label="구매처">
                <option value="">전체 구매처</option>
                {Object.entries(CHANNELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <select className="field" value={year} onChange={(event) => setYear(event.target.value)} aria-label="구매 연도">
                <option value="">전체 연도</option>
                {years.map((value) => (
                  <option key={value} value={value}>{value}년</option>
                ))}
              </select>
              <div className="seg ml-auto" role="group" aria-label="보기 방식">
                <button aria-pressed={view === "list"} onClick={() => changeView("list")} aria-label="목록 보기" title="목록 보기">
                  <Icon name="list" className="size-4" />
                </button>
                <button aria-pressed={view === "grid"} onClick={() => changeView("grid")} aria-label="표지 보기" title="표지 보기">
                  <Icon name="grid" className="size-4" />
                </button>
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="card grid min-h-48 place-items-center p-8 text-center text-[13.5px] text-muted">조건에 맞는 책이 없습니다.</div>
          ) : view === "list" ? (
            <ul className="card divide-y divide-line overflow-hidden">
              {filtered.map((book) => {
                const isSelected = selected.has(book.id);
                const cover = (
                  <span className="cover block h-[58px] w-10">{book.cover ? <img src={thumb(book.cover)} alt="" loading="lazy" /> : null}</span>
                );
                const text = (
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[14px] font-semibold ${selecting ? "" : "group-hover:underline group-hover:underline-offset-4"}`}>{book.title}</span>
                    <span className="block truncate text-[12.5px] text-muted">{book.author}</span>
                    <span className="tabular block truncate text-[12px] text-faint">{purchaseNote(book)}</span>
                  </span>
                );
                const badge = (
                  <span className={`chip shrink-0 ${book.readState === "reading" ? "text-warn" : ""}`}>{READ_LABEL[book.readState]}</span>
                );
                return (
                  <li key={book.id} className={`group relative transition-colors ${isSelected ? "bg-accent-soft" : "hover:bg-sunken/40"}`}>
                    {selecting ? (
                      <button className="flex w-full items-center gap-3.5 px-4 py-3 text-left" onClick={() => toggle(book.id)} aria-pressed={isSelected} aria-label={`${book.title} 선택`}>
                        <span
                          className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${isSelected ? "border-accent bg-accent text-accent-ink" : "border-line-strong text-transparent"}`}
                          aria-hidden="true"
                        >
                          <Icon name="check" className="size-3" />
                        </span>
                        {cover}
                        {text}
                        {badge}
                      </button>
                    ) : (
                      <div className="flex items-center gap-3.5 px-4 py-3">
                        <Link href={`/books/${book.id}`} onClick={leaveList} className="flex min-w-0 flex-1 items-center gap-3.5">
                          {cover}
                          {text}
                        </Link>
                        {badge}
                        <button
                          className="icon-btn danger md:opacity-0 md:transition-opacity md:group-focus-within:opacity-100 md:group-hover:opacity-100"
                          onClick={() => void remove([book.id])}
                          disabled={busy}
                          aria-label={`${book.title} 내 서재에서 삭제`}
                          title="내 서재에서 삭제"
                        >
                          <Icon name="trash" />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {filtered.map((book) => {
                const isSelected = selected.has(book.id);
                const cover = (
                  <div className={`cover relative aspect-[2/3] w-full rounded-md ${isSelected ? "ring-2 ring-accent ring-offset-2 ring-offset-canvas" : ""}`}>
                    {book.cover ? <img src={thumb(book.cover)} alt="" loading="lazy" /> : null}
                    <span
                      className={`absolute left-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ${
                        book.readState === "reading" ? "bg-warn text-white" : "bg-black/55 text-white"
                      }`}
                    >
                      {READ_LABEL[book.readState]}
                    </span>
                    {selecting && (
                      <span
                        className={`absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full border-2 ${
                          isSelected ? "border-accent bg-accent text-accent-ink" : "border-white bg-black/30 text-transparent"
                        }`}
                        aria-hidden="true"
                      >
                        <Icon name="check" className="size-3.5" />
                      </span>
                    )}
                  </div>
                );
                return (
                  <li key={book.id} className="group relative min-w-0">
                    {selecting ? (
                      <button className="block w-full text-left" onClick={() => toggle(book.id)} aria-pressed={isSelected} aria-label={`${book.title} 선택`}>
                        {cover}
                        <p className="mt-2.5 line-clamp-2 text-[13.5px] font-semibold leading-snug">{book.title}</p>
                      </button>
                    ) : (
                      <>
                        <Link href={`/books/${book.id}`} onClick={leaveList} className="block">
                          {cover}
                          <p className="mt-2.5 line-clamp-2 text-[13.5px] font-semibold leading-snug group-hover:underline group-hover:underline-offset-4">{book.title}</p>
                        </Link>
                        <button
                          className="icon-btn danger absolute right-1.5 top-1.5 hidden size-7 bg-surface/90 shadow-sm md:grid md:opacity-0 md:transition-opacity md:group-focus-within:opacity-100 md:group-hover:opacity-100"
                          onClick={() => void remove([book.id])}
                          disabled={busy}
                          aria-label={`${book.title} 내 서재에서 삭제`}
                          title="내 서재에서 삭제"
                        >
                          <Icon name="trash" className="size-3.5" />
                        </button>
                      </>
                    )}
                    <p className="mt-0.5 truncate text-[12px] text-muted">{book.author}</p>
                    <p className="tabular mt-0.5 truncate text-[11.5px] text-faint">{purchaseNote(book)}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
