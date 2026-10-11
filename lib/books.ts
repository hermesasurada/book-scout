// Shared shapes, labels and small helpers for book rows on the client and in
// server components. No runtime-specific imports here.

export type Book = {
  id: number;
  isbn13: string;
  title: string;
  author: string;
  publisher: string;
  cover: string;
  aladinLink: string;
  aladinItemId?: string | null;
  pubDate?: string | null;
  category?: string | null;
  priceSales?: number | null;
  salesPoint?: number | null;
  reviewRank?: number | null;
  commentCount?: number | null;
  reviewCount?: number | null;
  createdAt?: string | null;
  checkedAt?: string | null;
  aladinStatus?: string | null;
  aladinStore?: string | null;
  aladinPrice?: number | null;
  aladinCount?: number | null;
  checkAladinLink?: string | null;
  libraryStatus?: string | null;
  libraryDueDate?: string | null;
  libraryLocation?: string | null;
  libraryLink?: string | null;
  checkError?: string | null;
};

export type SearchBook = {
  isbn13: string;
  itemId: string;
  title: string;
  author: string;
  publisher: string;
  cover: string;
  aladinLink: string;
  pubDate: string;
  priceStandard?: number | null;
  priceSales?: number | null;
  salesPoint?: number | null;
  reviewRank?: number | null;
};

export const aladinLabels: Record<string, string> = {
  in_stock: "재고 있음",
  out_of_stock: "재고 없음",
  unconfigured: "키 설정 필요",
  error: "확인 실패",
};

export const libraryLabels: Record<string, string> = {
  available: "대출 가능",
  loaned: "대출 중",
  not_found: "검색 안 됨",
  other_available: "다른 판본 · 대출 가능",
  other_loaned: "다른 판본 · 대출 중",
  other_edition: "다른 판본 있음",
  error: "확인 실패",
};

export type Tone = "good" | "warn" | "bad" | "muted";

export function statusTone(status?: string | null): Tone {
  if (status === "in_stock" || status === "available" || status === "other_available") return "good";
  if (status === "loaned" || status === "other_loaned" || status === "other_edition" || status === "unconfigured") return "warn";
  if (status === "error") return "bad";
  return "muted";
}

// A book counts as library-available/loaned whether the match is the exact
// edition or a verified different edition of the same work.
export function libraryAvailable(status?: string | null) {
  return status === "available" || status === "other_available";
}
export function libraryLoaned(status?: string | null) {
  return status === "loaned" || status === "other_loaned";
}

export function aladinStatusLabel(book: Pick<Book, "aladinStatus" | "aladinCount">) {
  if (book.aladinStatus === "in_stock" && book.aladinCount != null) return `재고 있음(${book.aladinCount.toLocaleString()}권)`;
  return aladinLabels[book.aladinStatus ?? ""] || "확인 전";
}

export function libraryStatusLabel(book: Pick<Book, "libraryStatus">) {
  return libraryLabels[book.libraryStatus ?? ""] || "확인 전";
}

// Aladin HTML-escapes ampersands in its URLs. React writes href values
// verbatim, so decode here too — rows stored before the provider fix still
// carry "&amp;".
export function cleanUrl(url?: string | null) {
  return (url || "").replace(/&amp;/g, "&");
}

// Deep link to the Bojeong library results for this title (mirrors the query
// the daily checker sends). Books without a checked availability have no
// library detail page, so only the search results are linkable.
export function libraryUrl(title: string) {
  const params = new URLSearchParams({
    searchType: "SIMPLE",
    searchCategory: "BOOK",
    searchKey: "TITLE",
    searchKeyword: title.replace(/\s*[-–—].*$/, "").trim(),
    searchLibraryArr: "NU",
  });
  return `https://lib.yongin.go.kr/bojeong/menu/14328/program/30012/plusSearchResultList.do?${params}`;
}

export function aladinStoreHref(book: Pick<Book, "aladinStatus" | "checkAladinLink" | "aladinLink">) {
  if (book.aladinStatus !== "in_stock") return "";
  return cleanUrl(book.checkAladinLink || book.aladinLink);
}

export function libraryHref(book: Pick<Book, "libraryLink" | "libraryStatus" | "title">) {
  if (book.libraryLink) return book.libraryLink;
  return book.libraryStatus === "available" ? libraryUrl(book.title) : "";
}

export function won(value?: number | null) {
  return value ? `${value.toLocaleString()}원` : "—";
}

// Discount of the 분당서현점 offline-store used copy against the sale price.
// Only in-stock books carry a store price.
export function usedDiscount(book: Pick<Book, "priceSales" | "aladinPrice">): number | null {
  if (!book.priceSales || !book.aladinPrice || book.aladinPrice >= book.priceSales) return null;
  return Math.round((1 - book.aladinPrice / book.priceSales) * 100);
}

// Broad category from Aladin's "국내도서>과학>생명과학>…" path — the segment
// after the top mall, used for the category filter.
export function bookCategory(book: Pick<Book, "category">): string {
  const parts = (book.category || "").split(">").map((part) => part.trim()).filter(Boolean);
  return parts[1] ?? parts[0] ?? "";
}

// Aladin's own rating with the two review counts, e.g. "9.8 (11,32)".
export function ratingText(book: Pick<Book, "reviewRank" | "commentCount" | "reviewCount">) {
  if (!book.reviewRank) return "";
  const counts = book.commentCount != null || book.reviewCount != null ? ` (${book.commentCount ?? 0},${book.reviewCount ?? 0})` : "";
  return `${book.reviewRank.toFixed(1)}${counts}`;
}

// SQLite CURRENT_TIMESTAMP is UTC without a zone marker.
export function parseDbTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value.endsWith("Z") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function relativeTime(value?: string | null) {
  const date = parseDbTime(value);
  if (!date) return "확인 전";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}시간 전`;
  return `${Math.floor(minutes / 1440)}일 전`;
}
