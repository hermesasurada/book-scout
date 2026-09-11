import { env } from "cloudflare:workers";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { books, checks } from "../../../db/schema";
import {
  aladinItemIdFromLink,
  aladinProductLink,
  checkAladinStore,
  checkBojeongLibrary,
  findAladinItemId,
  lookupAladinProduct,
  sendTelegram,
} from "../../../lib/providers";

type RuntimeEnv = {
  ALADIN_STORE_CODE?: string;
  ALADIN_STORE_NAME?: string;
  DAILY_CHECK_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
};

// A book is library-borrowable whether it's the exact edition or a verified
// different edition of the same work.
const libraryBorrowable = (status: string) => status === "available" || status === "other_available";

type Transition = {
  title: string;
  aladin: boolean;
  library: boolean;
  aladinLink: string;
  aladinPrice: number | null;
  libraryLink: string;
};

// Plain-text notification — printed to stdout for the hermes cron to deliver,
// and usable as-is for a direct Telegram send.
function buildNotification(transitions: Transition[]): string {
  const lines = [`📚 오늘 새로 만날 수 있는 책 ${transitions.length}권`];
  const aladin = transitions.filter((t) => t.aladin);
  const library = transitions.filter((t) => t.library);
  if (aladin.length) {
    lines.push("", "🟢 알라딘 재고");
    for (const t of aladin) {
      const price = t.aladinPrice ? ` — ${t.aladinPrice.toLocaleString()}원부터` : "";
      lines.push(`• ${t.title}${price}`);
      if (t.aladinLink) lines.push(`  ${t.aladinLink}`);
    }
  }
  if (library.length) {
    lines.push("", "📖 도서관 대출가능");
    for (const t of library) {
      lines.push(`• ${t.title}`);
      if (t.libraryLink) lines.push(`  ${t.libraryLink}`);
    }
  }
  return lines.join("\n");
}

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
    notify?: boolean;
  };
  const db = await getDb();
  const targets = payload.bookId
    ? await db.select().from(books).where(eq(books.id, payload.bookId))
    : await db.select().from(books);

  // Snapshot each book's most recent (i.e. previous-run / yesterday) status so
  // we can detect books that just gained Aladin stock or library availability.
  const notify = Boolean(payload.notify) && !payload.bookId;
  const previous = new Map<number, { aladinStatus: string; libraryStatus: string }>();
  if (notify) {
    const rows = await db
      .select({ bookId: checks.bookId, aladinStatus: checks.aladinStatus, libraryStatus: checks.libraryStatus })
      .from(checks)
      .where(sql`${checks.id} IN (SELECT MAX(id) FROM checks GROUP BY book_id)`);
    for (const row of rows) previous.set(row.bookId, { aladinStatus: row.aladinStatus, libraryStatus: row.libraryStatus });
  }
  const transitions: Transition[] = [];

  // Make sure a book has its Aladin ItemId (parsed from the stored link, or
  // found via a site search for bulk-imported rows), then refresh metadata from
  // the product page. Static fields are filled only when missing; price, sales
  // point and rating are refreshed when forced (single-book / coversOnly) or
  // when anything is still missing — the full daily run stays light.
  const enrich = async (book: typeof targets[number], force: boolean): Promise<string> => {
    const itemId = book.aladinItemId || aladinItemIdFromLink(book.aladinLink) || (await findAladinItemId(book.isbn13));
    if (!itemId) return "";
    const set: Partial<typeof books.$inferInsert> = { aladinItemId: itemId, aladinLink: aladinProductLink(itemId) };
    const missing = !book.cover || !book.pubDate || !book.priceSales || !book.category;
    if (force || missing) {
      const product = await lookupAladinProduct(itemId).catch(() => null);
      if (product) {
        set.cover = book.cover || product.cover;
        set.pubDate = product.pubDate || book.pubDate;
        set.category = product.categoryName || book.category;
        set.priceSales = product.priceSales;
        set.salesPoint = product.salesPoint;
        set.reviewRank = product.reviewRank;
        set.commentCount = product.commentCount;
        set.reviewCount = product.reviewCount;
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

    if (notify) {
      const prev = previous.get(book.id);
      // Only flag genuine transitions against a known previous state.
      const aladinNew = aladin.status === "in_stock" && prev !== undefined && prev.aladinStatus !== "in_stock";
      const libraryNew =
        libraryBorrowable(library.status) && prev !== undefined && !libraryBorrowable(prev.libraryStatus);
      if (aladinNew || libraryNew) {
        transitions.push({
          title: book.title,
          aladin: aladinNew,
          library: libraryNew,
          aladinLink: aladin.link || book.aladinLink,
          aladinPrice: aladin.price,
          libraryLink: library.link,
        });
      }
    }
  }

  // The daily cron prints `message` to stdout for the hermes gateway to deliver.
  // A direct send also fires if a Telegram token is configured on this app.
  const message = notify && transitions.length > 0 ? buildNotification(transitions) : "";
  let notified = false;
  if (message) {
    notified = await sendTelegram(runtime.TELEGRAM_BOT_TOKEN, runtime.TELEGRAM_CHAT_ID, message);
  }
  return Response.json({ checked: results.length, transitions: transitions.length, notified, message });
}
