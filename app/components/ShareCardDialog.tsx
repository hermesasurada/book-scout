"use client";
/* eslint-disable @next/next/no-img-element -- the preview is a generated blob URL */

import { useEffect, useRef, useState } from "react";
import { statusLabels, type ReadingView } from "../../lib/readings";
import { shareCredits, sharePeriod, sharePublication, shareTitle } from "../../lib/shareText";
import { Icon } from "./Icon";
import { toast } from "./Toaster";

type ShareReading = Pick<ReadingView, "title" | "author" | "publisher" | "pubDate" | "isbn13" | "cover" | "startedAt" | "finishedAt" | "datesUnknown" | "round">;

// X shows single images at 16:9; lay out at 1200×675 and render at 4/3 scale.
const W = 1200;
const H = 675;
const SCALE = 4 / 3;
const FONT = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", sans-serif';

// 완독 share image: cover, title, credits and the reading period.
export function ShareCardDialog({ reading, onClose }: { reading: ShareReading; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [failed, setFailed] = useState(false);
  // The Clipboard API only exists on https or localhost, not the plain-http Tailscale address.
  const [canCopy] = useState(() => typeof window !== "undefined" && window.isSecureContext && "ClipboardItem" in window);

  useEffect(() => {
    dialog.current?.showModal();
    let objectUrl: string | null = null;
    let cancelled = false;
    renderCard(reading)
      .then((image) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(image);
        setBlob(image);
        setUrl(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [reading]);

  async function copy() {
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast("이미지를 클립보드에 복사했습니다.");
    } catch {
      toast("클립보드에 복사하지 못했습니다.", "error");
    }
  }

  const fileName = `${shareTitle(reading.title).main.replace(/[\\/:*?"<>|]/g, "").slice(0, 60)}-완독.png`;

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(event) => event.target === dialog.current && dialog.current?.close()}
      className="m-auto w-[min(720px,calc(100vw-24px))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/40"
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] text-muted">완독 이미지</p>
            <h2 className="truncate text-[16px] font-bold">{reading.title}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={() => dialog.current?.close()} aria-label="닫기">
            <Icon name="x" />
          </button>
        </div>
        <div className="mt-4 aspect-video overflow-hidden rounded-lg border border-line bg-sunken">
          {url ? (
            <img src={url} alt={`${reading.title} 완독 이미지`} className="block size-full" />
          ) : (
            <div className="grid size-full place-items-center text-[13px] text-muted">{failed ? "이미지를 만들지 못했습니다." : "이미지를 만드는 중…"}</div>
          )}
        </div>
        <div className="mt-4 flex items-center justify-end gap-3 sm:justify-between">
          <p className="hidden text-[12px] text-muted sm:block">1600×900 PNG · X에 바로 올릴 수 있는 16:9 크기입니다.</p>
          <div className="flex shrink-0 gap-2">
            <button
              className="btn"
              onClick={() => void copy()}
              disabled={!blob || !canCopy}
              title={canCopy ? "클립보드에 복사" : "https 주소에서만 복사할 수 있습니다"}
            >
              <Icon name="copy" />
              복사
            </button>
            <a className={`btn btn-primary ${url ? "" : "pointer-events-none opacity-50"}`} href={url ?? undefined} download={fileName} aria-disabled={!url}>
              <Icon name="download" />
              저장
            </a>
          </div>
        </div>
        {!canCopy && <p className="mt-2 text-right text-[11.5px] text-faint">이 주소(http)에서는 브라우저가 클립보드 복사를 막아 저장만 할 수 있습니다.</p>}
      </div>
    </dialog>
  );
}

async function renderCard(reading: ShareReading): Promise<Blob> {
  const css = getComputedStyle(document.documentElement);
  const color = (name: string) => css.getPropertyValue(`--share-${name}`).trim();
  const title = shareTitle(reading.title);
  const credits = shareCredits(reading.author);
  const period = sharePeriod(reading);
  const publication = sharePublication(reading.publisher, reading.pubDate);
  const isbn = reading.isbn13 ? `ISBN ${reading.isbn13}` : "";
  const label = reading.round > 1 ? `${statusLabels.finished} · ${reading.round}회독` : statusLabels.finished;

  // Pretendard is a dynamic subset: load the glyphs this card uses before drawing.
  const text = [title.main, title.sub, credits, publication, isbn, period.range, period.days, label].join("");
  await Promise.all([400, 600, 700].map((weight) => document.fonts.load(`${weight} 40px ${FONT}`, text))).catch(() => undefined);
  const cover = await loadCover(reading.cover);

  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = color("bg");
  ctx.fillRect(0, 0, W, H);

  // Cover on the left, at most 380×560, centred vertically.
  const box = { x: 64, w: 380, h: 560 };
  let cw = box.w;
  let ch = box.h;
  if (cover) {
    const ratio = cover.naturalWidth / cover.naturalHeight;
    if (ratio > box.w / box.h) ch = box.w / ratio;
    else cw = box.h * ratio;
  }
  const cx = box.x + (box.w - cw) / 2;
  const cy = (H - ch) / 2;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.18)";
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = color("line");
  ctx.fillRect(cx, cy, cw, ch);
  ctx.restore();
  if (cover) ctx.drawImage(cover, cx, cy, cw, ch);

  // Text column on the right, centred as a block.
  const x = box.x + box.w + 64;
  const maxWidth = W - x - 64;
  const titleSize = fitSize(ctx, title.main, maxWidth, [68, 58, 50], 3);
  const titleLines = wrap(ctx, title.main, maxWidth, `700 ${titleSize}px ${FONT}`, 3);
  const subLines = title.sub ? wrap(ctx, title.sub, maxWidth, `400 28px ${FONT}`, 2) : [];
  const creditLines = credits ? wrap(ctx, credits, maxWidth, `400 32px ${FONT}`, 2) : [];
  const titleLead = titleSize * 1.25;
  const blocks = [
    40, // label
    titleLines.length * titleLead,
    subLines.length ? 10 + subLines.length * 40 : 0,
    creditLines.length ? 28 + creditLines.length * 44 : 0,
    publication ? 6 + 36 : 0,
    isbn ? 34 : 0,
    period.range ? 40 + 1 + 32 + 44 : 0,
  ];
  let y = (H - blocks.reduce((sum, value) => sum + value, 0)) / 2;
  ctx.textBaseline = "top";

  ctx.fillStyle = color("accent");
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText(label, x, y);
  y += 40;

  ctx.fillStyle = color("ink");
  ctx.font = `700 ${titleSize}px ${FONT}`;
  for (const line of titleLines) {
    ctx.fillText(line, x, y + (titleLead - titleSize) / 2);
    y += titleLead;
  }
  if (subLines.length) {
    y += 10;
    ctx.fillStyle = color("muted");
    ctx.font = `400 28px ${FONT}`;
    for (const line of subLines) {
      ctx.fillText(line, x, y);
      y += 40;
    }
  }
  if (creditLines.length) {
    y += 28;
    ctx.fillStyle = color("ink-2");
    ctx.font = `400 32px ${FONT}`;
    for (const line of creditLines) {
      ctx.fillText(line, x, y);
      y += 44;
    }
  }
  if (publication) {
    y += 6;
    ctx.fillStyle = color("muted");
    ctx.font = `400 26px ${FONT}`;
    ctx.fillText(wrap(ctx, publication, maxWidth, ctx.font, 1)[0], x, y);
    y += 36;
  }
  if (isbn) {
    ctx.fillStyle = color("muted");
    ctx.font = `400 22px ${FONT}`;
    ctx.fillText(isbn, x, y);
    y += 34;
  }
  if (period.range) {
    y += 40;
    ctx.fillStyle = color("line");
    ctx.fillRect(x, y, maxWidth, 1);
    y += 1 + 32;
    ctx.fillStyle = color("ink");
    ctx.font = `600 34px ${FONT}`;
    ctx.fillText(period.range, x, y);
    if (period.days) {
      const offset = ctx.measureText(period.range).width + 18;
      ctx.fillStyle = color("muted");
      ctx.font = `400 30px ${FONT}`;
      ctx.fillText(period.days, x + offset, y + 2);
    }
  }

  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob"))), "image/png"));
}

// Aladin serves covers with CORS, so the canvas stays exportable. A cover
// that fails to load is left out rather than failing the whole card.
function loadCover(src: string | null): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src.replace("/cover200/", "/cover500/");
  });
}

function fitSize(ctx: CanvasRenderingContext2D, text: string, width: number, sizes: number[], maxLines: number) {
  for (const size of sizes) {
    if (wrap(ctx, text, width, `700 ${size}px ${FONT}`, maxLines + 1).length <= maxLines) return size;
  }
  return sizes[sizes.length - 1];
}

// Break at spaces where possible (Korean reads well split between words),
// otherwise per character; the last allowed line ends with an ellipsis.
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, font: string, maxLines: number) {
  ctx.font = font;
  const lines: string[] = [];
  let line = "";
  for (const token of text.split(/(\s+)/)) {
    const next = line + token;
    if (ctx.measureText(next).width <= width || !line.trim()) {
      line = next;
      while (ctx.measureText(line).width > width) {
        let cut = line.length - 1;
        while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > width) cut -= 1;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
      continue;
    }
    lines.push(line.trimEnd());
    line = token.trimStart();
  }
  if (line.trim()) lines.push(line.trimEnd());
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last.trimEnd()}…`;
  return kept;
}
