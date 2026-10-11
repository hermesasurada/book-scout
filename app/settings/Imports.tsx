"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, useState } from "react";
import { relativeTime } from "../../lib/books";
import { Icon } from "../components/Icon";
import { toast } from "../components/Toaster";

type Stats = { readings: number; unmatched: number; purchases: number; watchlist: number; lastMailImport: string | null };
type BookitResult = {
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  watchAdded: number;
  removed: number;
  keptOrphans: number;
  unmatched: Array<{ title: string; author: string; status: string }>;
  error?: string;
};
type GmailResult = { found: number; skipped: number; parsed: number; added: number; purchases: Array<{ title: string; purchasedAt: string; unwatched: boolean }>; error?: string };

export function Imports({ gmailReady, stats }: { gmailReady: boolean; stats: Stats }) {
  const router = useRouter();
  const [bookit, setBookit] = useState<BookitResult | null>(null);
  const [gmail, setGmail] = useState<GmailResult | null>(null);
  const [busy, setBusy] = useState<"bookit" | "gmail" | null>(null);

  async function importBookit(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy("bookit");
    setBookit(null);
    try {
      const response = await fetch("/api/import/bookit", { method: "POST", headers: { "content-type": "text/csv; charset=utf-8" }, body: await file.text() });
      const data = (await response.json()) as BookitResult;
      if (!response.ok) throw new Error(data.error);
      setBookit(data);
      router.refresh();
    } catch (error) {
      toast(error instanceof Error && error.message ? error.message : "가져오지 못했습니다.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function syncGmail(all: boolean) {
    setBusy("gmail");
    setGmail(null);
    try {
      const response = await fetch("/api/import/gmail", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(all ? { all: true } : { days: 30 }),
      });
      const data = (await response.json()) as GmailResult;
      if (!response.ok) throw new Error(data.error);
      setGmail(data);
      router.refresh();
    } catch (error) {
      toast(error instanceof Error && error.message ? error.message : "동기화하지 못했습니다.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-[22px] font-bold tracking-tight">가져오기 · 설정</h1>

      <section className="card p-5">
        <h2 className="text-[15px] font-semibold">북적북적 독서 기록</h2>
        <p className="mt-1 text-[13px] text-muted">
          북적북적에서 내보낸 <code className="rounded bg-sunken px-1">bookit_….csv</code>를 올리세요. 여러 번 올려도 중복되지 않고, 바뀐 상태·날짜·메모만 갱신됩니다. 읽고 싶은 책은 관심도서로 들어갑니다.
        </p>
        <p className="mt-2 text-[12.5px] text-faint">
          현재 독서 기록 {stats.readings.toLocaleString()}건{stats.unmatched ? ` · 판본 미연결 ${stats.unmatched}건` : ""}
        </p>
        <label className={`btn btn-primary mt-4 ${busy ? "pointer-events-none opacity-50" : ""}`}>
          <Icon name="plus" />
          {busy === "bookit" ? "가져오는 중… (1분 정도)" : "CSV 파일 선택"}
          <input type="file" accept=".csv,text/csv" className="sr-only-x" onChange={(event) => void importBookit(event)} disabled={busy !== null} />
        </label>
        {bookit && (
          <div className="mt-4 rounded-lg bg-sunken p-3 text-[13px]">
            <p>
              {bookit.total}건 중 새로 {bookit.created} · 갱신 {bookit.updated} · 그대로 {bookit.unchanged}
              {bookit.watchAdded ? ` · 관심도서 추가 ${bookit.watchAdded}` : ""}
              {bookit.removed ? ` · 삭제 ${bookit.removed}` : ""}
            </p>
            {bookit.unmatched.length > 0 && (
              <div className="mt-2">
                <p className="text-muted">알라딘 판본을 찾지 못한 기록 — <Link href="/reading" className="underline">독서 기록</Link>에서 ‘판본 연결’로 고를 수 있습니다.</p>
                <ul className="mt-1 list-disc pl-5 text-muted">
                  {bookit.unmatched.map((item) => <li key={item.title}>{item.title}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="text-[15px] font-semibold">알라딘 구매내역 (Gmail)</h2>
        <p className="mt-1 text-[13px] text-muted">
          Gmail의 알라딘 주문 접수·중고매장 구매 메일을 읽어 내 서재에 자동으로 등록합니다. 매일 08:00 점검 때 최근 2주를 확인하고, 산 책은 관심도서에서 내립니다.
        </p>
        {gmailReady ? (
          <>
            <p className="mt-2 text-[12.5px] text-faint">
              연결됨 · 구매 {stats.purchases.toLocaleString()}건 · 마지막 확인 {stats.lastMailImport ? relativeTime(stats.lastMailImport) : "없음"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn btn-primary" onClick={() => void syncGmail(false)} disabled={busy !== null}>
                <Icon name="refresh" className={busy === "gmail" ? "spin" : undefined} />
                최근 30일 확인
              </button>
              <button className="btn" onClick={() => void syncGmail(true)} disabled={busy !== null}>
                전체 기간 가져오기
              </button>
            </div>
            {gmail && (
              <div className="mt-4 rounded-lg bg-sunken p-3 text-[13px]">
                <p>메일 {gmail.found}통 (이미 읽음 {gmail.skipped}) · 새 구매 {gmail.added}권</p>
                {gmail.purchases.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-muted">
                    {gmail.purchases.slice(0, 20).map((item, index) => (
                      <li key={`${item.title}-${index}`}>{item.purchasedAt} {item.title}{item.unwatched ? " (관심도서에서 내림)" : ""}</li>
                    ))}
                    {gmail.purchases.length > 20 && <li>외 {gmail.purchases.length - 20}권</li>}
                  </ul>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="mt-3 rounded-lg bg-warn-soft p-3 text-[13px] text-ink-2">
            <p className="font-semibold text-warn">아직 연결되지 않았습니다.</p>
            <ol className="mt-1.5 list-decimal space-y-0.5 pl-5">
              <li>Google Cloud Console에서 Gmail API를 켜고 ‘데스크톱 앱’ OAuth 클라이언트를 만듭니다.</li>
              <li>클라이언트 ID·보안 비밀을 <code>.dev.vars</code>의 <code>GMAIL_CLIENT_ID</code>, <code>GMAIL_CLIENT_SECRET</code>에 넣습니다.</li>
              <li>터미널에서 <code>node scripts/gmail-auth.mjs</code>를 실행해 읽기 전용 권한을 허용합니다.</li>
              <li>서버를 재시작하면 이 화면에서 바로 가져올 수 있습니다.</li>
            </ol>
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="text-[15px] font-semibold">관심도서 점검</h2>
        <p className="mt-1 text-[13px] text-muted">
          관심도서 {stats.watchlist.toLocaleString()}권의 알라딘 분당서현점 중고 재고와 용인 보정도서관 대출 가능 여부를 매일 08:00에 확인하고, 새로 생기면 텔레그램으로 알립니다.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="text-[15px] font-semibold">데이터</h2>
        <p className="mt-1 text-[13px] text-muted">매일 점검 직전에 DB를 iCloud Drive의 book-scout-backups 폴더로 백업합니다(30일 보관, 매월 1일본은 계속).</p>
        <a className="btn mt-4" href="/api/export">
          <Icon name="external" />
          전체 데이터 내보내기 (JSON)
        </a>
      </section>
    </div>
  );
}
