export type WatchedBook = {
  isbn13: string;
  title: string;
  author: string;
  publisher: string;
};

export type AladinSearchBook = WatchedBook & {
  cover: string;
  aladinLink: string;
  pubDate: string;
};

export type AladinCheck = {
  status: "in_stock" | "out_of_stock" | "unconfigured" | "error";
  store: string;
  price: number | null;
  link: string;
  error?: string;
};

export type UsedTier = { count: number; minPrice: number; link: string };

export type AladinDetail = {
  title: string;
  subTitle: string;
  originalTitle: string;
  author: string;
  publisher: string;
  pubDate: string;
  isbn13: string;
  isbn: string;
  categoryName: string;
  description: string;
  priceStandard: number | null;
  priceSales: number | null;
  mileage: number | null;
  reviewRank: number | null;
  page: number | null;
  packing: string;
  cover: string;
  link: string;
  usedAladin: UsedTier | null;
  usedUser: UsedTier | null;
  usedSpace: UsedTier | null;
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

const ALADIN_API = "https://www.aladin.co.kr/ttb/api";

function cleanAladinTitle(title: string) {
  return title.replace(/^\[중고\]\s*/, "").trim();
}

export async function searchAladin(query: string, key: string): Promise<AladinSearchBook[]> {
  const url = new URL(`${ALADIN_API}/ItemSearch.aspx`);
  url.search = new URLSearchParams({
    ttbkey: key,
    Query: query,
    QueryType: "Keyword",
    MaxResults: "12",
    start: "1",
    SearchTarget: "Book",
    output: "JS",
    Version: "20131101",
    Cover: "Big",
  }).toString();

  const response = await fetch(url, { headers: { "user-agent": "BookScout/1.0" } });
  if (!response.ok) throw new Error(`알라딘 검색 실패 (${response.status})`);
  const data = (await response.json()) as { errorMessage?: string; item?: Array<Record<string, unknown>> };
  if (data.errorMessage) throw new Error(data.errorMessage);

  return (data.item ?? [])
    .filter((item) => String(item.isbn13 ?? "").length === 13)
    .map((item) => ({
      isbn13: String(item.isbn13),
      title: cleanAladinTitle(String(item.title ?? "")),
      author: String(item.author ?? ""),
      publisher: String(item.publisher ?? ""),
      cover: String(item.cover ?? ""),
      aladinLink: String(item.link ?? ""),
      pubDate: String(item.pubDate ?? ""),
    }));
}

export async function lookupAladinBook(
  isbn: string,
  key: string | undefined,
): Promise<{ cover: string; link: string; pubDate: string } | null> {
  if (!key) return null;
  try {
    const url = new URL(`${ALADIN_API}/ItemLookUp.aspx`);
    url.search = new URLSearchParams({
      ttbkey: key,
      itemIdType: "ISBN13",
      ItemId: isbn,
      output: "JS",
      Version: "20131101",
      Cover: "Big",
    }).toString();
    const response = await fetch(url, { headers: { "user-agent": "BookScout/1.0" } });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      item?: Array<{ cover?: string; link?: string; pubDate?: string }>;
    };
    const item = data.item?.[0];
    if (!item) return null;
    return {
      cover: String(item.cover ?? ""),
      link: String(item.link ?? ""),
      pubDate: String(item.pubDate ?? ""),
    };
  } catch {
    return null;
  }
}

export async function lookupAladinDetail(
  isbn: string,
  key: string | undefined,
): Promise<AladinDetail | null> {
  if (!key) return null;
  const url = new URL(`${ALADIN_API}/ItemLookUp.aspx`);
  url.search = new URLSearchParams({
    ttbkey: key,
    itemIdType: "ISBN13",
    ItemId: isbn,
    output: "JS",
    Version: "20131101",
    Cover: "Big",
    OptResult: "usedList,packing",
  }).toString();
  const response = await fetch(url, { headers: { "user-agent": "BookScout/1.0" } });
  if (!response.ok) throw new Error(`알라딘 상세조회 실패 (${response.status})`);
  const data = (await response.json()) as {
    errorMessage?: string;
    item?: Array<Record<string, unknown>>;
  };
  if (data.errorMessage) throw new Error(data.errorMessage);
  const item = data.item?.[0];
  if (!item) return null;

  const num = (value: unknown): number | null => (typeof value === "number" && value > 0 ? value : null);
  const sub = (item.subInfo ?? {}) as Record<string, unknown>;
  const tier = (raw: unknown): UsedTier | null => {
    const t = raw as { itemCount?: number; minPrice?: number; link?: string } | undefined;
    if (!t || !t.itemCount) return null;
    return { count: Number(t.itemCount), minPrice: Number(t.minPrice ?? 0), link: String(t.link ?? "").replace(/&amp;/g, "&") };
  };
  const used = (sub.usedList ?? {}) as Record<string, unknown>;
  const packing = (sub.packing ?? {}) as { styleDesc?: string; weight?: number; sizeWidth?: number; sizeHeight?: number; sizeDepth?: number };
  const packingText = [
    packing.styleDesc && packing.styleDesc !== "미확인" ? packing.styleDesc : "",
    packing.weight ? `${packing.weight}g` : "",
    packing.sizeWidth ? `${packing.sizeWidth}×${packing.sizeHeight}×${packing.sizeDepth}mm` : "",
  ].filter(Boolean).join(" · ");

  return {
    title: String(item.title ?? ""),
    subTitle: String(sub.subTitle ?? ""),
    originalTitle: String(sub.originalTitle ?? ""),
    author: String(item.author ?? ""),
    publisher: String(item.publisher ?? ""),
    pubDate: String(item.pubDate ?? ""),
    isbn13: String(item.isbn13 ?? isbn),
    isbn: String(item.isbn ?? ""),
    categoryName: String(item.categoryName ?? ""),
    description: plainText(String(item.description ?? "")),
    priceStandard: num(item.priceStandard),
    priceSales: num(item.priceSales),
    mileage: num(item.mileage),
    reviewRank: typeof item.customerReviewRank === "number" ? item.customerReviewRank : null,
    page: num((sub as { itemPage?: number }).itemPage),
    packing: packingText,
    cover: String(item.cover ?? ""),
    link: String(item.link ?? ""),
    usedAladin: tier(used.aladinUsed),
    usedUser: tier(used.userUsed),
    usedSpace: tier(used.spaceUsed),
  };
}

// The used-store product page is server-rendered only for a browser-like agent.
const STORE_PAGE_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  "accept-language": "ko-KR,ko;q=0.9",
};

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

export async function checkAladinStore(
  book: WatchedBook,
  key: string | undefined,
  targetStore: string,
): Promise<AladinCheck> {
  if (!key) {
    return { status: "unconfigured", store: targetStore, price: null, link: "" };
  }

  try {
    const url = new URL(`${ALADIN_API}/ItemOffStoreList.aspx`);
    url.search = new URLSearchParams({
      ttbkey: key,
      itemIdType: "ISBN13",
      ItemId: book.isbn13,
      output: "JS",
      Version: "20131101",
    }).toString();
    const response = await fetch(url, { headers: { "user-agent": "BookScout/1.0" } });
    if (!response.ok) throw new Error(`알라딘 중고재고 조회 실패 (${response.status})`);
    const data = (await response.json()) as {
      errorMessage?: string;
      itemOffStoreList?: Array<{ offCode?: string; offName?: string; link?: string }>;
    };
    if (data.errorMessage) throw new Error(data.errorMessage);
    const wanted = targetStore.replace(/점$/, "").replace(/\s/g, "");
    const store = (data.itemOffStoreList ?? []).find((item) =>
      String(item.offName ?? "").replace(/점$/, "").replace(/\s/g, "").includes(wanted),
    );
    // ItemOffStoreList only lists stores that *carry* the title — it returns the
    // same ~14 major stores for many books and does not reflect on-hand copies.
    // The store's own product page is the only reliable per-store count.
    if (!store) return { status: "out_of_stock", store: targetStore, price: null, link: "" };
    const storeName = String(store.offName || targetStore);
    const storeLink = String(store.link ?? "").replace(/&amp;/g, "&");
    if (!storeLink) return { status: "out_of_stock", store: storeName, price: null, link: "" };

    const pageResponse = await fetch(storeLink, { headers: STORE_PAGE_HEADERS });
    if (!pageResponse.ok) throw new Error(`알라딘 매장재고 조회 실패 (${pageResponse.status})`);
    const { count, price } = parseStoreStock(await pageResponse.text());
    if (count <= 0) return { status: "out_of_stock", store: storeName, price: null, link: storeLink };
    return { status: "in_stock", store: storeName, price, link: storeLink };
  } catch (error) {
    return {
      status: "error",
      store: targetStore,
      price: null,
      link: "",
      error: error instanceof Error ? error.message : "알라딘 조회 오류",
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
