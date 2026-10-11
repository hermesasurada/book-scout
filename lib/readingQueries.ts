// Server-side reading queries shared by pages.
import { desc, eq, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import type { ReadingView } from "./readings";

type Db = DrizzleD1Database<typeof schema>;
const { books, readings } = schema;

export async function loadReadings(db: Db, bookId?: number): Promise<ReadingView[]> {
  const query = db
    .select({
      id: readings.id,
      bookId: readings.bookId,
      title: sql<string>`coalesce(${books.title}, ${readings.title})`,
      author: sql<string>`coalesce(${books.author}, ${readings.author})`,
      publisher: sql<string>`coalesce(${books.publisher}, ${readings.publisher})`,
      status: readings.status,
      startedAt: readings.startedAt,
      finishedAt: readings.finishedAt,
      stoppedAt: readings.stoppedAt,
      datesUnknown: readings.datesUnknown,
      round: readings.round,
      rating: readings.rating,
      review: readings.review,
      memo: readings.memo,
      currentPage: readings.currentPage,
      matchStatus: readings.matchStatus,
      source: readings.source,
      cover: books.cover,
      pages: books.pages,
      category: books.category,
      noteCount: sql<number>`(SELECT count(*) FROM reading_notes n WHERE n.reading_id = ${readings.id})`,
    })
    .from(readings)
    .leftJoin(books, eq(books.id, readings.bookId))
    .orderBy(
      desc(sql`coalesce(${readings.finishedAt}, ${readings.stoppedAt}, ${readings.startedAt}, '')`),
      desc(readings.id),
    );
  const rows = bookId ? await query.where(eq(readings.bookId, bookId)) : await query;
  return rows.map((row) => ({ ...row, datesUnknown: Boolean(row.datesUnknown), noteCount: Number(row.noteCount) }));
}

// Re-reads are numbered in reading order per book (records read before
// 2021 with unknown dates count first). Run after imports and edits.
export async function renumberRounds(db: Db, bookId?: number) {
  const where = bookId ? sql`WHERE book_id = ${bookId}` : sql`WHERE book_id IS NOT NULL`;
  await db.run(sql`
    UPDATE readings SET round = ranked.n
    FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY book_id
        ORDER BY dates_unknown DESC, coalesce(finished_at, stopped_at, started_at, '9999') ASC, id ASC
      ) AS n
      FROM readings ${where}
    ) AS ranked
    WHERE readings.id = ranked.id AND readings.round <> ranked.n
  `);
}
