import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { readingNotes, readings } from "../../../../../db/schema";

type Params = { params: Promise<{ id: string }> };

// 문장 수집: a quote (and/or a thought) with an optional page.
export async function POST(request: Request, { params }: Params) {
  const readingId = Number((await params).id);
  const input = (await request.json().catch(() => ({}))) as { page?: unknown; quote?: unknown; memo?: unknown };
  const quote = String(input.quote ?? "").trim().slice(0, 5000);
  const memo = String(input.memo ?? "").trim().slice(0, 5000);
  if (!quote && !memo) return Response.json({ error: "문장이나 생각을 입력해 주세요." }, { status: 400 });
  const page = input.page === "" || input.page == null ? null : Math.max(1, Math.round(Number(input.page))) || null;
  const db = await getDb();
  const [reading] = await db.select({ id: readings.id }).from(readings).where(eq(readings.id, readingId));
  if (!reading) return Response.json({ error: "기록을 찾지 못했습니다." }, { status: 404 });
  const [note] = await db.insert(readingNotes).values({ readingId, page, quote, memo }).returning();
  return Response.json({ note }, { status: 201 });
}
