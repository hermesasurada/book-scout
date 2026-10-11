import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { books, purchases, watchlist } from "../../../db/schema";
import { today } from "../../../lib/readingInput";

const CHANNELS = ["aladin_online", "aladin_store", "other"];
const CONDITIONS = ["new", "used", "ebook"];

// Manual purchase (another store, a gift, a book already on the shelf).
export async function POST(request: Request) {
  const input = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const bookId = Number(input.bookId);
  if (!Number.isInteger(bookId) || bookId <= 0) return Response.json({ error: "도서가 필요합니다." }, { status: 400 });
  const purchasedAt = typeof input.purchasedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.purchasedAt) ? input.purchasedAt : today();
  const channel = CHANNELS.includes(String(input.channel)) ? String(input.channel) : "other";
  const condition = CONDITIONS.includes(String(input.condition)) ? String(input.condition) : "new";
  const price = input.price === "" || input.price == null ? null : Math.max(0, Math.round(Number(input.price))) || null;
  const db = await getDb();
  const [book] = await db.select({ id: books.id }).from(books).where(eq(books.id, bookId));
  if (!book) return Response.json({ error: "도서를 찾지 못했습니다." }, { status: 404 });
  const [purchase] = await db
    .insert(purchases)
    .values({ bookId, purchasedAt, channel, condition, price, store: String(input.store ?? "").slice(0, 100), source: "manual" })
    .returning();
  // Owned books are not watched.
  await db.delete(watchlist).where(eq(watchlist.bookId, bookId));
  return Response.json({ purchase }, { status: 201 });
}
