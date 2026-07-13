import { env } from "cloudflare:workers";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { books, checks } from "../../../db/schema";
import { checkAladinStore, checkBojeongLibrary, lookupAladinBook } from "../../../lib/providers";

type RuntimeEnv = { ALADIN_TTB_KEY?: string; ALADIN_STORE_NAME?: string; DAILY_CHECK_TOKEN?: string };

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
  const payload = (await request.json().catch(() => ({}))) as { bookId?: number; coversOnly?: boolean };
  const db = await getDb();
  const targets = payload.bookId
    ? await db.select().from(books).where(eq(books.id, payload.bookId))
    : await db.select().from(books);

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
        usedMinPrice: info.usedMinPrice,
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
  }
  return Response.json({ checked: results.length, results });
}
