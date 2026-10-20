"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { isYearOnly, type ReadingStatus, type ReadingView, statusLabels } from "../../lib/readings";
import { Icon } from "./Icon";
import { toast } from "./Toaster";

type DateMode = "day" | "year" | "unknown";
const DATE_MODES: Array<{ key: DateMode; label: string }> = [
  { key: "day", label: "날짜" },
  { key: "year", label: "연도만" },
  { key: "unknown", label: "모름" },
];

// Edit one reading record in a dialog: status, dates (full, finish year only
// or unknown), one-line review, memo and current page.
export function ReadingEditor({ reading, onClose }: { reading: ReadingView; onClose: () => void }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState<ReadingStatus>(reading.status);
  const [startedAt, setStartedAt] = useState(reading.startedAt ?? "");
  const yearOnly = isYearOnly(reading.finishedAt);
  const [finishedAt, setFinishedAt] = useState(yearOnly ? "" : (reading.finishedAt ?? ""));
  const [finishedYear, setFinishedYear] = useState(reading.finishedAt?.slice(0, 4) ?? "");
  const [stoppedAt, setStoppedAt] = useState(reading.stoppedAt ?? "");
  const [chosenMode, setDateMode] = useState<DateMode>(reading.datesUnknown ? "unknown" : yearOnly ? "year" : "day");
  // "연도만" applies to finished records only.
  const dateMode: DateMode = chosenMode === "year" && status !== "finished" ? "day" : chosenMode;
  const [review, setReview] = useState(reading.review);
  const [memo, setMemo] = useState(reading.memo);
  const [currentPage, setCurrentPage] = useState(reading.currentPage?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    const thisYear = new Date().getFullYear();
    if (dateMode === "year" && !(/^\d{4}$/.test(finishedYear) && Number(finishedYear) >= 1900 && Number(finishedYear) <= thisYear)) {
      toast("완독 연도를 네 자리로 입력해 주세요.", "error");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/readings/${reading.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status,
          datesUnknown: dateMode === "unknown",
          startedAt: dateMode === "day" ? startedAt || null : null,
          finishedAt: status !== "finished" ? null : dateMode === "day" ? finishedAt || null : dateMode === "year" ? finishedYear : null,
          stoppedAt: dateMode === "day" && status === "stopped" ? stoppedAt || null : null,
          review,
          memo,
          currentPage: status === "reading" ? currentPage : null,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error);
      toast("기록을 저장했습니다.");
      router.refresh();
      onClose();
    } catch (error) {
      toast(error instanceof Error && error.message ? error.message : "저장하지 못했습니다.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`‘${reading.title}’ 독서 기록을 삭제할까요?`)) return;
    const response = await fetch(`/api/readings/${reading.id}`, { method: "DELETE" });
    if (!response.ok) {
      toast("삭제하지 못했습니다.", "error");
      return;
    }
    toast("독서 기록을 삭제했습니다.");
    router.refresh();
    onClose();
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(event) => event.target === dialog.current && dialog.current?.close()}
      className="m-auto w-[min(520px,calc(100vw-24px))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/40"
    >
      <form onSubmit={save} className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] text-muted">{reading.round > 1 ? `${reading.round}회독 기록` : "독서 기록"}</p>
            <h2 className="truncate text-[16px] font-bold">{reading.title}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={() => dialog.current?.close()} aria-label="닫기">
            <Icon name="x" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="seg w-full" role="group" aria-label="독서 상태">
            {(Object.keys(statusLabels) as ReadingStatus[]).map((key) => (
              <button key={key} type="button" className="flex-1" aria-pressed={status === key} onClick={() => setStatus(key)}>
                {statusLabels[key]}
              </button>
            ))}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-[12px] text-muted">
              <span>날짜</span>
              <div className="seg" role="group" aria-label="날짜 입력 방식">
                {DATE_MODES.filter((mode) => mode.key !== "year" || status === "finished").map((mode) => (
                  <button key={mode.key} type="button" aria-pressed={dateMode === mode.key} onClick={() => setDateMode(mode.key)}>
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {dateMode === "day" && (
                <label className="block text-[12px] text-muted">
                  시작일
                  <input type="date" className="field mt-1 w-full text-ink" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} />
                </label>
              )}
              {dateMode === "day" && status === "finished" && (
                <label className="block text-[12px] text-muted">
                  완독일
                  <input type="date" className="field mt-1 w-full text-ink" value={finishedAt} onChange={(event) => setFinishedAt(event.target.value)} />
                </label>
              )}
              {dateMode === "year" && (
                <label className="block text-[12px] text-muted">
                  완독 연도
                  <input
                    type="number"
                    min={1900}
                    max={new Date().getFullYear()}
                    inputMode="numeric"
                    className="field mt-1 w-full text-ink"
                    value={finishedYear}
                    onChange={(event) => setFinishedYear(event.target.value)}
                    placeholder="예: 2019"
                  />
                </label>
              )}
              {dateMode === "day" && status === "stopped" && (
                <label className="block text-[12px] text-muted">
                  중단일
                  <input type="date" className="field mt-1 w-full text-ink" value={stoppedAt} onChange={(event) => setStoppedAt(event.target.value)} />
                </label>
              )}
              {status === "reading" && (
                <label className="block text-[12px] text-muted">
                  읽은 쪽{reading.pages ? ` / ${reading.pages}` : ""}
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    className="field mt-1 w-full text-ink"
                    value={currentPage}
                    onChange={(event) => setCurrentPage(event.target.value)}
                  />
                </label>
              )}
            </div>
          </div>

          <label className="block text-[12px] text-muted">
            한줄평
            <input className="field mt-1 w-full text-ink" value={review} maxLength={500} onChange={(event) => setReview(event.target.value)} placeholder="이 책을 한 줄로" />
          </label>

          <label className="block text-[12px] text-muted">
            메모
            <textarea
              className="field mt-1 h-24 w-full resize-y py-2 text-ink"
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
            />
          </label>
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <button type="button" className="btn btn-ghost hover:!text-bad" onClick={() => void remove()}>
            <Icon name="trash" />
            삭제
          </button>
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={() => dialog.current?.close()}>취소</button>
            <button className="btn btn-primary" disabled={saving}>{saving ? "저장 중…" : "저장"}</button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
