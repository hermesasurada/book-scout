"use client";
/* eslint-disable @next/next/no-img-element -- cover URLs are supplied dynamically by Aladin */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { thumb } from "../../lib/books";
import { dotDate } from "../../lib/readings";
import { Icon } from "../components/Icon";
import { leaveList, rememberListUrl } from "../components/listNav";

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
  readState: "finished" | "reading" | "stopped" | "unread";
};

type State = "all" | "unread" | "reading" | "finished";
const STATES: Array<{ key: State; label: string }> = [
  { key: "all", label: "전체" },
  { key: "unread", label: "안 읽음" },
  { key: "reading", label: "읽는 중" },
  { key: "finished", label: "읽음" },
];
const CHANNELS: Record<ShelfBook["channel"], string> = { aladin_online: "알라딘 온라인", aladin_store: "알라딘 매장", other: "기타" };
const READ_LABEL: Record<ShelfBook["readState"], string> = { finished: "읽음", reading: "읽는 중", stopped: "중단", unread: "안 읽음" };

type Initial = { state: string; channel: string; year: string; q: string };

export function Shelf({ books, initial }: { books: ShelfBook[]; initial: Initial }) {
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
    const result: Record<State, number> = { all: books.length, unread: 0, reading: 0, finished: 0 };
    books.forEach((book) => {
      if (book.readState === "unread" || book.readState === "stopped") result.unread += 1;
      if (book.readState === "reading") result.reading += 1;
      if (book.readState === "finished") result.finished += 1;
    });
    return result;
  }, [books]);
  const years = useMemo(() => [...new Set(books.map((book) => book.purchasedAt.slice(0, 4)))].sort().reverse(), [books]);

  const filtered = books.filter((book) => {
    if (state === "unread" && !(book.readState === "unread" || book.readState === "stopped")) return false;
    if (state === "reading" && book.readState !== "reading") return false;
    if (state === "finished" && book.readState !== "finished") return false;
    if (channel && book.channel !== channel) return false;
    if (year && !book.purchasedAt.startsWith(year)) return false;
    if (q.trim() && !`${book.title} ${book.author} ${book.publisher}`.toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[22px] font-bold tracking-tight">내 서재</h1>
      </div>

      {books.length === 0 ? (
        <div className="card grid min-h-56 place-items-center p-8 text-center">
          <div>
            <Icon name="shelf" className="mx-auto size-6 text-faint" />
            <p className="mt-3 text-[14px] font-semibold">아직 구매 이력이 없습니다.</p>
            <p className="mt-1 text-[12.5px] text-muted">Gmail을 연결하면 알라딘 온라인·매장 구매내역이 자동으로 채워집니다.</p>
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
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="card grid min-h-48 place-items-center p-8 text-center text-[13.5px] text-muted">조건에 맞는 책이 없습니다.</div>
          ) : (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {filtered.map((book) => (
                <li key={book.id} className="min-w-0">
                  <Link href={`/books/${book.id}`} onClick={leaveList} className="group block">
                    <div className="cover relative aspect-[2/3] w-full rounded-md">
                      {book.cover ? <img src={thumb(book.cover)} alt="" loading="lazy" /> : null}
                      <span
                        className={`absolute left-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ${
                          book.readState === "finished" ? "bg-accent text-accent-ink" : book.readState === "reading" ? "bg-warn text-white" : "bg-black/55 text-white"
                        }`}
                      >
                        {READ_LABEL[book.readState]}
                      </span>
                    </div>
                    <p className="mt-2.5 line-clamp-2 text-[13.5px] font-semibold leading-snug group-hover:underline group-hover:underline-offset-4">{book.title}</p>
                  </Link>
                  <p className="mt-0.5 truncate text-[12px] text-muted">{book.author}</p>
                  <p className="tabular mt-0.5 truncate text-[11.5px] text-faint">
                    {dotDate(book.purchasedAt)} · {book.channel === "aladin_store" && book.store ? book.store : CHANNELS[book.channel]}
                    {book.condition === "used" ? " · 중고" : book.condition === "ebook" ? " · eBook" : ""}
                    {book.purchaseCount > 1 ? ` · ${book.purchaseCount}회 구매` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
