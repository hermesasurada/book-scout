import { getDb } from "../../../../db";
import { ensureBookForItem } from "../../../../lib/catalog";

// Catalog row for an Aladin search hit (by ItemId) — used before starting a
// reading or recording a purchase from search results.
export async function POST(request: Request) {
  const { itemId } = (await request.json().catch(() => ({}))) as { itemId?: string };
  if (!itemId || !/^\d+$/.test(itemId)) return Response.json({ error: "알라딘 상품 번호가 필요합니다." }, { status: 400 });
  const db = await getDb();
  const bookId = await ensureBookForItem(db, itemId);
  if (!bookId) return Response.json({ error: "알라딘에서 도서 정보를 찾지 못했습니다." }, { status: 404 });
  return Response.json({ bookId });
}
