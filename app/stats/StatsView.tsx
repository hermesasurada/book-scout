"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  activeDays,
  byMonth,
  byWeekday,
  byYear,
  durationBuckets,
  rereads,
  type StatReading,
  statYears,
  summary,
  topAuthors,
  topCategories,
} from "../../lib/stats";

type Datum = { label: string; value: number };

export function StatsView({ readings, today, initialYear }: { readings: StatReading[]; today: string; initialYear: string }) {
  const years = useMemo(() => statYears(readings), [readings]);
  const [year, setYear] = useState(years.includes(initialYear) ? initialYear : "");

  useEffect(() => {
    const next = `${window.location.pathname}${year ? `?year=${year}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, "", next);
  }, [year]);

  const stats = useMemo(() => summary(readings, year, today), [readings, year, today]);
  const trend = useMemo(() => (year ? byMonth(readings, year) : byYear(readings)), [readings, year]);
  const durations = useMemo(() => durationBuckets(readings, year), [readings, year]);
  const weekdays = useMemo(() => byWeekday(readings, year), [readings, year]);
  const categories = useMemo(() => topCategories(readings, year), [readings, year]);
  const authors = useMemo(() => topAuthors(readings, year), [readings, year]);
  const again = useMemo(() => rereads(readings), [readings]);
  // The heatmap covers the chosen year, or the last 12 months for "전체".
  const range = useMemo(() => {
    if (year) return { from: `${year}-01-01`, to: year === today.slice(0, 4) ? today : `${year}-12-31` };
    const from = new Date(Date.parse(today) - 364 * 86400000).toISOString().slice(0, 10);
    return { from, to: today };
  }, [year, today]);
  const active = useMemo(() => activeDays(readings, range.from, range.to, today), [readings, range, today]);

  if (!years.length) {
    return (
      <div>
        <h1 className="mb-5 text-[22px] font-bold tracking-tight">독서 통계</h1>
        <div className="card grid min-h-48 place-items-center p-8 text-center text-[13.5px] text-muted">완독 기록이 쌓이면 독서 패턴을 보여 드립니다.</div>
      </div>
    );
  }

  const delta = stats.previousSamePeriod != null ? stats.finished - stats.previousSamePeriod : null;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[22px] font-bold tracking-tight">{year ? `${year}년 독서` : "독서 통계"}</h1>
      </div>

      <div className="-mx-4 mb-5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <div className="seg" role="group" aria-label="기간">
          <button aria-pressed={year === ""} onClick={() => setYear("")}>전체</button>
          {years.map((value) => (
            <button key={value} aria-pressed={year === value} onClick={() => setYear(value)}>{value}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="완독"
          value={`${stats.finished.toLocaleString()}권`}
          note={
            delta != null
              ? `작년 같은 기간보다 ${delta === 0 ? "같음" : `${delta > 0 ? "+" : ""}${delta}권`}`
              : stats.undated
                ? `날짜 미상 ${stats.undated}권 별도`
                : undefined
          }
        />
        <Tile label="읽은 쪽수" value={`${stats.pages.toLocaleString()}쪽`} note={stats.pagesCovered < stats.finished ? `쪽수 확인된 ${stats.pagesCovered}권 기준` : undefined} />
        <Tile
          label="한 권 읽는 데"
          value={stats.medianDays != null ? `${Math.round(stats.medianDays)}일` : "—"}
          note={stats.pagesPerDay != null ? `중앙값 · 하루 약 ${Math.round(stats.pagesPerDay)}쪽` : "중앙값"}
        />
        <Tile label="중단" value={`${stats.stopped}권`} note={stats.stopRate != null ? `시작한 책의 ${Math.round(stats.stopRate * 100)}%` : undefined} />
      </div>

      <Card title={year ? "월별 완독" : "연도별 완독"} subtitle={year ? undefined : "2021년 이전 날짜 미상 기록 제외"}>
        <Columns data={trend} unit="권" />
      </Card>

      <Card title="독서 잔디" subtitle={year ? `${year}년 · 하루에 읽고 있던 책 수` : "최근 1년 · 하루에 읽고 있던 책 수"}>
        <Heatmap counts={active} from={range.from} to={range.to} />
      </Card>

      <div className="grid gap-x-4 lg:grid-cols-2">
        <Card title="완독까지 걸린 기간" subtitle="시작일부터 완독일까지">
          <Columns data={durations} unit="권" compact />
        </Card>
        <Card title="완독한 요일">
          <Columns data={weekdays} unit="권" compact />
        </Card>
        <Card title="많이 읽은 분야" subtitle="알라딘 분류 기준">
          <Bars data={categories} unit="권" empty="분류 정보가 있는 완독 기록이 없습니다." />
        </Card>
        <Card title="자주 읽은 저자" subtitle="2권 이상">
          <Bars data={authors} unit="권" empty="같은 저자의 책을 두 권 이상 읽은 기록이 없습니다." />
        </Card>
      </div>

      {again.length > 0 && !year && (
        <Card title="다시 읽은 책">
          <ul className="divide-y divide-line">
            {again.map((entry) => (
              <li key={`${entry.bookId}-${entry.title}`} className="flex items-center justify-between gap-3 py-2 text-[13.5px]">
                {entry.bookId ? (
                  <Link href={`/books/${entry.bookId}`} className="min-w-0 truncate hover:underline hover:underline-offset-4">{entry.title}</Link>
                ) : (
                  <span className="min-w-0 truncate">{entry.title}</span>
                )}
                <span className="tabular shrink-0 text-muted">{entry.rounds}번</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card p-4">
      <p className="text-[12.5px] text-muted">{label}</p>
      <p className="mt-1 text-[24px] font-bold tracking-tight">{value}</p>
      {note && <p className="mt-0.5 text-[12px] text-faint">{note}</p>}
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="card mt-4 p-4 sm:p-5">
      <h2 className="text-[14.5px] font-semibold">{title}</h2>
      {subtitle && <p className="text-[12px] text-faint">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function niceMax(value: number) {
  if (value <= 4) return Math.max(1, value);
  const step = value <= 10 ? 2 : value <= 25 ? 5 : 10;
  return Math.ceil(value / step) * step;
}

// Column chart: one series, accent bars ≤24px wide with a 4px rounded cap,
// a recessive grid, the peak labelled and every bar in the hover tooltip.
function Columns({ data, unit, compact }: { data: Datum[]; unit: string; compact?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((item) => item.value)));
  const peak = data.reduce((best, item, index) => (item.value > data[best].value ? index : best), 0);
  const height = compact ? 120 : 168;
  return (
    <div>
      <div className="relative flex" style={{ height: height + 22 }}>
        <div className="tabular flex w-7 shrink-0 flex-col justify-between pb-[22px] text-right text-[10.5px] leading-none text-faint">
          <span>{max}</span>
          <span>{max / 2 === Math.round(max / 2) ? max / 2 : ""}</span>
          <span>0</span>
        </div>
        <div className="relative ml-2 flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-line" />
          <div className="pointer-events-none absolute inset-x-0 border-t border-line" style={{ top: height / 2 }} />
          <div className="pointer-events-none absolute inset-x-0 border-t border-line-strong" style={{ top: height }} />
          <div className="absolute inset-x-0 top-0 flex gap-[2px]" style={{ height }}>
            {data.map((item, index) => (
              <div
                key={item.label}
                className="relative flex h-full flex-1 items-end justify-center"
                onMouseEnter={() => setHover(index)}
                onMouseLeave={() => setHover(null)}
                onClick={() => setHover(hover === index ? null : index)}
              >
                {index === peak && item.value > 0 && hover == null && (
                  <span className="tabular absolute text-[11px] font-semibold text-ink-2" style={{ bottom: (item.value / max) * height + 3 }}>
                    {item.value}
                  </span>
                )}
                <div
                  className={`w-full max-w-6 rounded-t-[4px] transition-opacity ${hover != null && hover !== index ? "opacity-40" : ""}`}
                  style={{ height: item.value ? Math.max(2, (item.value / max) * height) : 0, background: "var(--accent)" }}
                />
                {hover === index && (
                  <div className="tabular pointer-events-none absolute z-10 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11.5px] text-surface shadow-lg" style={{ bottom: (item.value / max) * height + 8 }}>
                    {item.label} · {item.value}{unit}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="absolute inset-x-0 flex gap-[2px]" style={{ top: height + 6 }}>
            {data.map((item, index) => (
              <span key={item.label} className={`flex-1 truncate text-center text-[10.5px] ${hover === index ? "text-ink" : "text-faint"}`}>
                {data.length > 12 && index % 2 ? "" : item.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <details className="mt-2 text-[12px] text-muted">
        <summary className="cursor-pointer select-none">표로 보기</summary>
        <table className="tabular mt-2 w-full max-w-sm text-left">
          <tbody>
            {data.map((item) => (
              <tr key={item.label} className="border-t border-line">
                <td className="py-1">{item.label}</td>
                <td className="py-1 text-right text-ink">{item.value}{unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

// Ranked horizontal bars; the label and value are text, the bar is the mark.
function Bars({ data, unit, empty }: { data: Datum[]; unit: string; empty: string }) {
  if (!data.length) return <p className="py-6 text-center text-[12.5px] text-muted">{empty}</p>;
  const max = Math.max(...data.map((item) => item.value));
  return (
    <ul className="space-y-2.5">
      {data.map((item) => (
        <li key={item.label} className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-3 text-[13px]">
          <span className="truncate text-ink-2" title={item.label}>{item.label}</span>
          <span className="h-3.5 overflow-hidden rounded-r-[4px]">
            <span className="block h-full rounded-r-[4px]" style={{ width: `${(item.value / max) * 100}%`, background: "var(--accent)" }} />
          </span>
          <span className="tabular w-10 text-right text-muted">{item.value}{unit}</span>
        </li>
      ))}
    </ul>
  );
}

const STEPS = ["var(--sunken)", "color-mix(in oklab, var(--accent) 35%, var(--surface))", "color-mix(in oklab, var(--accent) 65%, var(--surface))", "var(--accent)"];

// GitHub-style grid: one column per week, Sunday on top; the shade is how
// many books were in progress that day (0, 1, 2, 3+).
function Heatmap({ counts, from, to }: { counts: Map<string, number>; from: string; to: string }) {
  const [hover, setHover] = useState<{ day: string; value: number } | null>(null);
  const start = new Date(`${from}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const end = Date.parse(`${to}T00:00:00Z`);
  const weeks: Array<Array<string | null>> = [];
  for (let day = start.getTime(); day <= end; day += 7 * 86400000) {
    weeks.push(
      Array.from({ length: 7 }, (_, offset) => {
        const date = new Date(day + offset * 86400000).toISOString().slice(0, 10);
        return date < from || date > to ? null : date;
      }),
    );
  }
  const readingDays = [...counts.entries()].filter(([day, value]) => value > 0 && day >= from && day <= to).length;
  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="flex w-max gap-[3px]">
          {weeks.map((week, index) => (
            <div key={index} className="flex flex-col gap-[3px]">
              {week.map((day, row) => {
                const value = day ? counts.get(day) ?? 0 : 0;
                return (
                  <span
                    key={row}
                    className="block size-[11px] rounded-[3px]"
                    style={{ background: day ? STEPS[Math.min(3, value)] : "transparent" }}
                    onMouseEnter={() => day && setHover({ day, value })}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => day && setHover({ day, value })}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
        <span className="tabular">{hover ? `${hover.day.replace(/-/g, ".")} · ${hover.value ? `${hover.value}권 읽는 중` : "읽은 책 없음"}` : `책을 읽은 날 ${readingDays}일`}</span>
        <span className="flex items-center gap-1">
          적음
          {STEPS.map((color) => <span key={color} className="block size-[11px] rounded-[3px]" style={{ background: color }} />)}
          많음
        </span>
      </div>
    </div>
  );
}
