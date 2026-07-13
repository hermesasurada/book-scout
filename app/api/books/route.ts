import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { books, checks } from "../../../db/schema";

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
        pubDate: books.pubDate,
        category: books.category,
        priceSales: books.priceSales,
        salesPoint: books.salesPoint,
        reviewRank: books.reviewRank,
        createdAt: books.createdAt,
        checkedAt: checks.checkedAt,
        aladinStatus: checks.aladinStatus,
        aladinStore: checks.aladinStore,
        aladinPrice: checks.aladinPrice,
        checkAladinLink: checks.aladinLink,
        libraryStatus: checks.libraryStatus,
        libraryDueDate: checks.libraryDueDate,
        libraryLocation: checks.libraryLocation,
        libraryLink: checks.libraryLink,
        checkError: checks.error,
      })
      .from(books)
      .leftJoin(checks, sql`${checks.id} = (SELECT id FROM checks WHERE book_id = ${books.id} ORDER BY checked_at DESC, id DESC LIMIT 1)`)
      .orderBy(desc(books.createdAt), desc(books.id));
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
          pubDate: String(item.pubDate ?? ""),
        }));
      const unique = [...new Map(valid.map((book) => [book.isbn13, book])).values()];
      const db = await getDb();
      let added = 0;
      for (let offset = 0; offset < unique.length; offset += 10) {
        const inserted = await db
          .insert(books)
          .values(unique.slice(offset, offset + 10))
          .onConflictDoNothing({ target: books.isbn13 })
          .returning({ id: books.id });
        added += inserted.length;
      }
      return Response.json({
        added,
        skipped: unique.length - added,
        invalid: incoming.length - valid.length,
        received: incoming.length,
      }, { status: 201 });
    }

    const single = payload as Record<string, string>;
    if (!/^\d{13}$/.test(single.isbn13 ?? "") || !single.title?.trim()) {
      return Response.json({ error: "올바른 도서 정보가 필요합니다." }, { status: 400 });
    }
    const db = await getDb();
    const [book] = await db
      .insert(books)
      .values({
        isbn13: single.isbn13,
        title: single.title.trim(),
        author: single.author?.trim() ?? "",
        publisher: single.publisher?.trim() ?? "",
        cover: single.cover ?? "",
        aladinLink: single.aladinLink ?? "",
        pubDate: single.pubDate ?? "",
      })
      .onConflictDoNothing({ target: books.isbn13 })
      .returning();
    if (!book) return Response.json({ error: "이미 관심도서에 있습니다." }, { status: 409 });
    return Response.json({ book }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "도서를 저장하지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 도서 번호입니다." }, { status: 400 });
  const db = await getDb();
  await db.delete(books).where(eq(books.id, id));
  return Response.json({ ok: true });
}
