"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { type ReadingStatus, type ReadingView, statusLabels } from "../../lib/readings";
import { Icon } from "./Icon";
import { StarRating } from "./StarRating";
import { toast } from "./Toaster";

// Edit one reading record in a dialog: status, dates, rating, one-line review,
// memo and current page.
export function ReadingEditor({ reading, onClose }: { reading: ReadingView; onClose: () => void }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState<ReadingStatus>(reading.status);
  const [startedAt, setStartedAt] = useState(reading.startedAt ?? "");
  const [finishedAt, setFinishedAt] = useState(reading.finishedAt ?? "");
  const [stoppedAt, setStoppedAt] = useState(reading.stoppedAt ?? "");
  const [rating, setRating] = useState<number | null>(reading.rating);
  const [review, setReview] = useState(reading.review);
  const [memo, setMemo] = useState(reading.memo);
  const [currentPage, setCurrentPage] = useState(reading.currentPage?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(`/api/readings/${reading.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status,
          startedAt: startedAt || null,
          finishedAt: status === "finished" ? finishedAt || null : null,
          stoppedAt: status === "stopped" ? stoppedAt || null : null,
          rating,
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

        {reading.source === "bookit" && (
          <p className="mt-3 rounded-lg bg-sunken px-3 py-2 text-[12px] text-muted">
            북적북적에서 가져온 기록입니다. 병행하는 동안 상태·날짜·메모는 다음 가져오기 때 북적북적 기준으로 바뀝니다. 별점·한줄평은 유지됩니다.
          </p>
        )}

        <div className="mt-4 space-y-4">
          <div className="seg w-full" role="group" aria-label="독서 상태">
            {(Object.keys(statusLabels) as ReadingStatus[]).map((key) => (
              <button key={key} type="button" className="flex-1" aria-pressed={status === key} onClick={() => setStatus(key)}>
                {statusLabels[key]}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[12px] text-muted">
              시작일
              <input type="date" className="field mt-1 w-full text-ink" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} />
            </label>
            {status === "finished" && (
              <label className="block text-[12px] text-muted">
                완독일
                <input type="date" className="field mt-1 w-full text-ink" value={finishedAt} onChange={(event) => setFinishedAt(event.target.value)} />
              </label>
            )}
            {status === "stopped" && (
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

          <div>
            <p className="text-[12px] text-muted">별점</p>
            <div className="mt-1">
              <StarRating value={rating} onChange={setRating} size={26} />
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
