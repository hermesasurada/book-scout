/* eslint-disable @next/next/no-img-element -- cover URLs are supplied dynamically by Aladin */
import { asc, desc, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "../../../db";
import { books, checks, purchases, readingNotes, shelfHidden, watchlist } from "../../../db/schema";
import {
  aladinLabels,
  aladinStatusLabel,
  aladinStoreHref,
  bookCategory,
  cleanUrl,
  libraryHref,
  libraryLabels,
  libraryStatusLabel,
  parseDbTime,
  ratingText,
  relativeTime,
  statusTone,
  usedDiscount,
  won,
} from "../../../lib/books";
import { productDetails } from "../../../lib/catalog";
import { lookupAladinProduct } from "../../../lib/providers";
import { loadReadings } from "../../../lib/readingQueries";
import { Icon } from "../../components/Icon";
import { BackLink, BookActions } from "./BookActions";
import { LibraryActions, PurchaseSection, ReadingSection } from "./BookSections";

type Params = { params: Promise<{ id: string }> };

async function loadBook(id: string) {
  const bookId = Number(id);
  if (!Number.isInteger(bookId) || bookId <= 0) return null;
  const db = await getDb();
  const [book] = await db.select().from(books).where(eq(books.id, bookId));
  if (!book) return null;
  const [watch] = await db.select().from(watchlist).where(eq(watchlist.bookId, bookId));
  const history = watch ? await db.select().from(checks).where(eq(checks.bookId, bookId)).orderBy(asc(checks.checkedAt), asc(checks.id)) : [];
  const readings = await loadReadings(db, bookId);
  const notes = readings.length
    ? await db.select().from(readingNotes).where(inArray(readingNotes.readingId, readings.map((reading) => reading.id))).orderBy(asc(readingNotes.page), asc(readingNotes.id))
    : [];
  const owned = await db.select().from(purchases).where(eq(purchases.bookId, bookId)).orderBy(desc(purchases.purchasedAt), desc(purchases.id));
  const [hidden] = await db.select().from(shelfHidden).where(eq(shelfHidden.bookId, bookId));
  return { book, watched: Boolean(watch), history, readings, notes, purchases: owned, hiddenFromShelf: Boolean(hidden) };
}

export async function generateMetadata({ params }: Params) {
  const loaded = await loadBook((await params).id);
  return { title: loaded?.book.title ?? "도서" };
}

type Check = typeof checks.$inferSelect;
type Change = { at: string; source: "알라딘" | "도서관"; from: string; to: string; tone: ReturnType<typeof statusTone> };

// Only the moments a status actually changed — the daily rows in between are
// noise on this page.
function statusChanges(history: Check[]): Change[] {
  const changes: Change[] = [];
  let previous: Check | undefined;
  for (const check of history) {
    if (previous) {
      if (previous.aladinStatus !== check.aladinStatus) {
        changes.push({
          at: check.checkedAt,
          source: "알라딘",
          from: aladinLabels[previous.aladinStatus] ?? previous.aladinStatus,
          to: aladinStatusLabel(check),
          tone: statusTone(check.aladinStatus),
        });
      }
      if (previous.libraryStatus !== check.libraryStatus) {
        changes.push({
          at: check.checkedAt,
          source: "도서관",
          from: libraryLabels[previous.libraryStatus] ?? previous.libraryStatus,
          to: libraryStatusLabel(check),
          tone: statusTone(check.libraryStatus),
        });
      }
    }
    previous = check;
  }
  return changes.reverse();
}

function formatDate(value: string) {
  const date = parseDbTime(value);
  if (!date) return value;
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export default async function BookPage({ params }: Params) {
  const loaded = await loadBook((await params).id);
  if (!loaded) notFound();
  const { book, watched, history, readings, notes, purchases: owned, hiddenFromShelf } = loaded;
  const latest = history.at(-1);
  const view = {
    ...book,
    aladinStatus: latest?.aladinStatus ?? null,
    aladinPrice: latest?.aladinPrice ?? null,
    aladinCount: latest?.aladinCount ?? null,
    checkAladinLink: latest?.aladinLink ?? null,
    libraryStatus: latest?.libraryStatus ?? null,
    libraryLink: latest?.libraryLink ?? null,
  };
  const storeHref = aladinStoreHref(view);
  const libHref = libraryHref(view);
  const discount = usedDiscount(view);
  const rating = ratingText(book);
  const category = bookCategory(book);
  const changes = statusChanges(history).slice(0, 12);
  const dueNote = latest?.libraryDueDate ? `${latest.libraryDueDate} 반납 예정` : latest?.libraryLocation?.replace("[보정]", "").trim() ?? "";

  return (
    <div className="mx-auto max-w-4xl">
      <BackLink />

      <section className="mt-4 grid gap-6 sm:grid-cols-[160px_minmax(0,1fr)]">
        <a
          className="cover mx-auto block aspect-[2/3] w-36 rounded-md sm:mx-0 sm:w-40"
          href={cleanUrl(book.aladinLink) || undefined}
          target="_blank"
          rel="noreferrer"
          aria-label={`${book.title} 알라딘 상품 페이지`}
        >
          {book.cover ? <img src={book.cover} alt="" /> : null}
        </a>
        <div className="min-w-0">
          {category && <p className="text-[12px] font-medium text-accent">{category}</p>}
          <h1 className="mt-1 text-[24px] font-bold leading-tight tracking-tight">{book.title}</h1>
          <p className="mt-2 text-[14px] text-ink-2">{[book.author, book.publisher].filter(Boolean).join(" · ")}</p>
          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-muted">
            {book.pubDate && <div><dt className="sr-only-x">출간일</dt><dd>{book.pubDate} 출간</dd></div>}
            {rating && (
              <div className="inline-flex items-center gap-1" title="알라딘 평점 (100자평, 리뷰 편수)">
                <dt className="sr-only-x">알라딘 평점</dt>
                <Icon name="star" className="size-3.5 text-warn" />
                <dd className="tabular">{rating}</dd>
              </div>
            )}
            {book.salesPoint ? <div><dt className="sr-only-x">판매지수</dt><dd className="tabular">판매지수 {book.salesPoint.toLocaleString()}</dd></div> : null}
            {book.priceSales ? <div><dt className="sr-only-x">판매가</dt><dd className="tabular">새책 {won(book.priceSales)}</dd></div> : null}
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            <LibraryActions
              bookId={book.id}
              itemId={book.aladinItemId}
              isbn13={book.isbn13}
              title={book.title}
              watched={watched}
              owned={owned.length > 0}
              reading={readings.some((reading) => reading.status === "reading")}
              readBefore={readings.some((reading) => reading.status === "finished")}
              hiddenFromShelf={hiddenFromShelf}
            />
            <BookActions bookId={book.id} title={book.title} aladinLink={cleanUrl(book.aladinLink)} watched={watched} />
          </div>
        </div>
      </section>

      <ReadingSection readings={readings} notes={notes} />
      <PurchaseSection purchases={owned} />

      {watched && (
      <section className="mt-8">
        <div className="mb-2.5 flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">관심도서 상태</h2>
          <span className="text-[12px] text-muted">마지막 확인 {relativeTime(latest?.checkedAt)}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="card p-4">
            <p className="flex items-center gap-1.5 text-[12px] text-muted"><Icon name="store" className="size-3.5" />알라딘 분당서현점</p>
            <p className="mt-2">
              {storeHref ? (
                <a className={`status ${statusTone(view.aladinStatus)} text-[15px]`} href={storeHref} target="_blank" rel="noreferrer">{aladinStatusLabel(view)}</a>
              ) : (
                <span className={`status ${statusTone(view.aladinStatus)} text-[15px]`}>{aladinStatusLabel(view)}</span>
              )}
            </p>
            {view.aladinPrice ? (
              <p className="tabular mt-1 text-[12.5px] text-muted">
                중고 {won(view.aladinPrice)}부터{discount != null && <span className="ml-1.5 font-semibold text-accent">새책 대비 -{discount}%</span>}
              </p>
            ) : null}
          </div>
          <div className="card p-4">
            <p className="flex items-center gap-1.5 text-[12px] text-muted"><Icon name="library" className="size-3.5" />보정도서관</p>
            <p className="mt-2">
              {libHref ? (
                <a className={`status ${statusTone(view.libraryStatus)} text-[15px]`} href={libHref} target="_blank" rel="noreferrer">{libraryStatusLabel(view)}</a>
              ) : (
                <span className={`status ${statusTone(view.libraryStatus)} text-[15px]`}>{libraryStatusLabel(view)}</span>
              )}
            </p>
            {dueNote && <p className="tabular mt-1 text-[12.5px] text-muted">{dueNote}</p>}
          </div>
        </div>
        {changes.length > 0 && (
          <div className="card mt-3 p-4">
            <h3 className="text-[12.5px] font-semibold text-muted">상태 변화</h3>
            <ol className="mt-2 space-y-1.5">
              {changes.map((change, index) => (
                <li key={`${change.at}-${change.source}-${index}`} className="flex flex-wrap items-center gap-x-2 text-[12.5px]">
                  <span className="tabular w-[86px] shrink-0 text-faint">{formatDate(change.at)}</span>
                  <span className="w-10 shrink-0 text-muted">{change.source}</span>
                  <span className="text-muted">{change.from}</span>
                  <Icon name="chevronRight" className="size-3 text-faint" />
                  <span className={`status ${change.tone}`}>{change.to}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>
      )}

      {book.detailsAt || !book.aladinItemId ? (
        <BookInfo details={book} />
      ) : (
        <Suspense fallback={<AladinInfoSkeleton />}>
          <FetchBookInfo bookId={book.id} itemId={book.aladinItemId} fallback={book} />
        </Suspense>
      )}
    </div>
  );
}

function AladinInfoSkeleton() {
  return (
    <section className="mt-8">
      <h2 className="mb-2.5 text-[15px] font-semibold">책 정보</h2>
      <div className="card space-y-2.5 p-4">
        <div className="h-3 w-1/3 rounded bg-sunken pulse" />
        <div className="h-3 w-2/3 rounded bg-sunken pulse" />
        <div className="h-3 w-1/2 rounded bg-sunken pulse" />
      </div>
    </section>
  );
}

type Details = {
  isbn13: string;
  pages: number | null;
  originalTitle: string;
  priceStandard: number | null;
  priceSales: number | null;
  category: string;
  subTitle: string;
  description: string;
};

function BookInfo({ details }: { details: Details }) {
  const rows: Array<[string, string]> = [
    ["ISBN", details.isbn13],
    ["쪽수", details.pages ? `${details.pages}쪽` : ""],
    ["원제", details.originalTitle],
    ["정가", details.priceStandard ? won(details.priceStandard) : ""],
    ["판매가", details.priceSales ? won(details.priceSales) : ""],
    ["분류", details.category],
  ];
  const visible = rows.filter(([, value]) => value && value.trim());
  return (
    <section className="mt-8">
      <h2 className="mb-2.5 text-[15px] font-semibold">책 정보</h2>
      <div className="card p-4">
        {details.subTitle && <p className="mb-3 text-[13.5px] text-ink-2">{details.subTitle}</p>}
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {visible.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[56px_minmax(0,1fr)] gap-2 text-[13px]">
              <dt className="text-muted">{label}</dt>
              <dd className="break-words">{value}</dd>
            </div>
          ))}
        </dl>
        {details.description && (
          <div className="mt-4 border-t border-line pt-4">
            <h3 className="text-[12.5px] font-semibold text-muted">책 소개</h3>
            <p className="mt-1.5 whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2">{details.description}</p>
          </div>
        )}
      </div>
    </section>
  );
}

// Books catalogued before details were stored: read the Aladin product page
// once, keep the result, and never fetch it on later visits.
async function FetchBookInfo({ bookId, itemId, fallback }: { bookId: number; itemId: string; fallback: Details }) {
  const product = await lookupAladinProduct(itemId).catch(() => null);
  if (!product) return <BookInfo details={fallback} />;
  const db = await getDb();
  await db
    .update(books)
    .set({ ...productDetails(product), pages: fallback.pages ?? product.page, category: fallback.category || product.categoryName })
    .where(eq(books.id, bookId));
  return (
    <BookInfo
      details={{
        ...fallback,
        pages: fallback.pages ?? product.page,
        category: fallback.category || product.categoryName,
        originalTitle: product.originalTitle,
        priceStandard: product.priceStandard,
        subTitle: product.subTitle,
        description: product.description,
      }}
    />
  );
}
