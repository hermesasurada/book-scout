"use client";
/* eslint-disable @next/next/no-img-element -- cover URLs are supplied dynamically by Aladin */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Book = {
  id: number;
  isbn13: string;
  title: string;
  author: string;
  publisher: string;
  cover: string;
  aladinLink: string;
  pubDate?: string | null;
  category?: string | null;
  priceSales?: number | null;
  salesPoint?: number | null;
  reviewRank?: number | null;
  usedMinPrice?: number | null;
  checkedAt?: string | null;
  aladinStatus?: string | null;
  aladinStore?: string | null;
  aladinPrice?: number | null;
  checkAladinLink?: string | null;
  libraryStatus?: string | null;
  libraryDueDate?: string | null;
  libraryLocation?: string | null;
  libraryLink?: string | null;
  checkError?: string | null;
};

type SearchBook = {
  isbn13: string;
  title: string;
  author: string;
  publisher: string;
  cover: string;
  aladinLink: string;
  pubDate: string;
};

type UsedTier = { count: number; minPrice: number; link: string };

type AladinDetail = {
  title: string;
  subTitle: string;
  originalTitle: string;
  author: string;
  publisher: string;
  pubDate: string;
  isbn13: string;
  isbn: string;
  categoryName: string;
  description: string;
  priceStandard: number | null;
  priceSales: number | null;
  mileage: number | null;
  reviewRank: number | null;
  page: number | null;
  packing: string;
  cover: string;
  link: string;
  usedAladin: UsedTier | null;
  usedUser: UsedTier | null;
  usedSpace: UsedTier | null;
};

const aladinLabels: Record<string, string> = {
  in_stock: "재고 있음",
  out_of_stock: "재고 없음",
  unconfigured: "키 설정 필요",
  error: "확인 실패",
};

const libraryLabels: Record<string, string> = {
  available: "대출 가능",
  loaned: "대출 중",
  not_found: "검색 안 됨",
  other_available: "다른 판본 · 대출 가능",
  other_loaned: "다른 판본 · 대출 중",
  other_edition: "다른 판본 있음",
  error: "확인 실패",
};

function statusTone(status?: string | null) {
  if (status === "in_stock" || status === "available" || status === "other_available") return "good";
  if (status === "loaned" || status === "other_loaned" || status === "other_edition" || status === "unconfigured") return "warn";
  if (status === "error") return "error";
  return "muted";
}

// A book counts as library-available/loaned whether the match is the exact
// edition or a verified different edition of the same work.
function libraryAvailable(status?: string | null) {
  return status === "available" || status === "other_available";
}
function libraryLoaned(status?: string | null) {
  return status === "loaned" || status === "other_loaned";
}

function relativeTime(value?: string | null) {
  if (!value) return "아직 확인 전";
  const date = new Date(value.endsWith("Z") ? value : `${value.replace(" ", "T")}Z`);
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}시간 전`;
  return `${Math.floor(minutes / 1440)}일 전`;
}

// Deep link to the Bojeong library results for this title (mirrors the query
// the daily checker sends). Books without a checked availability have no
// library detail page, so only the search results are linkable.
function libraryUrl(title: string) {
  const params = new URLSearchParams({
    searchType: "SIMPLE",
    searchCategory: "BOOK",
    searchKey: "TITLE",
    searchKeyword: title.replace(/\s*[-–—].*$/, "").trim(),
    searchLibraryArr: "NU",
  });
  return `https://lib.yongin.go.kr/bojeong/menu/14328/program/30012/plusSearchResultList.do?${params}`;
}

function won(value: number | null) {
  return value ? `${value.toLocaleString()}원` : "—";
}

function usedTierText(tier: UsedTier | null) {
  return tier ? `${tier.count}부 · ${tier.minPrice.toLocaleString()}원부터` : "없음";
}

function detailRows(d: AladinDetail): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ["저자", d.author],
    ["출판사", d.publisher],
    ["출간일", d.pubDate],
    ["ISBN13", d.isbn13],
    ["정가", won(d.priceStandard)],
    ["판매가", d.priceSales ? `${d.priceSales.toLocaleString()}원${d.mileage ? ` (마일리지 ${d.mileage.toLocaleString()})` : ""}` : "—"],
  ];
  if (d.page) rows.push(["쪽수", `${d.page}쪽`]);
  if (d.packing) rows.push(["사양", d.packing]);
  if (d.originalTitle) rows.push(["원제", d.originalTitle]);
  if (d.reviewRank != null) rows.push(["알라딘 평점", `${(d.reviewRank / 2).toFixed(1)} / 5`]);
  rows.push(["알라딘 중고", usedTierText(d.usedAladin)]);
  rows.push(["회원 중고", usedTierText(d.usedUser)]);
  rows.push(["중고매장", usedTierText(d.usedSpace)]);
  return rows.filter(([, value]) => value && value.trim());
}

const PAGE_SIZE = 20;

type SortKey =
  | "added"
  | "pubDesc"
  | "pubAsc"
  | "salesDesc"
  | "ratingDesc"
  | "discountDesc"
  | "dueAsc";

const sortLabels: Record<SortKey, string> = {
  added: "추가한 순",
  pubDesc: "출간일 최신순",
  pubAsc: "출간일 오래된순",
  salesDesc: "판매지수 높은순",
  ratingDesc: "평점 높은순",
  discountDesc: "중고 할인율 높은순",
  dueAsc: "도서관 반납일 빠른순",
};

// Discount of the cheapest used copy against the current sale price.
function usedDiscount(book: Book): number | null {
  if (!book.priceSales || !book.usedMinPrice || book.usedMinPrice >= book.priceSales) return null;
  return Math.round((1 - book.usedMinPrice / book.priceSales) * 100);
}

// Broad category from Aladin's "국내도서>과학>생명과학>…" path — the segment
// after the top mall, used for the category filter.
function bookCategory(book: Book): string {
  const parts = (book.category || "").split(">").map((part) => part.trim()).filter(Boolean);
  return parts[1] ?? parts[0] ?? "";
}

export function BookScout() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState<number | "all" | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchBook[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<"all" | "aladin" | "library" | "library_loaned">("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [listQuery, setListQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("added");
  const [page, setPage] = useState(1);
  const [showSetup, setShowSetup] = useState(false);
  const [detailBook, setDetailBook] = useState<Book | null>(null);
  const [detail, setDetail] = useState<AladinDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const loadBooks = useCallback(async () => {
    try {
      const response = await fetch("/api/books", { cache: "no-store" });
      const data = (await response.json()) as { books?: Book[]; error?: string };
      if (!response.ok) throw new Error(data.error);
      setBooks(data.books ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadBooks(), 0);
    return () => window.clearTimeout(timer);
  }, [loadBooks]);

  useEffect(() => {
    if (!detailBook) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetailBook(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailBook]);

  const counts = useMemo(
    () => ({
      total: books.length,
      aladin: books.filter((book) => book.aladinStatus === "in_stock").length,
      library: books.filter((book) => libraryAvailable(book.libraryStatus)).length,
      libraryLoaned: books.filter((book) => libraryLoaned(book.libraryStatus)).length,
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
    const needle = listQuery.trim().toLowerCase();
    const matched = books.filter((book) => {
      if (filter === "aladin" && book.aladinStatus !== "in_stock") return false;
      if (filter === "library" && !libraryAvailable(book.libraryStatus)) return false;
      if (filter === "library_loaned" && !libraryLoaned(book.libraryStatus)) return false;
      if (categoryFilter && bookCategory(book) !== categoryFilter) return false;
      if (needle) {
        const haystack = `${book.title} ${book.author} ${book.publisher} ${book.isbn13}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
    if (sort === "added") return matched;

    // In every mode, entries missing the sort value sink to the bottom.
    const byNum = (value: (book: Book) => number | null) => (a: Book, b: Book) => {
      const va = value(a);
      const vb = value(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return vb - va;
    };
    const byStr = (value: (book: Book) => string, asc: boolean) => (a: Book, b: Book) => {
      const va = value(a);
      const vb = value(b);
      if (!va && !vb) return 0;
      if (!va) return 1;
      if (!vb) return -1;
      return asc ? va.localeCompare(vb) : vb.localeCompare(va);
    };
    const comparators: Record<Exclude<SortKey, "added">, (a: Book, b: Book) => number> = {
      pubDesc: byStr((book) => book.pubDate || "", false),
      pubAsc: byStr((book) => book.pubDate || "", true),
      salesDesc: byNum((book) => book.salesPoint ?? null),
      ratingDesc: byNum((book) => book.reviewRank ?? null),
      discountDesc: byNum((book) => usedDiscount(book)),
      dueAsc: byStr((book) => book.libraryDueDate || "", true),
    };
    return [...matched].sort(comparators[sort]);
  }, [books, filter, categoryFilter, sort, listQuery]);

  const pageCount = Math.max(1, Math.ceil(filteredBooks.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleBooks = filteredBooks.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  async function search(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    setMessage("");
    try {
      const response = await fetch(`/api/aladin/search?q=${encodeURIComponent(query.trim())}`);
      const data = (await response.json()) as { books?: SearchBook[]; error?: string; code?: string };
      if (!response.ok) {
        if (data.code === "ALADIN_KEY_MISSING") setShowSetup(true);
        throw new Error(data.error);
      }
      setResults(data.books ?? []);
      if (!data.books?.length) setMessage("알라딘에서 검색 결과를 찾지 못했습니다.");
    } catch (error) {
      setResults([]);
      setMessage(error instanceof Error ? error.message : "검색하지 못했습니다.");
    } finally {
      setSearching(false);
    }
  }

  async function addBook(book: SearchBook) {
    const response = await fetch("/api/books", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(book),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(data.error ?? "저장하지 못했습니다.");
      return;
    }
    setMessage(`‘${book.title}’을 관심도서에 담았습니다.`);
    setResults((current) => current.filter((item) => item.isbn13 !== book.isbn13));
    await loadBooks();
  }

  async function removeBook(book: Book) {
    if (!window.confirm(`‘${book.title}’을 관심도서에서 삭제할까요?`)) return;
    const response = await fetch(`/api/books?id=${book.id}`, { method: "DELETE" });
    if (response.ok) {
      setBooks((current) => current.filter((item) => item.id !== book.id));
      setMessage("관심도서에서 삭제했습니다.");
    }
  }

  async function runCheck(bookId?: number) {
    setChecking(bookId ?? "all");
    setMessage("");
    try {
      const response = await fetch("/api/checks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bookId ? { bookId } : {}),
      });
      const data = (await response.json()) as { checked?: number; error?: string };
      if (!response.ok) throw new Error(data.error);
      setMessage(`${data.checked ?? 0}권의 상태를 새로 확인했습니다.`);
      await loadBooks();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "상태 확인에 실패했습니다.");
    } finally {
      setChecking(null);
    }
  }

  async function openDetail(book: Book) {
    setDetailBook(book);
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/aladin/item?isbn=${book.isbn13}`);
      const data = (await response.json()) as { detail?: AladinDetail; error?: string };
      if (!response.ok || !data.detail) throw new Error(data.error ?? "정보를 불러오지 못했습니다.");
      setDetail(data.detail);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "정보를 불러오지 못했습니다.");
    } finally {
      setDetailLoading(false);
    }
  }

  const latest = books.find((book) => book.checkedAt)?.checkedAt;

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="책갈피 홈">
          <span className="brandMark">책</span>
          <span>책갈피</span>
        </a>
        <nav aria-label="주요 메뉴">
          <a className="active" href="#books">관심도서</a>
          <button className="navButton" onClick={() => setShowSetup((value) => !value)}>설정</button>
        </nav>
        <button className="checkAll" onClick={() => void runCheck()} disabled={checking !== null || books.length === 0}>
          <span aria-hidden="true">↻</span>{checking === "all" ? "확인 중…" : "전체 지금 확인"}
        </button>
      </header>

      <section className="hero" id="top">
        <div className="heroCopy">
          <p className="eyebrow">MY READING WATCHLIST</p>
          <h1>기다리던 책을 <em>놓치지 않도록.</em></h1>
          <p className="heroLead">알라딘과 도서관을 매일 살펴 책을 만날 순간을 알려드려요.</p>
        </div>
        <div className="summary" aria-label="관심도서 요약">
          <div><strong>{counts.total}</strong><span>관심도서</span></div>
          <div><strong className="coral">{counts.aladin}</strong><span>중고 재고</span></div>
          <div><strong className="green">{counts.library}</strong><span>대출 가능</span></div>
          <p><span className="pulse" /> 마지막 확인 · {relativeTime(latest)}</p>
        </div>
      </section>

      <section className="searchSection" aria-labelledby="search-title">
        <div>
          <span className="sectionNumber">01</span>
          <h2 id="search-title">관심도서 추가</h2>
          <p>알라딘의 도서 정보로 정확하게 저장합니다.</p>
        </div>
        <form className="searchForm" onSubmit={search}>
          <span aria-hidden="true">⌕</span>
          <label className="srOnly" htmlFor="book-query">도서명, 저자 또는 ISBN</label>
          <input id="book-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="도서명, 저자 또는 ISBN을 입력하세요" />
          <button disabled={searching || query.trim().length < 2}>{searching ? "검색 중…" : "알라딘에서 찾기"}</button>
        </form>
      </section>

      {results.length > 0 && (
        <section className="searchResults" aria-label="알라딘 검색 결과">
          {results.map((book) => (
            <article key={book.isbn13}>
              {book.cover ? <img src={book.cover} alt="" /> : <div className="coverFallback">BOOK</div>}
              <div><h3>{book.title}</h3><p>{book.author}</p><small>{book.publisher} · {book.pubDate}</small></div>
              <button onClick={() => void addBook(book)}>+ 관심도서</button>
            </article>
          ))}
        </section>
      )}

      {message && <div className="toast" role="status"><span>i</span>{message}<button onClick={() => setMessage("")} aria-label="알림 닫기">×</button></div>}

      {showSetup && (
        <aside className="setupPanel" aria-label="초기 설정 안내">
          <button className="closeSetup" onClick={() => setShowSetup(false)} aria-label="설정 안내 닫기">×</button>
          <p className="eyebrow">ONE-TIME SETUP</p>
          <h2>알라딘 API 키 연결</h2>
          <p>프로젝트의 <code>.dev.vars</code> 파일에 <code>ALADIN_TTB_KEY</code>를 넣으면 검색과 알라딘 재고 확인이 활성화됩니다.</p>
          <a href="https://www.aladin.co.kr/ttb/wblog_manage.aspx" target="_blank" rel="noreferrer">TTB Key 발급 페이지 열기 ↗</a>
          <div className="setupFacts"><span>중고 <b>알라딘</b></span><span>대출 <b>도서관</b></span><span>자동 확인 <b>매일 08:00</b></span></div>
        </aside>
      )}

      <section className="booksSection" id="books" aria-labelledby="books-title">
        <div className="sectionHead">
          <div><span className="sectionNumber">02</span><h2 id="books-title">나의 관심도서</h2></div>
          <div className="sectionControls">
            <div className="listSearch">
              <span aria-hidden="true">⌕</span>
              <label className="srOnly" htmlFor="list-search">관심도서 검색</label>
              <input
                id="list-search"
                value={listQuery}
                onChange={(event) => { setListQuery(event.target.value); setPage(1); }}
                placeholder="목록에서 검색"
              />
              {listQuery && <button onClick={() => { setListQuery(""); setPage(1); }} aria-label="검색어 지우기">×</button>}
            </div>
            <div className="filters" role="group" aria-label="관심도서 필터">
              <button className={filter === "all" ? "selected" : ""} onClick={() => { setFilter("all"); setPage(1); }}>전체 {counts.total}</button>
              <button className={filter === "aladin" ? "selected coral" : ""} onClick={() => { setFilter("aladin"); setPage(1); }}>알라딘 재고 {counts.aladin}</button>
              <button className={filter === "library" ? "selected good" : ""} onClick={() => { setFilter("library"); setPage(1); }}>대출가능 {counts.library}</button>
              <button className={filter === "library_loaned" ? "selected warn" : ""} onClick={() => { setFilter("library_loaned"); setPage(1); }}>대출중 {counts.libraryLoaned}</button>
            </div>
            {categories.length > 0 && (
              <label className="sortSelect">
                <span className="srOnly">분류</span>
                <select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(1); }}>
                  <option value="">전체 분류</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="sortSelect">
              <span className="srOnly">정렬 기준</span>
              <select value={sort} onChange={(event) => { setSort(event.target.value as SortKey); setPage(1); }}>
                {(Object.keys(sortLabels) as SortKey[]).map((key) => (
                  <option key={key} value={key}>{sortLabels[key]}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {loading ? (
          <div className="emptyState"><span className="loadingDot" />관심도서를 불러오는 중입니다.</div>
        ) : visibleBooks.length === 0 ? (
          <div className="bookGrid"><div className="emptyState">
            <span className="emptyBook">＋</span>
            <h3>{!books.length ? "첫 관심도서를 담아보세요." : listQuery ? "검색과 일치하는 책이 없어요." : filter === "aladin" ? "알라딘에 재고가 있는 책이 없어요." : filter === "library" ? "도서관에서 대출 가능한 책이 없어요." : filter === "library_loaned" ? "도서관에서 대출 중인 책이 없어요." : "관심도서가 없습니다."}</h3>
            <p>{!books.length ? "위 검색창에서 도서명이나 ISBN으로 찾을 수 있습니다." : listQuery ? "다른 검색어로 시도해 보세요." : "매일 확인해서 변화가 생기면 이곳에 표시합니다."}</p>
          </div></div>
        ) : (
          <div className="bookGrid">
            {visibleBooks.map((book) => (
              <article className="bookCard" key={book.id}>
                <div className="cardTools">
                  <button className="cardInfo" onClick={() => void openDetail(book)} aria-label={`${book.title} 상세 정보`}>ⓘ</button>
                  <button className="cardDelete" onClick={() => void removeBook(book)} aria-label={`${book.title} 삭제`}>×</button>
                </div>
                <div className="bookCover">
                  {book.cover ? <img src={book.cover} alt={`${book.title} 표지`} /> : <span>BOOK</span>}
                </div>
                <div className="bookMain">
                  <div className="bookMeta">
                    <small>ISBN {book.isbn13}</small>
                    <h3>{book.title}</h3>
                    <p>{book.author}{book.publisher ? ` · ${book.publisher}` : ""}{book.pubDate ? ` · ${book.pubDate.slice(0, 7)}` : ""}</p>
                    <p className="bookMetrics">
                      {bookCategory(book) ? <span className="cat">{bookCategory(book)}</span> : null}
                      {book.reviewRank ? <span>★ {(book.reviewRank / 2).toFixed(1)}</span> : null}
                      {book.salesPoint ? <span>판매지수 {book.salesPoint.toLocaleString()}</span> : null}
                      {usedDiscount(book) != null ? <span className="disc">중고 -{usedDiscount(book)}%</span> : null}
                    </p>
                  </div>
                  <div className="availability">
                    <div className="sourceRow"><small>알라딘</small>{book.aladinStatus === "in_stock" && (book.checkAladinLink || book.aladinLink) ? <a className="statusLink" href={book.checkAladinLink || book.aladinLink} target="_blank" rel="noreferrer"><strong className={statusTone(book.aladinStatus)}>{aladinLabels.in_stock} ↗</strong></a> : <strong className={statusTone(book.aladinStatus)}>{aladinLabels[book.aladinStatus ?? ""] || "확인 전"}</strong>}{book.aladinPrice ? <em>{book.aladinPrice.toLocaleString()}원부터</em> : null}</div>
                    <div className="sourceRow"><small>도서관</small>{book.libraryLink || book.libraryStatus === "available" ? <a className="statusLink" href={book.libraryLink || libraryUrl(book.title)} target="_blank" rel="noreferrer"><strong className={statusTone(book.libraryStatus)}>{libraryLabels[book.libraryStatus ?? ""] || "확인 전"} ↗</strong></a> : <strong className={statusTone(book.libraryStatus)}>{libraryLabels[book.libraryStatus ?? ""] || "확인 전"}</strong>}{book.libraryDueDate ? <em>{book.libraryDueDate} 반납</em> : book.libraryLocation ? <em>{book.libraryLocation.replace("[보정]", "")}</em> : null}</div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {!loading && pageCount > 1 && (
          <nav className="pager" aria-label="페이지 이동">
            <button onClick={() => setPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="이전 페이지">‹</button>
            <span>{currentPage} / {pageCount}<em>· {filteredBooks.length}권</em></span>
            <button onClick={() => setPage(currentPage + 1)} disabled={currentPage >= pageCount} aria-label="다음 페이지">›</button>
          </nav>
        )}
      </section>

      {detailBook && (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="도서 상세 정보" onClick={() => setDetailBook(null)}>
          <div className="modalPanel" onClick={(event) => event.stopPropagation()}>
            <button className="modalClose" onClick={() => setDetailBook(null)} aria-label="닫기">×</button>
            {detailLoading ? (
              <div className="modalState"><span className="loadingDot" />알라딘에서 정보를 불러오는 중…</div>
            ) : detailError ? (
              <div className="modalState">{detailError}</div>
            ) : detail ? (
              <>
                <div className="modalHead">
                  {detail.cover ? <img src={detail.cover} alt="" /> : <div className="coverFallback">BOOK</div>}
                  <div>
                    {detail.categoryName && <p className="modalCat">{detail.categoryName}</p>}
                    <h2>{detail.title}</h2>
                    {detail.subTitle && <p className="modalSub">{detail.subTitle}</p>}
                    {detail.link && <a href={detail.link} target="_blank" rel="noreferrer">알라딘에서 보기 ↗</a>}
                  </div>
                </div>
                <dl className="detailGrid">
                  {detailRows(detail).map(([label, value]) => (
                    <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
                  ))}
                </dl>
                {detail.description && (
                  <div className="modalDesc"><h3>책 소개</h3><p>{detail.description}</p></div>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}

      <footer>
        <div><span className="brandMark">책</span><strong>책갈피</strong></div>
        <p>도서 DB 제공: 알라딘 인터넷서점 · 도서관 정보: 용인시도서관</p>
        <span>Tailscale private service</span>
      </footer>
    </main>
  );
}
