import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { purchases } from "../../../../db/schema";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const id = Number((await params).id);
  const db = await getDb();
  await db.delete(purchases).where(eq(purchases.id, id));
  return Response.json({ ok: true });
}
