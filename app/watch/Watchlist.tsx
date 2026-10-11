"use client";
/* eslint-disable @next/next/no-img-element -- cover URLs are supplied dynamically by Aladin */

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  aladinStatusLabel,
  aladinStoreHref,
  type Book,
  bookCategory,
  cleanUrl,
  libraryAvailable,
  libraryHref,
  libraryLoaned,
  libraryStatusLabel,
  ratingText,
  relativeTime,
  statusTone,
  usedDiscount,
} from "../../lib/books";
import { Icon } from "../components/Icon";
import { onBooksChanged, toast } from "../components/Toaster";
import { leaveWatchlist, rememberWatchUrl, takeSavedScroll } from "./watchNav";

const PAGE_SIZE = 20;
// Bump the version whenever the Book shape changes, so readers are not served
// an old-shape cache for the instant before revalidation lands.
const CACHE_VERSION = 2;
const CACHE_KEY = `bookscout:books:v${CACHE_VERSION}`;
const STALE_CACHE_KEYS = ["bookscout:books", ...Array.from({ length: CACHE_VERSION - 1 }, (_, i) => `bookscout:books:v${i + 1}`)];
const VIEW_KEY = "bookscout:watch-view";

type Filter = "all" | "aladin" | "library" | "library_loaned";
type SortKey = "added" | "published" | "sales" | "rating" | "reviews" | "price" | "stock" | "discount" | "due";
type SortDirection = "asc" | "desc";
type View = "list" | "grid";

const sortLabels: Record<SortKey, string> = {
  added: "추가일",
  published: "출간일",
  sales: "판매지수",
  rating: "평점",
  reviews: "리뷰건수(합산)",
  price: "매장 가격",
  stock: "알라딘 재고 권수",
  discount: "매장 할인율",
  due: "도서관 반납일",
};

const filters: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "aladin", label: "알라딘 재고 있음" },
  { key: "library", label: "대출가능" },
  { key: "library_loaned", label: "대출중" },
];

type ListState = { filter: Filter; category: string; q: string; sort: SortKey; dir: SortDirection; page: number };
const DEFAULT_STATE: ListState = { filter: "all", category: "", q: "", sort: "added", dir: "desc", page: 1 };

// The list position lives in the URL so returning from a book page (browser
// back) lands on the same filter, sort and page.
function readUrlState(): ListState {
  const params = new URLSearchParams(window.location.search);
  const filter = params.get("f") as Filter | null;
  const sort = params.get("sort") as SortKey | null;
  const page = Number(params.get("page"));
  return {
    filter: filter && filters.some((item) => item.key === filter) ? filter : DEFAULT_STATE.filter,
    category: params.get("cat") ?? "",
    q: params.get("q") ?? "",
    sort: sort && sort in sortLabels ? sort : DEFAULT_STATE.sort,
    dir: params.get("dir") === "asc" ? "asc" : "desc",
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

function writeUrlState(state: ListState) {
  const params = new URLSearchParams();
  if (state.filter !== DEFAULT_STATE.filter) params.set("f", state.filter);
  if (state.category) params.set("cat", state.category);
  if (state.q) params.set("q", state.q);
  if (state.sort !== DEFAULT_STATE.sort) params.set("sort", state.sort);
  if (state.dir !== DEFAULT_STATE.dir) params.set("dir", state.dir);
  if (state.page > 1) params.set("page", String(state.page));
  const query = params.toString();
  const next = `${window.location.pathname}${query ? `?${query}` : ""}`;
  if (next !== `${window.location.pathname}${window.location.search}`) {
    window.history.replaceState(window.history.state, "", next);
  }
  rememberWatchUrl(next);
}

export function Watchlist() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState<number | "all" | null>(null);
  const [state, setState] = useState<ListState>(DEFAULT_STATE);
  const [view, setView] = useState<View>("list");
  const restored = useRef(false);

  // `background` is the revalidation that runs on entry: it must not report
  // failures (the reader still has the cached list in front of them) and must
  // not disturb the view unless the server actually has something new.
  const loadBooks = useCallback(async (background = false) => {
    try {
      const response = await fetch("/api/books", { cache: "no-store" });
      const data = (await response.json()) as { books?: Book[]; error?: string };
      if (!response.ok) throw new Error(data.error);
      const loaded = data.books ?? [];
      const serialized = JSON.stringify(loaded);
      // Swap the list only on a real change, so re-entering the page never
      // reshuffles what is already current.
      setBooks((current) => (JSON.stringify(current) === serialized ? current : loaded));
      try {
        window.localStorage.setItem(CACHE_KEY, serialized);
      } catch {
        // storage full or unavailable — non-fatal, just skip caching
      }
    } catch (error) {
      if (!background) toast(error instanceof Error && error.message ? error.message : "목록을 불러오지 못했습니다.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  // Restore cache, list position and view before paint; returning to the
  // page must not flash an empty or reset list.
  useLayoutEffect(() => {
    let cached: Book[] | null = null;
    let savedView: View = "list";
    try {
      for (const key of STALE_CACHE_KEYS) window.localStorage.removeItem(key);
      const raw = window.localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every((book) => book && typeof book.id === "number" && typeof book.title === "string")) cached = parsed;
      }
      if (window.localStorage.getItem(VIEW_KEY) === "grid") savedView = "grid";
    } catch {
      // ignore malformed cache or blocked storage
    }
    // Restoring external browser state (URL, storage) before the first paint.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(readUrlState());
    setView(savedView);
    if (cached) {
      setBooks(cached);
      setLoading(false);
    }
    restored.current = true;
    // Coming back from a book page: return to the same spot once the cached
    // list is on screen (after the router's own scroll-to-top).
    const savedY = cached ? takeSavedScroll(`${window.location.pathname}${window.location.search}`) : null;
    if (savedY != null) window.setTimeout(() => window.scrollTo(0, savedY), 0);
    // Always revalidate — a book added on another device would otherwise stay
    // invisible until the reader hits 목록 새로고침.
    void loadBooks(cached !== null);
  }, [loadBooks]);

  useEffect(() => {
    if (restored.current) writeUrlState(state);
  }, [state]);

  useEffect(() => onBooksChanged(() => void loadBooks()), [loadBooks]);

  const update = (patch: Partial<ListState>) => setState((current) => ({ ...current, page: 1, ...patch }));

  const counts = useMemo(
    () => ({
      all: books.length,
      aladin: books.filter((book) => book.aladinStatus === "in_stock").length,
      library: books.filter((book) => libraryAvailable(book.libraryStatus)).length,
      library_loaned: books.filter((book) => libraryLoaned(book.libraryStatus)).length,
    }),
    [books],
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    books.forEach((book) => {
      const category = bookCategory(book);
      if (category) set.add(category);
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [books]);

  const filteredBooks = useMemo(() => {
    const { filter, category, q, sort, dir } = state;
    const needle = q.trim().toLowerCase();
    const matched = books.filter((book) => {
      if (filter === "aladin" && book.aladinStatus !== "in_stock") return false;
      if (filter === "library" && !libraryAvailable(book.libraryStatus)) return false;
      if (filter === "library_loaned" && !libraryLoaned(book.libraryStatus)) return false;
      if (category && bookCategory(book) !== category) return false;
      if (needle) {
        const haystack = `${book.title} ${book.author} ${book.publisher} ${book.isbn13}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
    const asc = dir === "asc";
    // The API returns newest additions first, including the ID tie-breaker.
    if (sort === "added" || (sort === "stock" && filter !== "aladin")) return asc ? [...matched].reverse() : matched;

    // In both directions, entries missing the sort value sink to the bottom.
    const byNum = (value: (book: Book) => number | null) => (a: Book, b: Book) => {
      const va = value(a);
      const vb = value(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return asc ? va - vb : vb - va;
    };
    const byStr = (value: (book: Book) => string) => (a: Book, b: Book) => {
      const va = value(a);
      const vb = value(b);
      if (!va && !vb) return 0;
      if (!va) return 1;
      if (!vb) return -1;
      return asc ? va.localeCompare(vb) : vb.localeCompare(va);
    };
    const comparators: Record<Exclude<SortKey, "added">, (a: Book, b: Book) => number> = {
      published: byStr((book) => book.pubDate || ""),
      sales: byNum((book) => book.salesPoint ?? null),
      rating: byNum((book) => book.reviewRank ?? null),
      reviews: byNum((book) => (book.commentCount == null && book.reviewCount == null ? null : (book.commentCount ?? 0) + (book.reviewCount ?? 0))),
      price: byNum((book) => (book.aladinStatus === "in_stock" && book.aladinPrice && book.aladinPrice > 0 ? book.aladinPrice : null)),
      stock: byNum((book) => book.aladinCount ?? null),
      discount: byNum((book) => usedDiscount(book)),
      due: byStr((book) => book.libraryDueDate || ""),
    };
    return [...matched].sort(comparators[sort]);
  }, [books, state]);

  const pageCount = Math.max(1, Math.ceil(filteredBooks.length / PAGE_SIZE));
  const currentPage = Math.min(state.page, pageCount);
  const visibleBooks = filteredBooks.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const latestCheck = books.reduce<string | null>((latest, book) => (book.checkedAt && (!latest || book.checkedAt > latest) ? book.checkedAt : latest), null);

  function changeFilter(next: Filter) {
    // Stock count only means something among in-stock books.
    update({ filter: next, ...(next !== "aladin" && state.sort === "stock" ? { sort: "added" as SortKey } : {}) });
  }

  function goToPage(next: number) {
    setState((current) => ({ ...current, page: next }));
    window.scrollTo({ top: 0 });
  }

  function changeView(next: View) {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // non-fatal
    }
  }

  async function removeBook(book: Book) {
    if (!window.confirm(`‘${book.title}’을 관심도서에서 삭제할까요?`)) return;
    const response = await fetch(`/api/books?id=${book.id}`, { method: "DELETE" });
    if (!response.ok) {
      toast("삭제하지 못했습니다.", "error");
      return;
    }
    setBooks((current) => {
      const next = current.filter((item) => item.id !== book.id);
      try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(next));
      } catch {
        // non-fatal
      }
      return next;
    });
    toast("관심도서에서 삭제했습니다.");
  }

  async function runCheck(bookId?: number) {
    setChecking(bookId ?? "all");
    try {
      const response = await fetch("/api/checks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bookId ? { bookId } : {}),
      });
      const data = (await response.json()) as { checked?: number; error?: string };
      if (!response.ok) throw new Error(data.error);
      toast(`${data.checked ?? 0}권의 상태를 새로 확인했습니다.`);
      await loadBooks();
    } catch (error) {
      toast(error instanceof Error && error.message ? error.message : "상태 확인에 실패했습니다.", "error");
    } finally {
      setChecking(null);
    }
  }

  const emptyMessage = !books.length
    ? "위 검색창에서 책을 찾아 관심도서로 담아 보세요."
    : state.q
      ? "검색과 일치하는 책이 없습니다."
      : state.filter === "aladin"
        ? "알라딘에 재고가 있는 책이 없습니다."
        : state.filter === "library"
          ? "도서관에서 대출 가능한 책이 없습니다."
          : state.filter === "library_loaned"
            ? "도서관에서 대출 중인 책이 없습니다."
            : "조건에 맞는 책이 없습니다.";

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">관심도서</h1>
          <p className="mt-0.5 text-[12.5px] text-muted">마지막 확인 {relativeTime(latestCheck)}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="btn" onClick={() => void loadBooks()} title="서버에서 목록 다시 불러오기">
            <Icon name="refresh" />
            <span className="hidden sm:inline">목록 새로고침</span>
          </button>
          <button className="btn btn-primary" onClick={() => void runCheck()} disabled={checking !== null || books.length === 0}>
            <Icon name="refresh" className={checking === "all" ? "spin" : undefined} />
            {checking === "all" ? "확인 중…" : "전체 지금 확인"}
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-2.5">
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
          <div className="seg" role="group" aria-label="관심도서 필터">
            {filters.map((item) => (
              <button key={item.key} aria-pressed={state.filter === item.key} onClick={() => changeFilter(item.key)}>
                {item.label}
                <span className="count">{counts[item.key]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-40 flex-1 sm:max-w-64">
            <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
            <label className="sr-only-x" htmlFor="list-search">목록에서 검색</label>
            <input
              id="list-search"
              className="field w-full pl-8 pr-7"
              value={state.q}
              onChange={(event) => update({ q: event.target.value })}
              placeholder="목록에서 검색"
            />
            {state.q && (
              <button className="icon-btn absolute right-0.5 top-1/2 size-7 -translate-y-1/2" onClick={() => update({ q: "" })} aria-label="검색어 지우기">
                <Icon name="x" className="size-3.5" />
              </button>
            )}
          </div>
          {categories.length > 0 && (
            <select className="field" value={state.category} onChange={(event) => update({ category: event.target.value })} aria-label="분류">
              <option value="">전체 분류</option>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          )}
          <div className="flex items-center">
            <select
              className="field rounded-r-none"
              value={state.sort}
              onChange={(event) => update({ sort: event.target.value as SortKey })}
              aria-label="정렬 기준"
            >
              {(Object.keys(sortLabels) as SortKey[])
                .filter((key) => key !== "stock" || state.filter === "aladin")
                .map((key) => (
                  <option key={key} value={key}>{sortLabels[key]}</option>
                ))}
            </select>
            <button
              className="field -ml-px grid w-8 place-items-center rounded-l-none px-0 hover:bg-sunken"
              onClick={() => update({ dir: state.dir === "asc" ? "desc" : "asc" })}
              aria-label={state.dir === "asc" ? "오름차순 (눌러서 내림차순)" : "내림차순 (눌러서 오름차순)"}
              title={state.dir === "asc" ? "오름차순" : "내림차순"}
            >
              <Icon name={state.dir === "asc" ? "arrowUp" : "arrowDown"} className="size-3.5" />
            </button>
          </div>
          <div className="seg ml-auto" role="group" aria-label="보기 방식">
            <button aria-pressed={view === "list"} onClick={() => changeView("list")} aria-label="목록 보기" title="목록 보기">
              <Icon name="list" className="size-4" />
            </button>
            <button aria-pressed={view === "grid"} onClick={() => changeView("grid")} aria-label="표지 보기" title="표지 보기">
              <Icon name="grid" className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <ul className="card divide-y divide-line" aria-label="불러오는 중">
          {Array.from({ length: 6 }, (_, index) => (
            <li key={index} className="flex items-center gap-4 px-4 py-3">
              <div className="h-16 w-11 rounded bg-sunken pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-2/5 rounded bg-sunken pulse" />
                <div className="h-3 w-1/4 rounded bg-sunken pulse" />
              </div>
            </li>
          ))}
        </ul>
      ) : visibleBooks.length === 0 ? (
        <div className="card grid min-h-56 place-items-center p-8 text-center">
          <div>
            <Icon name="bookmark" className="mx-auto size-6 text-faint" />
            <p className="mt-3 text-[14px] font-semibold">{emptyMessage}</p>
            {books.length > 0 && <p className="mt-1 text-[12.5px] text-muted">매일 확인해서 변화가 생기면 여기에 나타납니다.</p>}
          </div>
        </div>
      ) : view === "list" ? (
        <ul className="card divide-y divide-line overflow-hidden">
          {visibleBooks.map((book) => (
            <BookRow key={book.id} book={book} checking={checking} onCheck={runCheck} onRemove={removeBook} />
          ))}
        </ul>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {visibleBooks.map((book) => (
            <BookTile key={book.id} book={book} />
          ))}
        </ul>
      )}

      {!loading && pageCount > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-3" aria-label="페이지 이동">
          <button className="icon-btn border border-line bg-surface" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="이전 페이지">
            <Icon name="chevronLeft" />
          </button>
          <span className="tabular text-[13px]">
            {currentPage} / {pageCount}
            <span className="ml-2 text-muted">{filteredBooks.length}권</span>
          </span>
          <button className="icon-btn border border-line bg-surface" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= pageCount} aria-label="다음 페이지">
            <Icon name="chevronRight" />
          </button>
        </nav>
      )}
    </div>
  );
}

function Cover({ book, className }: { book: Book; className: string }) {
  const image = book.cover ? <img src={book.cover} alt="" loading="lazy" /> : null;
  // The cover opens the Aladin product page (user decision); the title opens
  // the book page inside this site.
  return book.aladinLink ? (
    <a className={`cover block ${className}`} href={cleanUrl(book.aladinLink)} target="_blank" rel="noreferrer" aria-label={`${book.title} 알라딘 상품 페이지`}>
      {image}
    </a>
  ) : (
    <div className={`cover ${className}`}>{image}</div>
  );
}

function AladinStatus({ book }: { book: Book }) {
  const href = aladinStoreHref(book);
  const discount = usedDiscount(book);
  const label = aladinStatusLabel(book);
  const tone = statusTone(book.aladinStatus);
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-faint">알라딘</p>
      {href ? (
        <a className={`status ${tone}`} href={href} target="_blank" rel="noreferrer">{label}</a>
      ) : (
        <span className={`status ${tone}`}>{label}</span>
      )}
      {book.aladinPrice ? (
        <p className="tabular truncate text-[11.5px] text-muted">
          {book.aladinPrice.toLocaleString()}원부터
          {discount != null && <span className="ml-1 font-semibold text-accent">-{discount}%</span>}
        </p>
      ) : null}
    </div>
  );
}

function LibraryStatus({ book }: { book: Book }) {
  const href = libraryHref(book);
  const label = libraryStatusLabel(book);
  const tone = statusTone(book.libraryStatus);
  const note = book.libraryDueDate ? `${book.libraryDueDate} 반납` : book.libraryLocation ? book.libraryLocation.replace("[보정]", "").trim() : "";
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-faint">도서관</p>
      {href ? (
        <a className={`status ${tone}`} href={href} target="_blank" rel="noreferrer">{label}</a>
      ) : (
        <span className={`status ${tone}`}>{label}</span>
      )}
      {note && <p className="tabular truncate text-[11.5px] text-muted">{note}</p>}
    </div>
  );
}

function BookRow({
  book,
  checking,
  onCheck,
  onRemove,
}: {
  book: Book;
  checking: number | "all" | null;
  onCheck: (id: number) => Promise<void>;
  onRemove: (book: Book) => Promise<void>;
}) {
  const category = bookCategory(book);
  const rating = ratingText(book);
  return (
    <li className="group relative grid grid-cols-[44px_minmax(0,1fr)] gap-x-4 gap-y-2.5 px-4 py-3 transition-colors hover:bg-sunken/40 md:grid-cols-[44px_minmax(0,1fr)_minmax(0,280px)_68px] md:items-center">
      <Cover book={book} className="h-16 w-11" />
      <div className="min-w-0 pr-16 md:pr-0">
        <Link href={`/books/${book.id}`} onClick={leaveWatchlist} className="block truncate text-[14.5px] font-semibold hover:underline hover:underline-offset-4">
          {book.title}
        </Link>
        <p className="truncate text-[12.5px] text-muted">
          {[book.author, book.publisher, book.pubDate?.slice(0, 4)].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-muted">
          {category && <span className="chip">{category}</span>}
          {rating && (
            <span className="tabular inline-flex items-center gap-1" title="알라딘 평점 (100자평, 리뷰 편수)">
              <Icon name="star" className="size-3 text-warn" />
              {rating}
            </span>
          )}
          {book.salesPoint ? <span className="tabular">판매지수 {book.salesPoint.toLocaleString()}</span> : null}
        </div>
      </div>
      <div className="col-span-2 grid grid-cols-2 gap-3 pl-[60px] md:col-span-1 md:pl-0">
        <AladinStatus book={book} />
        <LibraryStatus book={book} />
      </div>
      <div className="absolute right-2 top-2.5 flex md:static md:justify-end md:opacity-0 md:transition-opacity md:group-focus-within:opacity-100 md:group-hover:opacity-100">
        <button
          className="icon-btn"
          onClick={() => void onCheck(book.id)}
          disabled={checking !== null}
          aria-label={`${book.title} 지금 확인`}
          title="지금 확인"
        >
          <Icon name="refresh" className={checking === book.id ? "spin text-accent" : undefined} />
        </button>
        <button className="icon-btn danger" onClick={() => void onRemove(book)} aria-label={`${book.title} 삭제`} title="관심도서에서 삭제">
          <Icon name="trash" />
        </button>
      </div>
    </li>
  );
}

function BookTile({ book }: { book: Book }) {
  const aladinTone = statusTone(book.aladinStatus);
  const libraryTone = statusTone(book.libraryStatus);
  return (
    <li className="min-w-0">
      <Cover book={book} className="aspect-[2/3] w-full rounded-md" />
      <Link href={`/books/${book.id}`} onClick={leaveWatchlist} className="mt-2.5 line-clamp-2 text-[13.5px] font-semibold leading-snug hover:underline hover:underline-offset-4">
        {book.title}
      </Link>
      <p className="mt-0.5 truncate text-[12px] text-muted">{book.author}</p>
      <div className="mt-1.5 flex flex-col gap-0.5">
        <span className={`status ${aladinTone} text-[11.5px]`}>알라딘 {aladinStatusLabel(book)}</span>
        <span className={`status ${libraryTone} text-[11.5px]`}>도서관 {libraryStatusLabel(book)}</span>
      </div>
    </li>
  );
}
