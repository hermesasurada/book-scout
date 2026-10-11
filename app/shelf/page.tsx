import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { books, purchases } from "../../db/schema";
import { Shelf, type ShelfBook } from "./Shelf";

export const metadata = { title: "내 서재" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ShelfPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const db = await getDb();
  const rows = await db
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      publisher: books.publisher,
      cover: books.cover,
      purchasedAt: sql<string>`max(${purchases.purchasedAt})`,
      purchaseCount: sql<number>`count(*)`,
      channel: sql<string>`(SELECT channel FROM purchases p2 WHERE p2.book_id = ${books.id} ORDER BY p2.purchased_at DESC, p2.id DESC LIMIT 1)`,
      condition: sql<string>`(SELECT condition FROM purchases p2 WHERE p2.book_id = ${books.id} ORDER BY p2.purchased_at DESC, p2.id DESC LIMIT 1)`,
      store: sql<string>`(SELECT store FROM purchases p2 WHERE p2.book_id = ${books.id} ORDER BY p2.purchased_at DESC, p2.id DESC LIMIT 1)`,
      readState: sql<string>`CASE
        WHEN EXISTS (SELECT 1 FROM readings r WHERE r.book_id = ${books.id} AND r.status = 'reading') THEN 'reading'
        WHEN EXISTS (SELECT 1 FROM readings r WHERE r.book_id = ${books.id} AND r.status = 'stopped') THEN 'stopped'
        ELSE 'unread' END`,
    })
    .from(purchases)
    .innerJoin(books, eq(books.id, purchases.bookId))
    // 내 서재 holds owned books not yet read; a finished book leaves the shelf
    // (its purchase stays on the book page).
    // Books removed from the shelf by hand stay out too.
    .where(
      and(
        sql`NOT EXISTS (SELECT 1 FROM readings r WHERE r.book_id = ${books.id} AND r.status = 'finished')`,
        sql`NOT EXISTS (SELECT 1 FROM shelf_hidden h WHERE h.book_id = ${books.id})`,
      ),
    )
    .groupBy(books.id)
    .orderBy(desc(sql`max(${purchases.purchasedAt})`), desc(books.id));
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");
  return <Shelf books={rows.map((row) => ({ ...row, purchaseCount: Number(row.purchaseCount) })) as ShelfBook[]} initial={{ state: one("state"), channel: one("channel"), year: one("year"), q: one("q") }} />;
}
