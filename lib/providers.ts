export type WatchedBook = {
  isbn13: string;
  title: string;
  author: string;
  publisher: string;
  aladinItemId?: string | null;
  aladinLink?: string | null;
};

// Send a plain notification via the Telegram Bot API. No-op (returns false) when
// the bot token or chat id is not configured.
export async function sendTelegram(
  token: string | undefined,
  chatId: string | undefined,
  text: string,
): Promise<boolean> {
  if (!token || !chatId) return false;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export type AladinSearchBook = {
  isbn13: string;
  itemId: string;
  title: string;
  author: string;
  publisher: string;
  cover: string;
  aladinLink: string;
  pubDate: string;
  priceStandard: number | null;
  priceSales: number | null;
  salesPoint: number | null;
  reviewRank: number | null;
};

export type AladinProduct = {
  itemId: string;
  isbn13: string;
  isbn: string;
  title: string;
  subTitle: string;
  originalTitle: string;
  author: string;
  publisher: string;
  pubDate: string;
  categoryName: string;
  description: string;
  priceStandard: number | null;
  priceSales: number | null;
  salesPoint: number | null;
  reviewRank: number | null;
  reviewCount: number | null;
  page: number | null;
  packing: string;
  cover: string;
  link: string;
};

export type AladinCheck = {
  status: "in_stock" | "out_of_stock" | "unconfigured" | "error";
  store: string;
  price: number | null;
  link: string;
  error?: string;
};

export type LibraryCheck = {
  status:
    | "available"
    | "loaned"
    | "not_found"
    | "other_available"
    | "other_loaned"
    | "other_edition"
    | "error";
  dueDate: string;
  location: string;
  link: string;
  error?: string;
};

// ---------------------------------------------------------------------------
// Aladin — scraped from the public website. The TTB OpenAPI is being retired,
// so search, product metadata and store stock all come from HTML pages now.
// ---------------------------------------------------------------------------

const ALADIN_WEB = "https://www.aladin.co.kr";
// Aladin serves the full server-rendered page only to a browser-like agent.
const WEB_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  "accept-language": "ko-KR,ko;q=0.9",
};

export function aladinProductLink(itemId: string) {
  return `${ALADIN_WEB}/shop/wproduct.aspx?ItemId=${itemId}`;
}

export function aladinItemIdFromLink(link: string | null | undefined): string {
  return (link ?? "").match(/ItemId=(\d+)/i)?.[1] ?? "";
}

async function fetchWeb(url: string): Promise<string> {
  const response = await fetch(url, { headers: WEB_HEADERS });
  if (!response.ok) throw new Error(`알라딘 페이지 조회 실패 (${response.status})`);
  return response.text();
}

function toNumber(value: string | undefined | null): number | null {
  if (!value) return null;
  const n = Number(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function metaContent(html: string, name: string): string {
  const match = html.match(
    new RegExp(`<meta[^>]+(?:property|name|itemprop)="${name}"[^>]+content="([^"]*)"`, "i"),
  );
  return decodeHtml(match?.[1] ?? "").trim();
}

// Aladin keys list items by ISBN10; the app keys books by ISBN13.
export function isbn10to13(isbn10: string): string {
  const core = isbn10.replace(/[^\dXx]/g, "");
  if (core.length === 13) return core;
  if (core.length !== 10) return "";
  const body = `978${core.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  return body + String((10 - (sum % 10)) % 10);
}

function cleanAladinTitle(title: string) {
  return title.replace(/^\[중고\]\s*/, "").trim();
}

// Each search result is a `ss_book_box` block carrying itemId, the front
// cover, title/subtitle anchors and a "author | publisher | YYYY년 M월 price"
// text line.
export function parseAladinSearch(html: string): AladinSearchBook[] {
  const blocks = html.split(/class="ss_book_box"/i).slice(1);
  const results: AladinSearchBook[] = [];
  for (const raw of blocks) {
    const block = raw.slice(0, raw.indexOf('class="ss_book_box"') > 0 ? raw.indexOf('class="ss_book_box"') : undefined);
    const itemId = block.match(/^[^>]*itemId="(\d+)"/i)?.[1] ?? "";
    const isbnRaw = block.match(/AddBook=(\d{10,13})/)?.[1] ?? block.match(/[?&]ISBN=(\d{10,13})/)?.[1] ?? "";
    const isbn13 = isbn10to13(isbnRaw);
    if (!itemId || !isbn13) continue;
    const main = decodeHtml(block.match(/class="bo3"[^>]*>([^<]*)</)?.[1] ?? "").trim();
    const sub = decodeHtml(block.match(/class="ss_f_g2"[^>]*>([^<]*)</)?.[1] ?? "").trim();
    const title = cleanAladinTitle(sub ? `${main} ${sub}`.replace(/\s+/g, " ") : main);
    const cover =
      block.match(/<img[^>]*src="([^"]+)"[^>]*class="front_cover"/)?.[1] ??
      block.match(/https:\/\/image\.aladin\.co\.kr\/product\/[^"']*cover\d*\/[^"']+/)?.[0] ??
      "";
    const text = plainText(block);
    const titleAt = text.indexOf(main);
    const afterTitle = titleAt >= 0 ? text.slice(titleAt + main.length) : text;
    const afterSub = sub && afterTitle.indexOf(sub) >= 0 ? afterTitle.slice(afterTitle.indexOf(sub) + sub.length) : afterTitle;
    const segments = afterSub.split("|").map((s) => s.trim());
    // Some listings prefix a series tag ("ㅣ 시리즈명 (2019년) ") before the authors.
    const author = (segments[0] ?? "").replace(/^ㅣ\s*.*?\(\d{4}년\)\s*/, "").trim();
    const publisher = segments[1] ?? "";
    const dateMatch = afterSub.match(/(\d{4})년\s*(\d{1,2})월/);
    const pubDate = dateMatch ? `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}` : "";
    const priceMatch = afterSub.match(/([\d,]+)\s*원\s*→\s*([\d,]+)\s*원/) ?? afterSub.match(/([\d,]+)\s*원/);
    const priceStandard = toNumber(priceMatch?.[1]);
    const priceSales = priceMatch && priceMatch[2] ? toNumber(priceMatch[2]) : priceStandard;
    const rating = afterSub.match(/(\d+(?:\.\d)?)\s*\(\s*\d+\s*\)\s*\|?\s*세일즈포인트/)?.[1];
    const salesPoint = toNumber(afterSub.match(/세일즈포인트\s*:\s*([\d,]+)/)?.[1]);
    results.push({
      isbn13,
      itemId,
      title,
      author,
      publisher,
      cover,
      aladinLink: aladinProductLink(itemId),
      pubDate,
      priceStandard,
      priceSales,
      salesPoint,
      reviewRank: rating ? Math.round(Number(rating)) : null,
    });
  }
  return results;
}

export async function searchAladin(query: string): Promise<AladinSearchBook[]> {
  const url = `${ALADIN_WEB}/search/wsearchresult.aspx?SearchTarget=Book&SearchWord=${encodeURIComponent(query)}`;
  return parseAladinSearch(await fetchWeb(url)).slice(0, 12);
}

// Resolve an ItemId for a bare ISBN (bulk-imported rows) by searching the site.
export async function findAladinItemId(isbn13: string): Promise<string> {
  try {
    const hits = await searchAladin(isbn13);
    return hits.find((hit) => hit.isbn13 === isbn13)?.itemId ?? hits[0]?.itemId ?? "";
  } catch {
    return "";
  }
}

// Product page: og:/JSON-LD carry ISBN, cover, price, rating; the byline block
// ("Ere_sub2_title") carries authors, publisher, exact date and original title.
export function parseAladinProduct(html: string, itemId: string): AladinProduct | null {
  const isbn13 = metaContent(html, "books:isbn") || metaContent(html, "og:barcode");
  if (!isbn13) return null;
  const text = plainText(html);
  const ogTitle = metaContent(html, "og:title");
  const title = cleanAladinTitle(ogTitle.split("|")[0].trim());

  const bylineAt = html.indexOf("Ere_sub2_title");
  const byline = bylineAt >= 0 ? plainText(html.slice(bylineAt, bylineAt + 1200)) : "";
  const pubDate = metaContent(html, "datePublished") || byline.match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
  let author = metaContent(html, "og:author");
  let publisher = "";
  if (pubDate && byline.includes(pubDate)) {
    const before = byline.slice(0, byline.indexOf(pubDate)).replace(/^Ere_sub2_title"?>?\s*/, "").trim();
    const lastParen = before.lastIndexOf(")");
    if (lastParen >= 0) {
      author = before.slice(0, lastParen + 1).trim();
      publisher = before.slice(lastParen + 1).trim();
    } else {
      publisher = before.split(/\s{2,}/).pop()?.trim() ?? "";
    }
  }
  // The original title is an anchor whose text reads "원제 : <title>".
  const originalTitle = decodeHtml(
    html.slice(bylineAt, bylineAt + 2500).match(/<a[^>]*>\s*원제\s*[:：]\s*([^<]+)<\/a>/)?.[1] ?? "",
  ).trim();
  const firstAuthor = author.split(/[,(]/)[0].trim();
  const subTitle =
    title && firstAuthor
      ? text.match(new RegExp(`${escapeRegExp(title)}\\s*-\\s*(.+?)\\s+${escapeRegExp(firstAuthor)}`))?.[1]?.trim() ?? ""
      : "";

  const categoryRaw = text.match(/(국내도서(?:\s*>\s*[^>|]+?)+)\s*접기/)?.[1] ?? "";
  const categoryName = categoryRaw.split(">").map((s) => s.trim()).filter(Boolean).join(">");

  const ratingValue = html.match(/"ratingValue"\s*:\s*"?([\d.]+)"?/)?.[1] ?? metaContent(html, "books:rating:value");
  const reviewCount = html.match(/"reviewCount"\s*:\s*"?(\d+)"?/)?.[1];
  const page = toNumber(text.match(/(\d+)쪽/)?.[1]);
  const size = text.match(/(\d+)\s*\*\s*(\d+)\s*mm/);
  const weight = text.match(/(\d+)\s*g\b/)?.[1];
  const packing = [size ? `${size[1]}×${size[2]}mm` : "", weight ? `${weight}g` : ""].filter(Boolean).join(" · ");

  return {
    itemId,
    isbn13,
    isbn: html.match(/[?&]ISBN=(\d{10})\b/)?.[1] ?? "",
    title,
    subTitle,
    originalTitle,
    author,
    publisher,
    pubDate,
    categoryName,
    description: metaContent(html, "og:description"),
    priceStandard: toNumber(text.match(/정가\s*[:：]?\s*([\d,]+)\s*원/)?.[1]),
    priceSales: toNumber(metaContent(html, "og:price")),
    salesPoint: toNumber(text.match(/Sales\s*Point\s*[:：]?\s*\|?\s*([\d,]+)/i)?.[1]),
    reviewRank: ratingValue ? Math.round(Number(ratingValue)) : null,
    reviewCount: reviewCount ? Number(reviewCount) : null,
    page,
    packing,
    cover: metaContent(html, "og:image"),
    link: aladinProductLink(itemId),
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function lookupAladinProduct(itemId: string): Promise<AladinProduct | null> {
  if (!/^\d+$/.test(itemId)) return null;
  return parseAladinProduct(await fetchWeb(aladinProductLink(itemId)), itemId);
}

// Parse a used-store product page for the on-hand copy count and lowest copy
// price. The stock reads as `<b>재고 </b>:<span ...><b> 2부</b></span>`; copy
// prices appear as `16,800원`.
function parseStoreStock(html: string): { count: number; price: number | null } {
  const stockMatch = html.match(/재고[\s\S]{0,40}?([0-9,]+)\s*부/);
  const count = stockMatch ? Number(stockMatch[1].replace(/,/g, "")) : 0;
  if (!count) return { count: 0, price: null };
  const prices = [...html.matchAll(/([0-9,]+)\s*원/g)]
    .map((match) => Number(match[1].replace(/,/g, "")))
    .filter((value) => value > 0);
  return { count, price: prices.length ? Math.min(...prices) : null };
}

// Per-store stock comes straight from the store's product page, addressed by
// the Aladin ItemId plus the store's OffCode (e.g. "Bundang" = 분당서현점).
export async function checkAladinStore(
  book: WatchedBook,
  storeCode: string,
  storeName: string,
): Promise<AladinCheck> {
  const itemId = book.aladinItemId || aladinItemIdFromLink(book.aladinLink);
  if (!itemId) {
    return { status: "error", store: storeName, price: null, link: "", error: "알라딘 ItemId 없음" };
  }
  const storeLink = `${ALADIN_WEB}/usedstore/wproduct.aspx?ItemId=${itemId}&OffCode=${encodeURIComponent(storeCode)}`;
  try {
    const { count, price } = parseStoreStock(await fetchWeb(storeLink));
    if (count <= 0) return { status: "out_of_stock", store: storeName, price: null, link: storeLink };
    return { status: "in_stock", store: storeName, price, link: storeLink };
  } catch (error) {
    return {
      status: "error",
      store: storeName,
      price: null,
      link: storeLink,
      error: error instanceof Error ? error.message : "알라딘 매장 조회 오류",
    };
  }
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function plainText(html: string) {
  return decodeHtml(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

type LibraryItem = {
  isbns: string[];
  title: string;
  available: boolean;
  loaned: boolean;
  dueDate: string;
  location: string;
  link: string;
};

const LIB_RESULT = "https://lib.yongin.go.kr/bojeong/menu/14328/program/30012/plusSearchResultList.do";
const LIB_DETAIL = "https://lib.yongin.go.kr/bojeong/menu/14328/program/30012/plusSearchResultDetail.do";
const LIB_HEADERS = { "user-agent": "Mozilla/5.0 BookScout/1.0" };

// Reduce a title to its core for equality checks: drop the subtitle (after a
// colon) and any edition/format suffix (after a dash or opening paren), then
// strip whitespace and lowercase. "노예의 길: 사회주의…" and "노예의 길 (반양장)"
// both normalize to "노예의길".
function coreTitle(title: string): string {
  return title.split(/[:：\-–—(]/)[0].replace(/\s+/g, "").toLowerCase();
}

// Aladin returns authors as "홍길동 지음, 김철수 옮김"; the library's author
// field only holds the primary author, so strip roles and co-authors.
function primaryAuthor(author: string): string {
  return author
    .replace(/\s*(지음|옮김|엮음|편저|편역|편|저|글·그림|글·사진|글|그림|사진|감수|해설)\b[\s\S]*$/, "")
    .split(/[,;·]/)[0]
    .trim();
}

// Build the detail-page deep link from a result item's checkbox value, which
// encodes "recKey^bookKey^publishFormCode".
function detailLink(checkboxValue: string | undefined): string {
  if (!checkboxValue) return "";
  const [recKey, bookKey, form] = checkboxValue.split("^");
  if (!recKey || !bookKey) return "";
  return `${LIB_DETAIL}?${new URLSearchParams({ recKey, bookKey, publishFormCode: form || "BO" })}`;
}

// The advanced ("DETAIL") search honors ISBN only in slot 5 and lets us AND a
// title with an author for verification. All five condition slots must be sent.
function librarySearchUrl(fields: {
  key1?: string;
  kw1?: string;
  key2?: string;
  kw2?: string;
  kw5?: string;
}): string {
  const params = new URLSearchParams({
    searchType: "DETAIL",
    searchCategory: "BOOK",
    searchKey1: fields.key1 ?? "TITLE",
    searchKeyword1: fields.kw1 ?? "",
    searchOperator1: "AND",
    searchKey2: fields.key2 ?? "AUTHOR",
    searchKeyword2: fields.kw2 ?? "",
    searchOperator2: "AND",
    searchKey3: "PUBLISHER",
    searchKeyword3: "",
    searchOperator3: "AND",
    searchKey4: "KEYWORD",
    searchKeyword4: "",
    searchOperator4: "AND",
    searchKey5: "ISBN",
    searchKeyword5: fields.kw5 ?? "",
    searchOperator5: "AND",
    searchPublishStartYear: "",
    searchPublishEndYear: "",
    searchSort: "SIMILAR",
    searchOrder: "DESC",
    searchRecordCount: "20",
    searchLibrary: "NU",
    searchLibraryArr: "NU",
  });
  return `${LIB_RESULT}?${params}`;
}

// Real search results live inside `<div class="bookArea">` blocks. Everything
// else on the page — the recent-search box, the "0건" result header, the
// "검색결과가 없습니다" notice — echoes the query keyword verbatim, so any
// title-substring match against the whole page falsely reports a hit. Parsing
// only bookArea blocks (each of which carries its own ISBN) avoids that.
export function parseLibraryItems(html: string): LibraryItem[] {
  return html
    .split(/<div class="bookArea">/i)
    .slice(1)
    .map((raw) => {
      const text = plainText(raw);
      return {
        isbns: [...raw.matchAll(/97[89]\d{10}/g)].map((match) => match[0]),
        // The item text begins with the full title, repeated once before the
        // "도서" kind marker; take the part before it as the result's title.
        title: text.split(/\s도서\s/)[0] ?? "",
        available: /대출가능\s*\(비치중\)/.test(text),
        loaned: /대출불가|대출중|상호대차중/.test(text),
        dueDate: text.match(/반납예정일:\s*([0-9.\-]+)/)?.[1] ?? "",
        location: text.match(/\[보정\]([^\s]+)/)?.[1] ?? "",
        link: detailLink(raw.match(/name="check"\s+value="([^"]+)"/)?.[1]),
      };
    })
    // Drop large-print editions ("큰글자책"/"큰활자") — a separate physical book
    // the user isn't watching; if only those match, the book counts as absent.
    .filter((item) => item.isbns.length > 0 && !/큰글자|큰활자/.test(item.title));
}

async function fetchLibrary(url: string): Promise<LibraryItem[]> {
  const response = await fetch(url, { headers: LIB_HEADERS });
  if (!response.ok) throw new Error(`도서관 조회 실패 (${response.status})`);
  return parseLibraryItems(await response.text());
}

export async function checkBojeongLibrary(book: WatchedBook): Promise<LibraryCheck> {
  try {
    // 1) Exact ISBN match first — the most accurate signal.
    const byIsbn = (await fetchLibrary(librarySearchUrl({ key1: "", key2: "", kw5: book.isbn13 })))
      .filter((item) => item.isbns.includes(book.isbn13));
    if (byIsbn.length > 0) {
      const availableCopy = byIsbn.find((item) => item.available);
      if (availableCopy) {
        return { status: "available", dueDate: "", location: availableCopy.location, link: availableCopy.link };
      }
      const loanedCopy = byIsbn.find((item) => item.loaned) ?? byIsbn[0];
      return {
        status: loanedCopy.loaned ? "loaned" : "not_found",
        dueDate: loanedCopy.dueDate,
        location: loanedCopy.location,
        link: loanedCopy.link,
      };
    }

    // 2) No exact edition: search by title, verified by author so a shared
    //    keyword ("스타벅스") doesn't count as a different edition of our book.
    const author = primaryAuthor(book.author);
    const byTitle = await fetchLibrary(
      librarySearchUrl({
        key1: "TITLE",
        kw1: book.title.replace(/\s*[-–—(].*$/, "").trim(),
        key2: author ? "AUTHOR" : "",
        kw2: author,
      }),
    );
    const wanted = coreTitle(book.title);
    const sameWork = byTitle.filter((item) => coreTitle(item.title) === wanted);
    if (sameWork.length === 0) return { status: "not_found", dueDate: "", location: "", link: "" };

    // Report the alternate edition's real availability and deep link so the user
    // can act on it, preferring an on-shelf copy over a loaned one.
    const availableAlt = sameWork.find((item) => item.available);
    if (availableAlt) {
      return { status: "other_available", dueDate: "", location: availableAlt.location, link: availableAlt.link };
    }
    const loanedAlt = sameWork.find((item) => item.loaned) ?? sameWork[0];
    return {
      status: loanedAlt.loaned ? "other_loaned" : "other_edition",
      dueDate: loanedAlt.dueDate,
      location: loanedAlt.location,
      link: loanedAlt.link,
    };
  } catch (error) {
    return {
      status: "error",
      dueDate: "",
      location: "",
      link: "",
      error: error instanceof Error ? error.message : "도서관 조회 오류",
    };
  }
}
