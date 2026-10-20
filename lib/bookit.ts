// 북적북적 export (bookit_YYYYMMDD_HHMMSS.csv) → reading records.
// Columns: 인덱스, 제목, 저자, 출판사, 독서상태, 생성일, 시작일, 읽은 날짜, 중단일, 메모1
// There is no ISBN, so books are matched to Aladin editions separately.

export type BookitStatus = "want" | "reading" | "finished" | "stopped";

export type BookitReread = { round: number; finishedAt: string };

export type BookitRecord = {
  /** Stable across re-exports: 생성일 + title (the 인덱스 column is just a row number). */
  key: string;
  title: string;
  author: string;
  publisher: string;
  status: BookitStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  stoppedAt: string | null;
  /** 북적북적 parks books read before records began on 2020-12-31. */
  datesUnknown: boolean;
  memo: string;
  /** Re-reads noted in the memo ("24.6.18 2회독"). */
  rereads: BookitReread[];
};

const STATUS: Record<string, BookitStatus> = {
  "읽은 책": "finished",
  "읽고 있는 책": "reading",
  "중단한 책": "stopped",
  "읽고 싶은 책": "want",
};

// 북적북적 records read before 2021 carry 2020-12-31 as both dates; they are
// kept as finished in 2020, year only (user decision).
const PLACEHOLDER_DATE = "2020-12-31";

// RFC 4180: quoted fields may contain commas, doubled quotes and newlines.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const dateOrNull = (value: string | undefined) => (value && isDate(value.trim()) ? value.trim() : null);

export function titleKey(title: string) {
  return title.replace(/\s+/g, "").toLowerCase();
}

// "24.6.18 2회독", "2회차 24.1.28 완료", "24. 11. 10일 2회차독"
export function parseRereads(memo: string): BookitReread[] {
  const found: BookitReread[] = [];
  for (const line of memo.split(/\n/)) {
    const date = line.match(/(\d{2,4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})/);
    const round = line.match(/(\d+)\s*회(?:차|독)/);
    if (!date || !round) continue;
    const year = date[1].length === 2 ? `20${date[1]}` : date[1];
    const finishedAt = `${year}-${date[2].padStart(2, "0")}-${date[3].padStart(2, "0")}`;
    if (isDate(finishedAt) && Number(round[1]) >= 2) found.push({ round: Number(round[1]), finishedAt });
  }
  return found;
}

export function parseBookit(text: string): BookitRecord[] {
  const rows = parseCsv(text);
  const header = rows[0]?.map((cell) => cell.trim()) ?? [];
  const col = (name: string) => header.indexOf(name);
  const required = ["제목", "독서상태"];
  if (required.some((name) => col(name) < 0)) {
    throw new Error("북적북적 내보내기 파일 형식이 아닙니다 (제목·독서상태 열이 없음).");
  }
  const get = (cells: string[], name: string) => (col(name) >= 0 ? (cells[col(name)] ?? "").trim() : "");

  return rows.slice(1).flatMap((cells) => {
    const title = get(cells, "제목");
    const status = STATUS[get(cells, "독서상태")];
    if (!title || !status) return [];
    const createdAt = get(cells, "생성일");
    let startedAt = dateOrNull(get(cells, "시작일"));
    let finishedAt = dateOrNull(get(cells, "읽은 날짜"));
    if (startedAt === PLACEHOLDER_DATE && finishedAt === PLACEHOLDER_DATE) {
      startedAt = null;
      finishedAt = PLACEHOLDER_DATE.slice(0, 4);
    }
    const memo = get(cells, "메모1");
    return [
      {
        key: `${createdAt}|${titleKey(title)}`,
        title,
        author: get(cells, "저자"),
        publisher: get(cells, "출판사"),
        status,
        createdAt,
        startedAt,
        finishedAt,
        stoppedAt: dateOrNull(get(cells, "중단일")),
        datesUnknown: false,
        memo,
        rereads: parseRereads(memo),
      },
    ];
  });
}
