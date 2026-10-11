import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { books, readings } from "../../../../db/schema";
import { readingPatch, today } from "../../../../lib/readingInput";
import { renumberRounds } from "../../../../lib/readingQueries";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const id = Number((await params).id);
  const input = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const patch = readingPatch(input);
  if (typeof patch === "string") return Response.json({ error: patch }, { status: 400 });
  const db = await getDb();
  const [current] = await db.select().from(readings).where(eq(readings.id, id));
  if (!current) return Response.json({ error: "기록을 찾지 못했습니다." }, { status: 404 });
  // Finishing or stopping without a date means today.
  if (patch.status === "finished" && !("finishedAt" in patch) && !current.finishedAt) patch.finishedAt = today();
  if (patch.status === "stopped" && !("stoppedAt" in patch) && !current.stoppedAt) patch.stoppedAt = today();
  const set: Partial<typeof readings.$inferInsert> = { ...patch };
  if (patch.bookId) {
    // Linking an unmatched record to an edition.
    const [book] = await db.select({ id: books.id }).from(books).where(eq(books.id, patch.bookId));
    if (!book) return Response.json({ error: "도서를 찾지 못했습니다." }, { status: 404 });
    set.matchStatus = "manual";
  }
  if (patch.status === "finished" || patch.status === "stopped") set.datesUnknown = current.datesUnknown && !patch.finishedAt;
  const [reading] = await db.update(readings).set({ ...set, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(readings.id, id)).returning();
  if (reading.bookId) await renumberRounds(db, reading.bookId);
  if (current.bookId && current.bookId !== reading.bookId) await renumberRounds(db, current.bookId);
  return Response.json({ reading });
}

export async function DELETE(_request: Request, { params }: Params) {
  const id = Number((await params).id);
  const db = await getDb();
  const [removed] = await db.delete(readings).where(eq(readings.id, id)).returning({ bookId: readings.bookId });
  if (removed?.bookId) await renumberRounds(db, removed.bookId);
  return Response.json({ ok: true });
}
