// Comparators shared by the 관심도서 and 내 서재 lists. In both directions,
// entries missing the sort value sink to the bottom.

export type SortDirection = "asc" | "desc";

export function byNumber<T>(value: (item: T) => number | null | undefined, dir: SortDirection) {
  return (a: T, b: T) => {
    const va = value(a);
    const vb = value(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return dir === "asc" ? va - vb : vb - va;
  };
}

export function byText<T>(value: (item: T) => string | null | undefined, dir: SortDirection) {
  return (a: T, b: T) => {
    const va = value(a);
    const vb = value(b);
    if (!va && !vb) return 0;
    if (!va) return 1;
    if (!vb) return -1;
    return dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
  };
}

/** 리뷰건수 = 100자평 + 리뷰; null when Aladin gave neither. */
export function reviewTotal(book: { commentCount?: number | null; reviewCount?: number | null }) {
  return book.commentCount == null && book.reviewCount == null ? null : (book.commentCount ?? 0) + (book.reviewCount ?? 0);
}
