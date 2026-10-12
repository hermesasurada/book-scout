import { env } from "cloudflare:workers";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { books, checks, watchlist } from "../../../db/schema";
import {
  aladinItemIdFromLink,
  aladinProductLink,
  checkAladinStore,
  checkBojeongLibrary,
  findAladinItemId,
  lookupAladinProduct,
} from "../../../lib/providers";
import { productDetails } from "../../../lib/catalog";

type RuntimeEnv = {
  ALADIN_STORE_CODE?: string;
  ALADIN_STORE_NAME?: string;
  DAILY_CHECK_TOKEN?: string;
};

export async function GET() {
  const db = await getDb();
  const history = await db.select().from(checks).orderBy(desc(checks.checkedAt), desc(checks.id)).limit(50);
  return Response.json({ history });
}

export async function POST(request: Request) {
  const runtime = env as unknown as RuntimeEnv;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (runtime.DAILY_CHECK_TOKEN && supplied && supplied !== runtime.DAILY_CHECK_TOKEN) {
    return Response.json({ error: "점검 토큰이 올바르지 않습니다." }, { status: 401 });
  }
  const payload = (await request.json().catch(() => ({}))) as {
    bookId?: number;
    coversOnly?: boolean;
  };
  const db = await getDb();
  // Only watched books are checked; owned or merely-read books are not.
  const watched = db.select({ book: books }).from(watchlist).innerJoin(books, eq(books.id, watchlist.bookId));
  const targets = (payload.bookId ? await watched.where(eq(books.id, payload.bookId)) : await watched).map((row) => row.book);

  // Make sure a book has its Aladin ItemId (parsed from the stored link, or
  // found via a site search for bulk-imported rows), then refresh metadata from
  // the product page. Static fields are filled only when missing; price, sales
  // point and rating are refreshed when forced (single-book / coversOnly) or
  // when anything is still missing — the full daily run stays light.
  const enrich = async (book: typeof targets[number], force: boolean): Promise<string> => {
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
  };

  // Fast path: only refresh Aladin metadata, skip status checks.
  if (payload.coversOnly) {
    let filled = 0;
    for (const book of targets) {
      await enrich(book, true);
      filled += 1;
    }
    return Response.json({ enriched: filled, scanned: targets.length });
  }

  const storeCode = runtime.ALADIN_STORE_CODE || "Bundang";
  const storeName = runtime.ALADIN_STORE_NAME || "분당서현점";
  const results = [];
  for (const book of targets) {
    // Resolve the ItemId first — the store check needs it.
    const itemId = await enrich(book, Boolean(payload.bookId));
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
    results.push(saved);
  }

  return Response.json({ checked: results.length });
}
