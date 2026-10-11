"use client";
/* eslint-disable @next/next/no-img-element -- cover URLs are supplied dynamically by Aladin */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { thumb } from "../../lib/books";
import { type ReadingView, daysBetween, progress, readingDate, readingPeriod, statusLabels } from "../../lib/readings";
import { Icon } from "../components/Icon";
import { LinkEditionDialog } from "../components/LinkEditionDialog";
import { leaveList, rememberListUrl } from "../components/listNav";
import { ReadingEditor } from "../components/ReadingEditor";
import { toast } from "../components/Toaster";

type Tab = "all" | "reading" | "finished" | "stopped";
type View = "list" | "calendar";
const TABS: Array<{ key: Tab; label: string }> = [
  { key: "all", label: "전체" },
  { key: "reading", label: "읽는 중" },
  { key: "finished", label: "완독" },
  { key: "stopped", label: "중단" },
];
const UNKNOWN = "unknown";

type Initial = { tab: string; year: string; q: string; view: string; month: string };

export function ReadingLog({ readings, initial, today }: { readings: ReadingView[]; initial: Initial; today: string }) {
  const [tab, setTab] = useState<Tab>(TABS.some((item) => item.key === initial.tab) ? (initial.tab as Tab) : "all");
  const [year, setYear] = useState(initial.year);
  const [q, setQ] = useState(initial.q);
  const [view, setView] = useState<View>(initial.view === "calendar" ? "calendar" : "list");
  const [month, setMonth] = useState(/^\d{4}-\d{2}$/.test(initial.month) ? initial.month : "");
  const [editing, setEditing] = useState<ReadingView | null>(null);
  const [linking, setLinking] = useState<ReadingView | null>(null);

  // Keep the position in the URL so a book page can send the reader back.
  useEffect(() => {
    const params = new URLSearchParams();
    if (tab !== "all") params.set("tab", tab);
    if (year) params.set("year", year);
    if (q) params.set("q", q);
    if (view !== "list") params.set("view", view);
    if (view === "calendar" && month) params.set("month", month);
    const next = `${window.location.pathname}${params.size ? `?${params}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, "", next);
    rememberListUrl(next);
  }, [tab, year, q, view, month]);

  const counts = useMemo(() => {
    const result: Record<Tab, number> = { all: readings.length, reading: 0, finished: 0, stopped: 0 };
    readings.forEach((reading) => (result[reading.status] += 1));
    return result;
  }, [readings]);

  const years = useMemo(() => {
    const set = new Set<string>();
    let unknown = false;
    readings.forEach((reading) => {
      if (reading.datesUnknown) unknown = true;
      const date = readingDate(reading);
      if (date) set.add(date.slice(0, 4));
    });
    return { list: [...set].sort().reverse(), unknown };
  }, [readings]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return readings.filter((reading) => {
      if (tab !== "all" && reading.status !== tab) return false;
      if (year === UNKNOWN && !reading.datesUnknown) return false;
      if (year && year !== UNKNOWN && readingDate(reading)?.slice(0, 4) !== year) return false;
      if (needle && !`${reading.title} ${reading.author} ${reading.review} ${reading.memo}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [readings, tab, year, q]);

  const current = filtered.filter((reading) => reading.status === "reading");
  const groups = useMemo(() => {
    const timeline = tab === "reading" ? [] : filtered.filter((reading) => reading.status !== "reading" || tab !== "all");
    const map = new Map<string, ReadingView[]>();
    for (const reading of timeline) {
      const key = reading.datesUnknown ? UNKNOWN : (readingDate(reading)?.slice(0, 4) ?? "");
      map.set(key, [...(map.get(key) ?? []), reading]);
    }
    return [...map.entries()].sort(([a], [b]) => (a === UNKNOWN ? 1 : b === UNKNOWN ? -1 : b.localeCompare(a)));
  }, [filtered, tab]);

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[22px] font-bold tracking-tight">독서 기록</h1>
      </div>

      <div className="mb-4 flex flex-col gap-2.5">
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
          <div className="seg" role="group" aria-label="독서 상태">
            {TABS.map((item) => (
              <button key={item.key} aria-pressed={tab === item.key} onClick={() => setTab(item.key)}>
                {item.label}
                <span className="count">{counts[item.key]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-40 flex-1 sm:max-w-64">
            <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
            <input className="field w-full pl-8" value={q} onChange={(event) => setQ(event.target.value)} placeholder="제목, 저자, 한줄평, 메모" aria-label="독서 기록 검색" />
          </div>
          {view === "list" && (
            <select className="field" value={year} onChange={(event) => setYear(event.target.value)} aria-label="연도">
              <option value="">전체 연도</option>
              {years.list.map((value) => (
                <option key={value} value={value}>{value}년</option>
              ))}
              {years.unknown && <option value={UNKNOWN}>날짜 미상</option>}
            </select>
          )}
          <div className="seg ml-auto" role="group" aria-label="보기 방식">
            <button aria-pressed={view === "list"} onClick={() => setView("list")} aria-label="목록 보기" title="목록 보기">
              <Icon name="list" className="size-4" />
            </button>
            <button aria-pressed={view === "calendar"} onClick={() => setView("calendar")} aria-label="독서 달력" title="독서 달력">
              <Icon name="calendar" className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {view === "calendar" ? (
        <ReadingCalendar readings={filtered} month={month} onMonth={setMonth} />
      ) : (
        <>
          {current.length > 0 && (tab === "all" || tab === "reading") && (
            <section className="mb-6">
              <h2 className="mb-2.5 text-[13px] font-semibold text-muted">읽는 중</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {current.map((reading) => (
                  <ReadingNowCard key={reading.id} reading={reading} today={today} onEdit={() => setEditing(reading)} onLink={() => setLinking(reading)} />
                ))}
              </div>
            </section>
          )}

          {groups.map(([key, items]) => (
            <section key={key} className="mb-6">
              <h2 className="mb-2 flex items-baseline gap-2 text-[13px] font-semibold text-muted">
                {key === UNKNOWN ? "2021년 이전 · 날짜 미상" : key ? `${key}년` : "날짜 없음"}
                <span className="tabular font-normal text-faint">{items.length}권</span>
              </h2>
              <ul className="card divide-y divide-line overflow-hidden">
                {items.map((reading) => (
                  <ReadingRow key={reading.id} reading={reading} onEdit={() => setEditing(reading)} onLink={() => setLinking(reading)} />
                ))}
              </ul>
            </section>
          ))}

          {filtered.length === 0 && (
            <div className="card grid min-h-48 place-items-center p-8 text-center text-[13.5px] text-muted">
              {readings.length ? "조건에 맞는 기록이 없습니다." : "아직 독서 기록이 없습니다. 위 검색창에서 책을 찾아 읽기 시작해 보세요."}
            </div>
          )}
        </>
      )}

      {editing && <ReadingEditor reading={editing} onClose={() => setEditing(null)} />}
      {linking && <LinkEditionDialog readingId={linking.id} title={linking.title} author={linking.author} onClose={() => setLinking(null)} />}
    </div>
  );
}

function Cover({ reading, className }: { reading: ReadingView; className: string }) {
  const image = reading.cover ? <img src={thumb(reading.cover)} alt="" loading="lazy" /> : <span className="grid h-full place-items-center px-1 text-center text-[9px] leading-tight text-faint">{reading.title.slice(0, 12)}</span>;
  return reading.bookId ? (
    <Link href={`/books/${reading.bookId}`} onClick={leaveList} className={`cover block ${className}`} tabIndex={-1} aria-hidden="true">
      {image}
    </Link>
  ) : (
    <div className={`cover ${className}`}>{image}</div>
  );
}

function Title({ reading, onLink, className }: { reading: ReadingView; onLink: () => void; className: string }) {
  if (reading.bookId) {
    return (
      <Link href={`/books/${reading.bookId}`} onClick={leaveList} className={`${className} hover:underline hover:underline-offset-4`}>
        {reading.title}
      </Link>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className={className}>{reading.title}</span>
      <button className="chip shrink-0 text-warn hover:bg-warn-soft" onClick={onLink}>판본 연결</button>
    </span>
  );
}

function ReadingRow({ reading, onEdit, onLink }: { reading: ReadingView; onEdit: () => void; onLink: () => void }) {
  return (
    <li className="group flex gap-3.5 px-4 py-3 transition-colors hover:bg-sunken/40">
      <Cover reading={reading} className="h-[58px] w-10" />
      <div className="min-w-0 flex-1">
        <Title reading={reading} onLink={onLink} className="block truncate text-[14px] font-semibold" />
        <p className="truncate text-[12.5px] text-muted">{reading.author}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-muted">
          <span className="tabular">{readingPeriod(reading)}</span>
          {reading.status === "stopped" && <span className="chip text-warn">중단</span>}
          {reading.round > 1 && <span className="chip">{reading.round}회독</span>}
          {reading.noteCount > 0 && <span className="chip">문장 {reading.noteCount}</span>}
        </div>
        {reading.review && <p className="mt-1 line-clamp-2 text-[12.5px] text-ink-2">“{reading.review}”</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end justify-between gap-1">
        <button className="icon-btn md:opacity-0 md:transition-opacity md:group-focus-within:opacity-100 md:group-hover:opacity-100" onClick={onEdit} aria-label={`${reading.title} 기록 편집`} title="기록 편집">
          <Icon name="pencil" />
        </button>
      </div>
    </li>
  );
}

function ReadingNowCard({ reading, today, onEdit, onLink }: { reading: ReadingView; today: string; onEdit: () => void; onLink: () => void }) {
  const router = useRouter();
  const percent = progress(reading);
  const days = daysBetween(reading.startedAt, today);
  const [busy, setBusy] = useState(false);

  async function finish() {
    setBusy(true);
    const response = await fetch(`/api/readings/${reading.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "finished" }),
    });
    setBusy(false);
    if (!response.ok) {
      toast("저장하지 못했습니다.", "error");
      return;
    }
    toast(`‘${reading.title}’ 완독! 한줄평을 남겨 보세요.`);
    router.refresh();
    onEdit();
  }

  return (
    <div className="card flex gap-4 p-4">
      <Cover reading={reading} className="h-[84px] w-14" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Title reading={reading} onLink={onLink} className="block truncate text-[14.5px] font-semibold" />
        <p className="truncate text-[12.5px] text-muted">{reading.author}</p>
        <p className="mt-1 text-[12px] text-muted">
          {readingPeriod(reading)}
          {days ? ` · ${days}일째` : ""}
        </p>
        {percent != null && (
          <div className="mt-2 flex items-center gap-2" title={`${reading.currentPage} / ${reading.pages}쪽`}>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
              <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
            </div>
            <span className="tabular text-[11.5px] text-muted">{percent}%</span>
          </div>
        )}
        <div className="mt-auto flex gap-1.5 pt-2.5">
          <button className="btn h-7 px-2.5 text-[12px]" onClick={onEdit}>
            <Icon name="pencil" />
            기록
          </button>
          <button className="btn btn-accent h-7 px-2.5 text-[12px]" onClick={() => void finish()} disabled={busy}>
            <Icon name="check" />
            완독
          </button>
        </div>
      </div>
    </div>
  );
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// 독서 달력: covers on the day each book was finished.
function ReadingCalendar({ readings, month, onMonth }: { readings: ReadingView[]; month: string; onMonth: (month: string) => void }) {
  const finished = readings.filter((reading) => reading.status === "finished" && reading.finishedAt && !reading.datesUnknown);
  const latest = finished.reduce((max, reading) => (reading.finishedAt! > max ? reading.finishedAt! : max), "");
  const shown = month || (latest ? latest.slice(0, 7) : new Date().toISOString().slice(0, 7));
  const [y, m] = shown.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const byDay = new Map<number, ReadingView[]>();
  for (const reading of finished) {
    if (reading.finishedAt!.slice(0, 7) !== shown) continue;
    const day = Number(reading.finishedAt!.slice(8, 10));
    byDay.set(day, [...(byDay.get(day) ?? []), reading]);
  }
  const monthTotal = [...byDay.values()].reduce((sum, list) => sum + list.length, 0);
  const shift = (delta: number) => {
    const date = new Date(Date.UTC(y, m - 1 + delta, 1));
    onMonth(date.toISOString().slice(0, 7));
  };
  const cells = [...Array(first.getUTCDay()).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <button className="icon-btn" onClick={() => shift(-1)} aria-label="이전 달"><Icon name="chevronLeft" /></button>
        <div className="text-center">
          <p className="text-[15px] font-semibold tabular">{y}년 {m}월</p>
          <p className="text-[12px] text-muted">{monthTotal}권 완독</p>
        </div>
        <button className="icon-btn" onClick={() => shift(1)} aria-label="다음 달"><Icon name="chevronRight" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11.5px] text-faint">
        {WEEKDAYS.map((day) => <div key={day} className="pb-1">{day}</div>)}
        {cells.map((day, index) => (
          <div key={index} className={`min-h-[76px] rounded-lg p-1 text-left sm:min-h-[96px] ${day ? "bg-sunken/50" : ""}`}>
            {day && <span className="tabular text-[11px] text-faint">{day}</span>}
            <div className="mt-0.5 flex flex-wrap gap-0.5">
              {(day ? byDay.get(day) ?? [] : []).slice(0, 2).map((reading) =>
                reading.bookId ? (
                  <Link key={reading.id} href={`/books/${reading.bookId}`} onClick={leaveList} className="cover block aspect-[2/3] w-[calc(50%-1px)] min-w-6" title={reading.title}>
                    {reading.cover ? <img src={thumb(reading.cover)} alt={reading.title} /> : null}
                  </Link>
                ) : (
                  <span key={reading.id} className="cover block aspect-[2/3] w-[calc(50%-1px)] min-w-6" title={reading.title} />
                ),
              )}
              {(byDay.get(day ?? 0)?.length ?? 0) > 2 && <span className="text-[10px] text-muted">+{byDay.get(day!)!.length - 2}</span>}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-muted">{statusLabels.finished}일 기준 · 표지를 누르면 책 페이지로 이동합니다.</p>
    </div>
  );
}
