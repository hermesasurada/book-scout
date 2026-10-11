// Turn a parsed Aladin purchase mail into purchase rows. Owned books stop
// being watched — there is nothing left to find for them.
import { and, eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import type { ParsedPurchaseMail } from "./aladinMail";
import { ensureBookForItem } from "./catalog";

type Db = DrizzleD1Database<typeof schema>;
const { books, mailImports, purchases, watchlist } = schema;

// One purchase per book per day: the same order can arrive from the mail sync
// and from an imported purchase list.
export async function samePurchaseExists(db: Db, bookId: number, purchasedAt: string) {
  const [row] = await db
    .select({ id: purchases.id })
    .from(purchases)
    .where(and(eq(purchases.bookId, bookId), eq(purchases.purchasedAt, purchasedAt)))
    .limit(1);
  return Boolean(row);
}

export type RecordedPurchase = { bookId: number; title: string; purchasedAt: string; unwatched: boolean };

export async function recordPurchaseMail(db: Db, messageId: string, mail: ParsedPurchaseMail): Promise<RecordedPurchase[]> {
  const recorded: RecordedPurchase[] = [];
  for (const line of mail.lines) {
    // Non-book goods (envelopes, bags) have no ISBN and are skipped.
    const bookId = await ensureBookForItem(db, line.itemId);
    if (!bookId) continue;
    // Already recorded from another source (e.g. a purchase-history CSV).
    if (await samePurchaseExists(db, bookId, mail.purchasedAt)) continue;
    const inserted = await db
      .insert(purchases)
      .values({
        bookId,
        purchasedAt: mail.purchasedAt,
        channel: mail.kind === "store" ? "aladin_store" : "aladin_online",
        store: mail.store,
        condition: line.condition,
        price: line.price,
        quantity: line.quantity,
        orderNo: mail.orderNo,
        source: "gmail",
        sourceKey: `${messageId}:${line.itemId}`,
      })
      .onConflictDoNothing()
      .returning({ id: purchases.id });
    if (!inserted.length) continue;
    const removed = await db.delete(watchlist).where(eq(watchlist.bookId, bookId)).returning({ bookId: watchlist.bookId });
    const [book] = await db.select({ title: books.title }).from(books).where(eq(books.id, bookId));
    recorded.push({ bookId, title: book?.title ?? line.title, purchasedAt: mail.purchasedAt, unwatched: removed.length > 0 });
  }
  await db
    .insert(mailImports)
    .values({ messageId, kind: mail.kind, purchasedAt: mail.purchasedAt, lines: recorded.length })
    .onConflictDoNothing();
  return recorded;
}
