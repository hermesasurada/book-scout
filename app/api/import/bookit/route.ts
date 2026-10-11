import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { purchases, readingNotes, readings, watchlist } from "../../../../db/schema";
import { type BookitRecord, parseBookit } from "../../../../lib/bookit";
import { coreTitle, ensureBookForItem, matchEdition } from "../../../../lib/catalog";
import { renumberRounds } from "../../../../lib/readingQueries";

type Summary = {
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  watchAdded: number;
  watchKept: number;
  removed: number;
  keptOrphans: number;
  unmatched: Array<{ title: string; author: string; status: string }>;
};

// Re-runnable import of a 북적북적 export. While both apps are used, 북적북적
// owns status, dates and memo; ratings, reviews and notes added here are kept.
export async function POST(request: Request) {
  const text = await request.text();
  let records: BookitRecord[];
  try {
    records = parseBookit(text);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "파일을 읽지 못했습니다." }, { status: 400 });
  }
  if (!records.length) return Response.json({ error: "가져올 기록이 없습니다." }, { status: 400 });

  const db = await getDb();
  const summary: Summary = { total: records.length, created: 0, updated: 0, unchanged: 0, watchAdded: 0, watchKept: 0, removed: 0, keptOrphans: 0, unmatched: [] };

  // One Aladin lookup per distinct title/author within this run.
  const matches = new Map<string, Promise<number | null>>();
  const resolveBook = (record: BookitRecord) => {
    const cacheKey = `${coreTitle(record.title)}|${record.author}`;
    let pending = matches.get(cacheKey);
    if (!pending) {
      pending = matchEdition(record)
        .then((match) => (match ? ensureBookForItem(db, match.itemId) : null))
        .catch(() => null);
      matches.set(cacheKey, pending);
    }
    return pending;
  };

  type Row = typeof readings.$inferInsert;
  const upsertReading = async (sourceKey: string, values: Omit<Row, "sourceKey" | "source">) => {
    const [existing] = await db.select().from(readings).where(and(eq(readings.source, "bookit"), eq(readings.sourceKey, sourceKey)));
    if (!existing) {
      await db.insert(readings).values({ ...values, source: "bookit", sourceKey });
      summary.created += 1;
      return;
    }
    // Keep a book link made earlier (or by hand); only fill a missing one.
    // Rounds are renumbered per book after the import, so they are not compared.
    const { round: _round, ...rest } = values;
    void _round;
    const next = { ...rest, bookId: existing.bookId ?? values.bookId, matchStatus: existing.bookId ? existing.matchStatus : values.matchStatus };
    const changed = (Object.keys(next) as Array<keyof typeof next>).some((key) => (existing as Record<string, unknown>)[key] !== next[key]);
    if (!changed) {
      summary.unchanged += 1;
      return;
    }
    await db.update(readings).set({ ...next, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(readings.id, existing.id));
    summary.updated += 1;
  };

  const handle = async (record: BookitRecord) => {
    if (record.status === "want") {
      // 읽고 싶은 책 = 관심도서.
      const bookId = await resolveBook(record);
      if (!bookId) {
        summary.unmatched.push({ title: record.title, author: record.author, status: record.status });
        return;
      }
      const [owned] = await db.select({ id: purchases.id }).from(purchases).where(eq(purchases.bookId, bookId)).limit(1);
      if (owned) return;
      const added = await db.insert(watchlist).values({ bookId }).onConflictDoNothing().returning();
      if (added.length) summary.watchAdded += 1;
      else summary.watchKept += 1;
      return;
    }

    const [existing] = await db
      .select({ bookId: readings.bookId })
      .from(readings)
      .where(and(eq(readings.source, "bookit"), eq(readings.sourceKey, record.key)));
    const bookId = existing?.bookId ?? (await resolveBook(record));
    if (!bookId) summary.unmatched.push({ title: record.title, author: record.author, status: record.status });
    const base = {
      bookId,
      title: record.title,
      author: record.author,
      publisher: record.publisher,
      matchStatus: bookId ? "matched" : "unmatched",
    };
    await upsertReading(record.key, {
      ...base,
      status: record.status,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
      stoppedAt: record.stoppedAt,
      datesUnknown: record.datesUnknown,
      round: 1,
      memo: record.memo,
    });
    for (const reread of record.rereads) {
      await upsertReading(`${record.key}#${reread.round}`, {
        ...base,
        status: "finished",
        startedAt: null,
        finishedAt: reread.finishedAt,
        stoppedAt: null,
        datesUnknown: false,
        round: reread.round,
        memo: "",
      });
    }
  };

  // A few at a time — each unmatched title costs Aladin search + product requests.
  const queue = [...records];
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (let record = queue.shift(); record; record = queue.shift()) await handle(record);
    }),
  );

  // Records deleted (or retitled) in 북적북적 disappear from its export. Drop
  // them here too unless they carry something added in this app.
  const seen = new Set(records.flatMap((record) => [record.key, ...record.rereads.map((reread) => `${record.key}#${reread.round}`)]));
  const imported = await db
    .select({ id: readings.id, sourceKey: readings.sourceKey, rating: readings.rating, review: readings.review })
    .from(readings)
    .where(eq(readings.source, "bookit"));
  for (const row of imported) {
    if (row.sourceKey && seen.has(row.sourceKey)) continue;
    const [note] = await db.select({ id: readingNotes.id }).from(readingNotes).where(eq(readingNotes.readingId, row.id)).limit(1);
    if (row.rating != null || row.review || note) {
      summary.keptOrphans += 1;
      continue;
    }
    await db.delete(readings).where(eq(readings.id, row.id));
    summary.removed += 1;
  }

  await renumberRounds(db);

  const [{ unmatchedTotal }] = await db
    .select({ unmatchedTotal: sql<number>`count(*)` })
    .from(readings)
    .where(isNull(readings.bookId));
  return Response.json({ ...summary, unmatchedTotal });
}
