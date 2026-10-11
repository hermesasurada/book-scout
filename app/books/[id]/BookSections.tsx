"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { type ReadingView, readingPeriod, statusLabels } from "../../../lib/readings";
import { dotDate } from "../../../lib/readings";
import { Icon } from "../../components/Icon";
import { ReadingEditor } from "../../components/ReadingEditor";
import { toast } from "../../components/Toaster";

export type NoteView = { id: number; readingId: number; page: number | null; quote: string; memo: string; createdAt: string };
export type PurchaseView = {
  id: number;
  purchasedAt: string;
  channel: string;
  store: string;
  condition: string;
  price: number | null;
  quantity: number;
  source: string;
};

const CHANNELS: Record<string, string> = { aladin_online: "알라딘 온라인", aladin_store: "알라딘 매장", other: "기타" };
const CONDITIONS: Record<string, string> = { new: "새책", used: "중고", ebook: "eBook" };

async function send(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(data.error || "요청에 실패했습니다.");
  return data;
}

export function ReadingSection({ readings, notes }: { readings: ReadingView[]; notes: NoteView[] }) {
  const [editing, setEditing] = useState<ReadingView | null>(null);
  if (!readings.length) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-2.5 text-[15px] font-semibold">독서 기록</h2>
      <div className="space-y-3">
        {readings.map((reading) => (
          <div key={reading.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold">
                  <span className={reading.status === "finished" ? "text-accent" : reading.status === "stopped" ? "text-warn" : "text-ink"}>
                    {statusLabels[reading.status]}
                  </span>
                  {reading.round > 1 && <span className="chip">{reading.round}회독</span>}
                </p>
                <p className="tabular mt-0.5 text-[12.5px] text-muted">{readingPeriod(reading)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button className="icon-btn" onClick={() => setEditing(reading)} aria-label="기록 편집" title="기록 편집">
                  <Icon name="pencil" />
                </button>
              </div>
            </div>
            {reading.review && <p className="mt-2 text-[13.5px] text-ink-2">“{reading.review}”</p>}
            {reading.memo && <p className="mt-2 whitespace-pre-line text-[12.5px] text-muted">{reading.memo}</p>}
            <Notes readingId={reading.id} notes={notes.filter((note) => note.readingId === reading.id)} />
          </div>
        ))}
      </div>
      {editing && <ReadingEditor reading={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

// 문장 수집 under a reading: quotes with page and an optional thought.
function Notes({ readingId, notes }: { readingId: number; notes: NoteView[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState("");
  const [quote, setQuote] = useState("");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);

  async function add(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await send(`/api/readings/${readingId}/notes`, "POST", { page, quote, memo });
      setPage("");
      setQuote("");
      setMemo("");
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "저장하지 못했습니다.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(note: NoteView) {
    if (!window.confirm("이 문장을 삭제할까요?")) return;
    try {
      await send(`/api/notes/${note.id}`, "DELETE");
      router.refresh();
    } catch {
      toast("삭제하지 못했습니다.", "error");
    }
  }

  return (
    <div className="mt-3 border-t border-line pt-3">
      {notes.length > 0 && (
        <ul className="mb-2 space-y-2.5">
          {notes.map((note) => (
            <li key={note.id} className="group flex gap-2.5">
              <Icon name="quote" className="mt-0.5 size-4 shrink-0 text-faint" />
              <div className="min-w-0 flex-1">
                {note.quote && <p className="whitespace-pre-line text-[13.5px] leading-relaxed">{note.quote}</p>}
                {note.memo && <p className="mt-0.5 whitespace-pre-line text-[12.5px] text-muted">{note.memo}</p>}
                {note.page ? <p className="tabular mt-0.5 text-[11.5px] text-faint">p.{note.page}</p> : null}
              </div>
              <button className="icon-btn danger size-7 md:opacity-0 md:group-hover:opacity-100" onClick={() => void remove(note)} aria-label="문장 삭제">
                <Icon name="trash" className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <form onSubmit={add} className="space-y-2">
          <textarea className="field h-20 w-full resize-y py-2" value={quote} onChange={(event) => setQuote(event.target.value)} placeholder="마음에 남은 문장" aria-label="문장" autoFocus />
          <input className="field w-full" value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="내 생각 (선택)" aria-label="내 생각" />
          <div className="flex items-center gap-2">
            <input className="field w-24" inputMode="numeric" value={page} onChange={(event) => setPage(event.target.value)} placeholder="쪽" aria-label="쪽" />
            <div className="ml-auto flex gap-2">
              <button type="button" className="btn" onClick={() => setOpen(false)}>취소</button>
              <button className="btn btn-primary" disabled={saving || (!quote.trim() && !memo.trim())}>저장</button>
            </div>
          </div>
        </form>
      ) : (
        <button className="btn btn-ghost -ml-2 h-7 px-2 text-[12.5px]" onClick={() => setOpen(true)}>
          <Icon name="plus" />
          문장 수집
        </button>
      )}
    </div>
  );
}

export function PurchaseSection({ purchases }: { purchases: PurchaseView[] }) {
  const router = useRouter();
  if (!purchases.length) return null;

  async function remove(purchase: PurchaseView) {
    if (!window.confirm("이 구매 이력을 삭제할까요?")) return;
    try {
      await send(`/api/purchases/${purchase.id}`, "DELETE");
      router.refresh();
    } catch {
      toast("삭제하지 못했습니다.", "error");
    }
  }

  return (
    <section className="mt-8">
      <h2 className="mb-2.5 text-[15px] font-semibold">구매 이력</h2>
      <ul className="card divide-y divide-line">
        {purchases.map((purchase) => (
          <li key={purchase.id} className="group flex items-center gap-3 px-4 py-2.5 text-[13px]">
            <span className="tabular w-[86px] shrink-0 text-muted">{dotDate(purchase.purchasedAt)}</span>
            <span className="min-w-0 flex-1 truncate">
              {purchase.channel === "aladin_store" && purchase.store ? `알라딘 ${purchase.store}` : CHANNELS[purchase.channel] ?? purchase.channel}
              <span className="text-muted"> · {CONDITIONS[purchase.condition] ?? purchase.condition}</span>
              {purchase.source === "gmail" && <span className="text-faint"> · 메일</span>}
            </span>
            {purchase.price ? <span className="tabular text-muted">{purchase.price.toLocaleString()}원</span> : null}
            <button className="icon-btn danger size-7 md:opacity-0 md:group-hover:opacity-100" onClick={() => void remove(purchase)} aria-label="구매 이력 삭제">
              <Icon name="trash" className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// 읽기 시작 / 소장 등록 / 관심도서 — the actions for a book that is not only watched.
export function LibraryActions({
  bookId,
  itemId,
  isbn13,
  title,
  watched,
  owned,
  reading,
  readBefore,
  hiddenFromShelf,
}: {
  bookId: number;
  itemId: string;
  isbn13: string;
  title: string;
  watched: boolean;
  owned: boolean;
  reading: boolean;
  /** Already read once — starting again is a re-read. */
  readBefore: boolean;
  /** Owned but taken off 내 서재 by hand. */
  hiddenFromShelf: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [buying, setBuying] = useState(false);

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      toast(done);
      router.refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "요청에 실패했습니다.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!reading && (
        <button className="btn btn-accent" disabled={busy} onClick={() => void run(() => send("/api/readings", "POST", { bookId }), readBefore ? "다시 읽기 시작했습니다." : "읽기 시작했습니다.")}>
          <Icon name="bookOpen" />
          {readBefore ? "다시 읽기" : "읽기 시작"}
        </button>
      )}
      {!owned && (
        <button className="btn" disabled={busy} onClick={() => setBuying(true)}>
          <Icon name="shelf" />
          소장 등록
        </button>
      )}
      {!watched && !owned && (
        <button className="btn" disabled={busy} onClick={() => void run(() => send("/api/books", "POST", { itemId, isbn13, title }), "관심도서에 담았습니다.")}>
          <Icon name="bookmark" />
          관심도서
        </button>
      )}
      {owned && !readBefore &&
        (hiddenFromShelf ? (
          <button className="btn" disabled={busy} onClick={() => void run(() => send("/api/shelf", "PUT", { bookIds: [bookId] }), "내 서재에 다시 넣었습니다.")}>
            <Icon name="shelf" />
            서재에 다시 넣기
          </button>
        ) : (
          <button
            className="btn btn-ghost hover:!text-bad"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`‘${title}’을 내 서재에서 뺄까요? 구매 이력은 그대로 남습니다.`)) {
                void run(() => send("/api/shelf", "DELETE", { bookIds: [bookId] }), "내 서재에서 뺐습니다.");
              }
            }}
          >
            <Icon name="trash" />
            서재에서 빼기
          </button>
        ))}
      {buying && <PurchaseDialog bookId={bookId} title={title} onClose={() => setBuying(false)} />}
    </>
  );
}

function PurchaseDialog({ bookId, title, onClose }: { bookId: number; title: string; onClose: () => void }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [purchasedAt, setPurchasedAt] = useState(() => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10));
  const [channel, setChannel] = useState("other");
  const [condition, setCondition] = useState("new");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await send("/api/purchases", "POST", { bookId, purchasedAt, channel, condition, price });
      toast("소장 도서로 등록했습니다.");
      router.refresh();
      dialog.current?.close();
    } catch (error) {
      toast(error instanceof Error ? error.message : "저장하지 못했습니다.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(event) => event.target === dialog.current && dialog.current?.close()}
      className="m-auto w-[min(420px,calc(100vw-24px))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/40"
    >
      <form onSubmit={save} className="space-y-4 p-5">
        <div>
          <p className="text-[12px] text-muted">소장 등록</p>
          <h2 className="truncate text-[16px] font-bold">{title}</h2>
          <p className="mt-1 text-[12px] text-muted">알라딘에서 산 책은 Gmail 연동으로 자동 등록됩니다. 다른 곳에서 샀거나 원래 갖고 있던 책을 여기서 등록하세요.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-[12px] text-muted">
            구매일
            <input type="date" className="field mt-1 w-full text-ink" value={purchasedAt} onChange={(event) => setPurchasedAt(event.target.value)} />
          </label>
          <label className="block text-[12px] text-muted">
            가격(선택)
            <input className="field mt-1 w-full text-ink" inputMode="numeric" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="원" />
          </label>
          <label className="block text-[12px] text-muted">
            구매처
            <select className="field mt-1 w-full text-ink" value={channel} onChange={(event) => setChannel(event.target.value)}>
              {Object.entries(CHANNELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label className="block text-[12px] text-muted">
            상태
            <select className="field mt-1 w-full text-ink" value={condition} onChange={(event) => setCondition(event.target.value)}>
              {Object.entries(CONDITIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={() => dialog.current?.close()}>취소</button>
          <button className="btn btn-primary" disabled={saving}>등록</button>
        </div>
      </form>
    </dialog>
  );
}
