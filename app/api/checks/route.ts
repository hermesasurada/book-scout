import { env } from "cloudflare:workers";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { books, checks } from "../../../db/schema";
import { checkAladinStore, checkBojeongLibrary } from "../../../lib/providers";

type RuntimeEnv = { ALADIN_TTB_KEY?: string; ALADIN_STORE_NAME?: string; DAILY_CHECK_TOKEN?: string };

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
  const payload = (await request.json().catch(() => ({}))) as { bookId?: number };
  const db = await getDb();
  const targets = payload.bookId
    ? await db.select().from(books).where(eq(books.id, payload.bookId))
    : await db.select().from(books);

  const results = [];
  for (const book of targets) {
    const [aladin, library] = await Promise.all([
      checkAladinStore(book, runtime.ALADIN_TTB_KEY, runtime.ALADIN_STORE_NAME || "서현점"),
      checkBojeongLibrary(book),
    ]);
    const error = [aladin.error, library.error].filter(Boolean).join(" / ");
    const [saved] = await db
      .insert(checks)
      .values({
        bookId: book.id,
        aladinStatus: aladin.status,
        aladinStore: aladin.store,
        aladinPrice: aladin.price,
        aladinLink: aladin.link,
        libraryStatus: library.status,
        libraryDueDate: library.dueDate,
        libraryLocation: library.location,
        error,
      })
      .returning();
    results.push(saved);
  }
  return Response.json({ checked: results.length, results });
}
