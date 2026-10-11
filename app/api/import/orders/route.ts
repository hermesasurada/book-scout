import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { books, purchases, watchlist } from "../../../../db/schema";
import { ensureBookForItem, matchEdition } from "../../../../lib/catalog";
import { type OrderLine, parseOrderCsv } from "../../../../lib/orderCsv";
import { samePurchaseExists } from "../../../../lib/purchaseImport";

// Import a purchase-history CSV into 내 서재. Each book is matched to its
// Aladin edition by title/author/publisher; a purchase already recorded for
// the same book and day (by mail sync or an earlier import) is skipped.
export async function POST(request: Request) {
  let parsed: { lines: OrderLine[]; skipped: string[] };
  try {
    parsed = parseOrderCsv(await request.text());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "파일을 읽지 못했습니다." }, { status: 400 });
  }
  const db = await getDb();
  const added: Array<{ title: string; purchasedAt: string; unwatched: boolean }> = [];
  const duplicates: string[] = [];
  const unmatched: string[] = [];

  for (const line of parsed.lines) {
    const match = await matchEdition({ title: line.title, author: line.author, publisher: line.publisher }).catch(() => null);
    const bookId = match ? await ensureBookForItem(db, match.itemId) : null;
    if (!bookId) {
      unmatched.push(`${line.purchasedAt} ${line.title}`);
      continue;
    }
    if (await samePurchaseExists(db, bookId, line.purchasedAt)) {
      duplicates.push(line.title);
      continue;
    }
    await db.insert(purchases).values({
      bookId,
      purchasedAt: line.purchasedAt,
      channel: line.channel,
      store: line.store,
      condition: line.condition,
      price: line.price,
      quantity: line.quantity,
      orderNo: line.orderNo,
      source: "import",
      sourceKey: `${line.purchasedAt}|${line.orderNo || line.store}|${bookId}`,
    });
    const removed = await db.delete(watchlist).where(eq(watchlist.bookId, bookId)).returning();
    const [book] = await db.select({ title: books.title }).from(books).where(eq(books.id, bookId));
    added.push({ title: book?.title ?? line.title, purchasedAt: line.purchasedAt, unwatched: removed.length > 0 });
  }
  return Response.json({ books: parsed.lines.length, skippedGoods: parsed.skipped, added, duplicates, unmatched });
}
