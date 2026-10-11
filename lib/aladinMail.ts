// Aladin purchase e-mails → purchase lines.
// - 온라인 주문: subject "…주문을 접수하였습니다." — 주문일, 주문번호, item table
// - 중고매장:   subject "…중고매장 구매내용을 알려드립니다." — "YYYY-MM-DD, {매장}에서 구매"
// Item rows link each product as wproduct.aspx?ItemId=…, so no title matching
// is needed. Shipping notices repeat the items and are ignored by subject.

export type MailKind = "online" | "store";

export type PurchaseLine = {
  itemId: string;
  title: string;
  quantity: number;
  /** Line total as printed (unit price × quantity). */
  price: number | null;
  condition: "new" | "used" | "ebook";
};

export type ParsedPurchaseMail = {
  kind: MailKind;
  purchasedAt: string;
  orderNo: string;
  store: string;
  lines: PurchaseLine[];
};

export function mailKind(subject: string): MailKind | null {
  if (/주문을\s*접수/.test(subject)) return "online";
  if (/중고매장\s*구매내용/.test(subject)) return "store";
  return null;
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

function text(html: string) {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/[ \t\r\f\v]+/g, " ").trim();
}

const pad = (value: string | number) => String(value).padStart(2, "0");

export function parsePurchaseMail(subject: string, html: string, fallbackDate: string): ParsedPurchaseMail | null {
  const kind = mailKind(subject);
  if (!kind) return null;
  const body = text(html);

  let purchasedAt = fallbackDate;
  let store = "";
  let orderNo = "";
  if (kind === "store") {
    const match = body.match(/(\d{4}-\d{2}-\d{2}),\s*([^\s]+?)에서\s*구매/);
    if (match) {
      purchasedAt = match[1];
      store = match[2];
    }
  } else {
    const date = body.match(/주문일\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
    if (date) purchasedAt = `${date[1]}-${pad(date[2])}-${pad(date[3])}`;
    orderNo = body.match(/주문번호\s*([0-9A-Z-]{6,})/)?.[1] ?? "";
  }

  const lines: PurchaseLine[] = [];
  for (const row of html.split(/<tr[\s>]/i).slice(1)) {
    const link = row.match(/wproduct\.aspx\?ItemId=(\d+)[^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const title = text(link[2]);
    const after = row.slice((link.index ?? 0) + link[0].length);
    const quantity = Number(after.match(/<strong[^>]*>\s*([\d,]+)\s*<\/strong>\s*(?:권|개|부|매|장)/)?.[1]?.replace(/,/g, "") ?? 1);
    const priceText = after.match(/<strong[^>]*>\s*([\d,]+)\s*<\/strong>\s*원/)?.[1];
    const price = priceText ? Number(priceText.replace(/,/g, "")) : null;
    const condition = /^\[중고\]/.test(title) ? "used" : /^\[eBook\]/i.test(title) ? "ebook" : "new";
    lines.push({ itemId: link[1], title: title.replace(/^\[[^\]]+\]\s*/, ""), quantity: quantity || 1, price, condition });
  }
  return { kind, purchasedAt, orderNo, store, lines };
}
