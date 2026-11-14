"use client";
/* eslint-disable @next/next/no-img-element -- the preview is a generated blob URL */

import { useEffect, useRef, useState } from "react";
import { statusLabels, type ReadingView } from "../../lib/readings";
import { shareCredits, sharePeriod, shareTitle } from "../../lib/shareText";
import { Icon } from "./Icon";

type ShareReading = Pick<ReadingView, "title" | "author" | "publisher" | "cover" | "startedAt" | "finishedAt" | "datesUnknown" | "round">;

// X shows single images at 16:9; lay out at 1200×675 and render at 4/3 scale.
const W = 1200;
const H = 675;
const SCALE = 4 / 3;
const FONT = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", sans-serif';

// 완독 share image: cover, title, credits and the reading period.
export function ShareCardDialog({ reading, onClose }: { reading: ShareReading; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
    let objectUrl: string | null = null;
    let cancelled = false;
    renderCard(reading)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [reading]);

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
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-[12px] text-muted">1600×900 PNG · X에 바로 올릴 수 있는 16:9 크기입니다.</p>
          <a className={`btn btn-primary shrink-0 ${url ? "" : "pointer-events-none opacity-50"}`} href={url ?? undefined} download={fileName} aria-disabled={!url}>
            <Icon name="download" />
            이미지 저장
          </a>
        </div>
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
  const label = reading.round > 1 ? `${statusLabels.finished} · ${reading.round}회독` : statusLabels.finished;

  // Pretendard is a dynamic subset: load the glyphs this card uses before drawing.
  const text = [title.main, title.sub, credits, reading.publisher, period.range, period.days, label].join("");
  await Promise.all([400, 600, 700].map((weight) => document.fonts.load(`${weight} 40px ${FONT}`, text))).catch(() => undefined);
  const cover = await loadCover(reading.cover);

  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = color("bg");
  ctx.fillRect(0, 0, W, H);

  // Cover on the left, at most 300×450, centred vertically.
  const box = { x: 110, w: 300, h: 450 };
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
  const x = 490;
  const maxWidth = W - x - 100;
  const titleSize = fitSize(ctx, title.main, maxWidth, [56, 48, 42], 3);
  const titleLines = wrap(ctx, title.main, maxWidth, `700 ${titleSize}px ${FONT}`, 3);
  const subLines = title.sub ? wrap(ctx, title.sub, maxWidth, `400 24px ${FONT}`, 2) : [];
  const creditLines = credits ? wrap(ctx, credits, maxWidth, `400 26px ${FONT}`, 2) : [];
  const titleLead = titleSize * 1.28;
  const blocks = [
    34, // label
    titleLines.length * titleLead,
    subLines.length ? 10 + subLines.length * 34 : 0,
    creditLines.length ? 26 + creditLines.length * 38 : 0,
    reading.publisher ? 6 + 32 : 0,
    period.range ? 44 + 1 + 30 + 40 : 0,
  ];
  let y = (H - blocks.reduce((sum, value) => sum + value, 0)) / 2;
  ctx.textBaseline = "top";

  ctx.fillStyle = color("accent");
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText(label, x, y);
  y += 34;

  ctx.fillStyle = color("ink");
  ctx.font = `700 ${titleSize}px ${FONT}`;
  for (const line of titleLines) {
    ctx.fillText(line, x, y + (titleLead - titleSize) / 2);
    y += titleLead;
  }
  if (subLines.length) {
    y += 10;
    ctx.fillStyle = color("muted");
    ctx.font = `400 24px ${FONT}`;
    for (const line of subLines) {
      ctx.fillText(line, x, y);
      y += 34;
    }
  }
  if (creditLines.length) {
    y += 26;
    ctx.fillStyle = color("ink-2");
    ctx.font = `400 26px ${FONT}`;
    for (const line of creditLines) {
      ctx.fillText(line, x, y);
      y += 38;
    }
  }
  if (reading.publisher) {
    y += 6;
    ctx.fillStyle = color("muted");
    ctx.font = `400 22px ${FONT}`;
    ctx.fillText(wrap(ctx, reading.publisher, maxWidth, ctx.font, 1)[0], x, y);
    y += 32;
  }
  if (period.range) {
    y += 44;
    ctx.fillStyle = color("line");
    ctx.fillRect(x, y, Math.min(maxWidth, 420), 1);
    y += 1 + 30;
    ctx.fillStyle = color("ink");
    ctx.font = `600 28px ${FONT}`;
    ctx.fillText(period.range, x, y);
    if (period.days) {
      const offset = ctx.measureText(period.range).width + 16;
      ctx.fillStyle = color("muted");
      ctx.font = `400 26px ${FONT}`;
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
