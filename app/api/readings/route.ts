import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { books, readings } from "../../../db/schema";
import { readingPatch, today } from "../../../lib/readingInput";

// Start a reading (or record a finished one) for a catalog book.
export async function POST(request: Request) {
  const input = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const bookId = Number(input.bookId);
  if (!Number.isInteger(bookId) || bookId <= 0) return Response.json({ error: "도서가 필요합니다." }, { status: 400 });
  const patch = readingPatch({ status: "reading", ...input });
  if (typeof patch === "string") return Response.json({ error: patch }, { status: 400 });
  const db = await getDb();
  const [book] = await db.select().from(books).where(eq(books.id, bookId));
  if (!book) return Response.json({ error: "도서를 찾지 못했습니다." }, { status: 404 });
  if (patch.status === "reading") {
    const [active] = await db
      .select({ id: readings.id })
      .from(readings)
      .where(and(eq(readings.bookId, bookId), inArray(readings.status, ["reading"])));
    if (active) return Response.json({ error: "이미 읽고 있는 책입니다." }, { status: 409 });
  }
  const previous = await db.select({ round: readings.round }).from(readings).where(eq(readings.bookId, bookId));
  const round = previous.reduce((max, row) => Math.max(max, row.round), 0) + 1;
  const [reading] = await db
    .insert(readings)
    .values({
      bookId,
      title: book.title,
      author: book.author,
      publisher: book.publisher,
      status: patch.status ?? "reading",
      startedAt: patch.datesUnknown ? null : (patch.startedAt ?? today()),
      finishedAt: patch.datesUnknown ? null : (patch.finishedAt ?? (patch.status === "finished" ? today() : null)),
      datesUnknown: patch.datesUnknown ?? false,
      stoppedAt: patch.stoppedAt ?? null,
      round,
      review: patch.review ?? "",
      memo: patch.memo ?? "",
      currentPage: patch.currentPage ?? null,
      matchStatus: "manual",
      source: "manual",
    })
    .returning();
  return Response.json({ reading }, { status: 201 });
}
