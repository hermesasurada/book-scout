// Purchase-history CSV (e.g. the one a Grok agent compiled from Gmail):
// 주문일, 주문번호, 도서명, 저자/출판사, 수량, 단가, 배송비, 할인/적립금, 결제금액, 상태
// Store purchases carry "중고매장(분당서현점)" in place of an order number.
// Rows without 저자/출판사 are goods (gifts, envelopes, e-book cash) and skipped.
import { parseCsv } from "./csv";

export type OrderLine = {
  purchasedAt: string;
  orderNo: string;
  channel: "aladin_online" | "aladin_store";
  store: string;
  title: string;
  author: string;
  publisher: string;
  quantity: number;
  /** Line total (단가 × 수량). */
  price: number | null;
  condition: "new" | "used";
};

const number = (value: string | undefined) => {
  const parsed = Number((value ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export function parseOrderCsv(text: string): { lines: OrderLine[]; skipped: string[] } {
  const rows = parseCsv(text);
  const header = rows[0]?.map((cell) => cell.trim()) ?? [];
  const col = (name: string) => header.indexOf(name);
  if (col("주문일") < 0 || col("도서명") < 0 || col("저자/출판사") < 0) {
    throw new Error("구매내역 CSV 형식이 아닙니다 (주문일·도서명·저자/출판사 열이 없음).");
  }
  const get = (cells: string[], name: string) => (col(name) >= 0 ? (cells[col(name)] ?? "").trim() : "");
  const lines: OrderLine[] = [];
  const skipped: string[] = [];
  for (const cells of rows.slice(1)) {
    const rawTitle = get(cells, "도서명");
    const byline = get(cells, "저자/출판사");
    const date = get(cells, "주문일");
    if (!rawTitle) continue;
    if (!byline || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      skipped.push(rawTitle);
      continue;
    }
    const order = get(cells, "주문번호");
    const store = order.match(/^중고매장\((.+)\)$/)?.[1] ?? "";
    // "저자 / 출판사"; a lone name (e.g. "Kingfisher") may be either, so it is
    // offered to the matcher as both.
    const cut = byline.lastIndexOf(" / ");
    const quantity = number(get(cells, "수량")) ?? 1;
    const unit = number(get(cells, "단가"));
    lines.push({
      purchasedAt: date,
      orderNo: store ? "" : order,
      channel: store ? "aladin_store" : "aladin_online",
      store,
      title: rawTitle.replace(/^(\[중고\]|\(할인상품\))\s*/, "").replace(/\s*\(원서\)\s*$/, "").trim(),
      author: cut >= 0 ? byline.slice(0, cut).trim() : byline,
      publisher: cut >= 0 ? byline.slice(cut + 3).trim() : byline,
      quantity,
      price: unit ? unit * quantity : null,
      condition: /^\[중고\]/.test(rawTitle) ? "used" : "new",
    });
  }
  return { lines, skipped };
}
