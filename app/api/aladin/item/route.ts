import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { books } from "../../../../db/schema";
import { aladinItemIdFromLink, findAladinItemId, lookupAladinProduct } from "../../../../lib/providers";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  let itemId = params.get("itemId")?.trim() ?? "";
  const isbn = params.get("isbn")?.trim() ?? "";
  if (!/^\d+$/.test(itemId)) itemId = "";

  // Fall back to the stored row (or a site search) when only an ISBN is given.
  if (!itemId && /^\d{13}$/.test(isbn)) {
    const db = await getDb();
    const [row] = await db.select({ itemId: books.aladinItemId, link: books.aladinLink }).from(books).where(eq(books.isbn13, isbn));
    itemId = row?.itemId || aladinItemIdFromLink(row?.link) || (await findAladinItemId(isbn));
  }
  if (!itemId) return Response.json({ error: "알라딘 상품을 찾지 못했습니다." }, { status: 404 });

  try {
    const detail = await lookupAladinProduct(itemId);
    if (!detail) return Response.json({ error: "알라딘에서 도서 정보를 찾지 못했습니다." }, { status: 404 });
    return Response.json({ detail });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "정보를 불러오지 못했습니다." }, { status: 502 });
  }
}
