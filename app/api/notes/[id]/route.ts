import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { readingNotes } from "../../../../db/schema";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const id = Number((await params).id);
  const db = await getDb();
  await db.delete(readingNotes).where(eq(readingNotes.id, id));
  return Response.json({ ok: true });
}
