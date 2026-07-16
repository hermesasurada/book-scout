import { env } from "cloudflare:workers";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { books, checks } from "../../../db/schema";
import { checkAladinStore, checkBojeongLibrary, lookupAladinBook, sendTelegram } from "../../../lib/providers";

type RuntimeEnv = {
  ALADIN_TTB_KEY?: string;
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

  // Refresh Aladin metadata for a book. Static fields (cover, link, pub date)
  // are only filled when missing; volatile fields (price, sales point, review
  // rank, used-market low) are refreshed every run so sorts stay current.
  const enrich = async (book: typeof targets[number]) => {
    const info = await lookupAladinBook(book.isbn13, runtime.ALADIN_TTB_KEY);
    if (!info) return;
    await db
      .update(books)
      .set({
        cover: book.cover || info.cover,
        aladinLink: book.cover ? book.aladinLink : info.link || book.aladinLink,
        pubDate: book.pubDate || info.pubDate,
        category: info.category || book.category,
        priceSales: info.priceSales,
        salesPoint: info.salesPoint,
        reviewRank: info.reviewRank,
      })
      .where(eq(books.id, book.id));
  };

  // Fast path: only refresh Aladin metadata, skip status checks.
  if (payload.coversOnly) {
    let filled = 0;
    for (const book of targets) {
      await enrich(book);
      filled += 1;
    }
    return Response.json({ enriched: filled, scanned: targets.length });
  }

  const results = [];
  for (const book of targets) {
    const [aladin, library] = await Promise.all([
      checkAladinStore(book, runtime.ALADIN_TTB_KEY, runtime.ALADIN_STORE_NAME || "서현점"),
      checkBojeongLibrary(book),
      enrich(book),
    ]);
    const error = [aladin.error, library.error].filter(Boolean).join(" / ");
    const [saved] = await db
      .insert(checks)
      .values({
        bookId: book.id,
        aladinStatus: aladin.status,
        aladinStore: aladin.store,
        aladinPrice: aladin.price,
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
