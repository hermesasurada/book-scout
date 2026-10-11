"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { toast } from "../../components/Toaster";
import { consumeCameFromList, listLabel, listReturnUrl } from "../../components/listNav";

// Back to the list position the reader left (filter, sort, page, scroll).
// Opened from a list → pop history; a direct visit → the remembered list.
export function BackLink() {
  const router = useRouter();
  const fromList = useRef(false);
  const [target, setTarget] = useState("/reading");
  useEffect(() => {
    fromList.current = consumeCameFromList();
    // Reading browser storage after mount; the label only names the list.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTarget(listReturnUrl());
  }, []);
  return (
    <Link
      href={target}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        if (fromList.current) router.back();
        else router.push(target);
      }}
      className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
    >
      <Icon name="arrowLeft" className="size-4" />
      {listLabel(target)}
    </Link>
  );
}

export function BookActions({ bookId, title, aladinLink, watched }: { bookId: number; title: string; aladinLink: string; watched: boolean }) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    try {
      const response = await fetch("/api/checks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookId }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error);
      toast("상태를 새로 확인했습니다.");
      router.refresh();
    } catch (error) {
      toast(error instanceof Error && error.message ? error.message : "상태 확인에 실패했습니다.", "error");
    } finally {
      setChecking(false);
    }
  }

  async function unwatch() {
    if (!window.confirm(`‘${title}’을 관심도서에서 삭제할까요?`)) return;
    const response = await fetch(`/api/books?id=${bookId}`, { method: "DELETE" });
    if (!response.ok) {
      toast("삭제하지 못했습니다.", "error");
      return;
    }
    toast("관심도서에서 삭제했습니다.");
    router.refresh();
  }

  return (
    <>
      {watched && (
        <button className="btn" onClick={() => void check()} disabled={checking}>
          <Icon name="refresh" className={checking ? "spin" : undefined} />
          {checking ? "확인 중…" : "재고·대출 확인"}
        </button>
      )}
      {aladinLink && (
        <a className="btn" href={aladinLink} target="_blank" rel="noreferrer">
          <Icon name="external" />
          알라딘
        </a>
      )}
      {watched && (
        <button className="btn btn-ghost hover:!text-bad" onClick={() => void unwatch()}>
          <Icon name="trash" />
          관심도서에서 삭제
        </button>
      )}
    </>
  );
}
