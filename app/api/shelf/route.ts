import { inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { shelfHidden } from "../../../db/schema";

function bookIds(input: unknown): number[] {
  const list = Array.isArray((input as { bookIds?: unknown })?.bookIds) ? (input as { bookIds: unknown[] }).bookIds : [];
  return [...new Set(list.map(Number).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 500);
}

// Remove books from 내 서재 (purchase history stays on the book page).
export async function DELETE(request: Request) {
  const ids = bookIds(await request.json().catch(() => ({})));
  if (!ids.length) return Response.json({ error: "삭제할 책을 골라 주세요." }, { status: 400 });
  const db = await getDb();
  for (let offset = 0; offset < ids.length; offset += 50) {
    await db
      .insert(shelfHidden)
      .values(ids.slice(offset, offset + 50).map((bookId) => ({ bookId })))
      .onConflictDoNothing();
  }
  return Response.json({ removed: ids.length });
}

// Put books back on 내 서재.
export async function PUT(request: Request) {
  const ids = bookIds(await request.json().catch(() => ({})));
  if (!ids.length) return Response.json({ error: "책을 골라 주세요." }, { status: 400 });
  const db = await getDb();
  await db.delete(shelfHidden).where(inArray(shelfHidden.bookId, ids));
  return Response.json({ restored: ids.length });
}
