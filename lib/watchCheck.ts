import { env } from "cloudflare:workers";
import { eq, sql } from "drizzle-orm";
import type { getDb } from "../db";
import { books, checks, watchlist } from "../db/schema";
import { productDetails } from "./catalog";
import {
  aladinItemIdFromLink,
  aladinProductLink,
  checkAladinStore,
  checkBojeongLibrary,
  findAladinItemId,
  lookupAladinProduct,
} from "./providers";

type Db = Awaited<ReturnType<typeof getDb>>;
type Book = typeof books.$inferSelect;
type RuntimeEnv = { ALADIN_STORE_CODE?: string; ALADIN_STORE_NAME?: string };

// Make sure a book has its Aladin ItemId (parsed from the stored link, or
// found via a site search for bulk-imported rows), then refresh metadata from
// the product page. Static fields are filled only when missing; price, sales
// point and rating are refreshed when forced (single-book / coversOnly) or
// when anything is still missing — the full daily run stays light.
export async function enrichBook(db: Db, book: Book, force: boolean): Promise<string> {
  const itemId = book.aladinItemId || aladinItemIdFromLink(book.aladinLink) || (await findAladinItemId(book.isbn13));
  if (!itemId) return "";
  const set: Partial<typeof books.$inferInsert> = { aladinItemId: itemId, aladinLink: aladinProductLink(itemId) };
  const missing = !book.cover || !book.pubDate || !book.priceSales || !book.category || book.pages == null;
  if (force || missing) {
    const product = await lookupAladinProduct(itemId).catch(() => null);
    if (product) {
      set.cover = book.cover || product.cover;
      set.pubDate = product.pubDate || book.pubDate;
      set.category = product.categoryName || book.category;
      set.pages = product.page ?? book.pages;
      set.priceSales = product.priceSales;
      set.salesPoint = product.salesPoint;
      set.reviewRank = product.reviewRank;
      set.commentCount = product.commentCount;
      set.reviewCount = product.reviewCount;
      Object.assign(set, productDetails(product));
    }
  }
  await db.update(books).set(set).where(eq(books.id, book.id));
  return itemId;
}

export async function checkBook(db: Db, book: Book, force: boolean) {
  const runtime = env as unknown as RuntimeEnv;
  const storeCode = runtime.ALADIN_STORE_CODE || "Bundang";
  const storeName = runtime.ALADIN_STORE_NAME || "분당서현점";
  // Resolve the ItemId first — the store check needs it.
  const itemId = await enrichBook(db, book, force);
  const target = { ...book, aladinItemId: itemId || book.aladinItemId };
  const [aladin, library] = await Promise.all([
    checkAladinStore(target, storeCode, storeName),
    checkBojeongLibrary(target),
  ]);
  const error = [aladin.error, library.error].filter(Boolean).join(" / ");
  const [saved] = await db
    .insert(checks)
    .values({
      bookId: book.id,
      aladinStatus: aladin.status,
      aladinStore: aladin.store,
      aladinPrice: aladin.price,
      aladinCount: aladin.count,
      aladinLink: aladin.link,
      libraryStatus: library.status,
      libraryDueDate: library.dueDate,
      libraryLocation: library.location,
      libraryLink: library.link,
      error,
    })
    .returning();
  return saved;
}

// A full run writes a row for every watched book while single-book checks touch
// only one, so the oldest of the books' latest checks is the last full run.
export async function lastDailyCheck(db: Db): Promise<string | null> {
  const [row] = await db.all<{ lastRunAt: string | null }>(sql`
    SELECT MIN(latest) AS lastRunAt FROM (
      SELECT MAX(${checks.checkedAt}) AS latest
      FROM ${watchlist} JOIN ${checks} ON ${checks.bookId} = ${watchlist.bookId}
      GROUP BY ${watchlist.bookId}
    )
  `);
  return row?.lastRunAt ?? null;
}
