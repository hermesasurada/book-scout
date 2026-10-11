import { desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { books, checks, purchases, watchlist } from "../../../db/schema";
import { aladinItemIdFromLink, aladinProductLink, lookupAladinProduct } from "../../../lib/providers";

const toInt = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

export async function GET() {
  try {
    const db = await getDb();
    const rows = await db
      .select({
        id: books.id,
        isbn13: books.isbn13,
        title: books.title,
        author: books.author,
        publisher: books.publisher,
        cover: books.cover,
        aladinLink: books.aladinLink,
        aladinItemId: books.aladinItemId,
        pubDate: books.pubDate,
        category: books.category,
        priceSales: books.priceSales,
        salesPoint: books.salesPoint,
        reviewRank: books.reviewRank,
        commentCount: books.commentCount,
        reviewCount: books.reviewCount,
        createdAt: watchlist.addedAt,
        checkedAt: checks.checkedAt,
        aladinStatus: checks.aladinStatus,
        aladinStore: checks.aladinStore,
        aladinPrice: checks.aladinPrice,
        aladinCount: checks.aladinCount,
        checkAladinLink: checks.aladinLink,
        libraryStatus: checks.libraryStatus,
        libraryDueDate: checks.libraryDueDate,
        libraryLocation: checks.libraryLocation,
        libraryLink: checks.libraryLink,
        checkError: checks.error,
      })
      .from(watchlist)
      .innerJoin(books, eq(books.id, watchlist.bookId))
      .leftJoin(checks, sql`${checks.id} = (SELECT id FROM checks WHERE book_id = ${books.id} ORDER BY checked_at DESC, id DESC LIMIT 1)`)
      .orderBy(desc(watchlist.addedAt), desc(books.id));
    return Response.json({ books: rows });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    if (Array.isArray(payload.books)) {
      const incoming = payload.books.slice(0, 1000) as Array<Record<string, unknown>>;
      const valid = incoming
        .filter((item) => /^\d{13}$/.test(String(item.isbn13 ?? "")) && String(item.title ?? "").trim())
        .map((item) => ({
          isbn13: String(item.isbn13),
          title: String(item.title).trim(),
          author: String(item.author ?? "").trim(),
          publisher: String(item.publisher ?? "").trim(),
          cover: String(item.cover ?? ""),
          aladinLink: String(item.aladinLink ?? ""),
          aladinItemId: String(item.itemId ?? "") || aladinItemIdFromLink(String(item.aladinLink ?? "")),
          pubDate: String(item.pubDate ?? ""),
        }));
      const unique = [...new Map(valid.map((book) => [book.isbn13, book])).values()];
      const db = await getDb();
      let added = 0;
      for (let offset = 0; offset < unique.length; offset += 10) {
        const chunk = unique.slice(offset, offset + 10);
        await db.insert(books).values(chunk).onConflictDoNothing({ target: books.isbn13 });
        const rows = await db.select({ id: books.id }).from(books).where(inArray(books.isbn13, chunk.map((book) => book.isbn13)));
        const watched = await db
          .insert(watchlist)
          .values(rows.map((row) => ({ bookId: row.id })))
          .onConflictDoNothing()
          .returning({ bookId: watchlist.bookId });
        added += watched.length;
      }
      return Response.json({
        added,
        skipped: unique.length - added,
        invalid: incoming.length - valid.length,
        received: incoming.length,
      }, { status: 201 });
    }

    const single = payload as Record<string, unknown>;
    const title = String(single.title ?? "").trim();
    // Search results carry the Aladin ItemId; pull the exact ISBN, publish date,
    // category and current prices from the product page while adding.
    const itemId = String(single.itemId ?? "") || aladinItemIdFromLink(String(single.aladinLink ?? ""));
    const product = itemId ? await lookupAladinProduct(itemId).catch(() => null) : null;
    const isbn13 = product?.isbn13 || String(single.isbn13 ?? "");
    if (!/^\d{13}$/.test(isbn13) || !title) {
      return Response.json({ error: "올바른 도서 정보가 필요합니다." }, { status: 400 });
    }
    const db = await getDb();
    await db
      .insert(books)
      .values({
        isbn13,
        title,
        author: product?.author || String(single.author ?? "").trim(),
        publisher: product?.publisher || String(single.publisher ?? "").trim(),
        cover: product?.cover || String(single.cover ?? ""),
        aladinLink: itemId ? aladinProductLink(itemId) : String(single.aladinLink ?? ""),
        aladinItemId: itemId,
        pubDate: product?.pubDate || String(single.pubDate ?? ""),
        category: product?.categoryName ?? "",
        pages: product?.page ?? null,
        priceSales: product?.priceSales ?? toInt(single.priceSales),
        salesPoint: product?.salesPoint ?? toInt(single.salesPoint),
        reviewRank: product?.reviewRank ?? toInt(single.reviewRank),
        commentCount: product?.commentCount ?? null,
        reviewCount: product?.reviewCount ?? null,
      })
      .onConflictDoNothing({ target: books.isbn13 });
    const [book] = await db.select().from(books).where(eq(books.isbn13, isbn13));
    // Owned books are not watched — there is nothing left to find.
    const [owned] = await db.select({ id: purchases.id }).from(purchases).where(eq(purchases.bookId, book.id)).limit(1);
    if (owned) return Response.json({ error: "이미 보유한 책입니다." }, { status: 409 });
    const [watched] = await db.insert(watchlist).values({ bookId: book.id }).onConflictDoNothing().returning();
    if (!watched) return Response.json({ error: "이미 관심도서에 있습니다." }, { status: 409 });
    return Response.json({ book }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "도서를 저장하지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 도서 번호입니다." }, { status: 400 });
  const db = await getDb();
  await db.delete(watchlist).where(eq(watchlist.bookId, id));
  return Response.json({ ok: true });
}
