import { env } from "cloudflare:workers";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { books, checks, watchlist } from "../../../db/schema";
import { checkBook, enrichBook } from "../../../lib/watchCheck";

type RuntimeEnv = { DAILY_CHECK_TOKEN?: string };

export async function GET() {
  const db = await getDb();
  const history = await db.select().from(checks).orderBy(desc(checks.checkedAt), desc(checks.id)).limit(50);
  return Response.json({ history });
}

export async function POST(request: Request) {
  const runtime = env as unknown as RuntimeEnv;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (runtime.DAILY_CHECK_TOKEN && supplied && supplied !== runtime.DAILY_CHECK_TOKEN) {
    return Response.json({ error: "점검 토큰이 올바르지 않습니다." }, { status: 401 });
  }
  const payload = (await request.json().catch(() => ({}))) as {
    bookId?: number;
    coversOnly?: boolean;
  };
  const db = await getDb();
  // Only watched books are checked; owned or merely-read books are not.
  const watched = db.select({ book: books }).from(watchlist).innerJoin(books, eq(books.id, watchlist.bookId));
  const targets = (payload.bookId ? await watched.where(eq(books.id, payload.bookId)) : await watched).map((row) => row.book);

  // Fast path: only refresh Aladin metadata, skip status checks.
  if (payload.coversOnly) {
    let filled = 0;
    for (const book of targets) {
      await enrichBook(db, book, true);
      filled += 1;
    }
    return Response.json({ enriched: filled, scanned: targets.length });
  }

  const results = [];
  for (const book of targets) results.push(await checkBook(db, book, Boolean(payload.bookId)));

  return Response.json({ checked: results.length });
}
