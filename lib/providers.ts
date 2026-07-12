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

export type LibraryCheck = {
  status: "available" | "loaned" | "not_found" | "other_edition" | "error";
  dueDate: string;
  location: string;
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
    if (!store) return { status: "out_of_stock", store: targetStore, price: null, link: "" };

    let price: number | null = null;
    let detailLink = String(store.link ?? "");
    if (store.offCode) {
      const detailUrl = new URL(`${ALADIN_API}/ItemLookUp.aspx`);
      detailUrl.search = new URLSearchParams({
        ttbkey: key,
        itemIdType: "ISBN13",
        ItemId: book.isbn13,
        offCode: store.offCode,
        output: "JS",
        Version: "20131101",
      }).toString();
      const detailResponse = await fetch(detailUrl, { headers: { "user-agent": "BookScout/1.0" } });
      if (detailResponse.ok) {
        const detail = (await detailResponse.json()) as {
          item?: Array<{ subInfo?: { offStoreInfo?: { minPrice?: number; link?: string } } }>;
        };
        const info = detail.item?.[0]?.subInfo?.offStoreInfo;
        price = typeof info?.minPrice === "number" ? info.minPrice : null;
        detailLink = info?.link || detailLink;
      }
    }
    return {
      status: "in_stock",
      store: String(store.offName || targetStore),
      price,
      link: detailLink,
    };
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

export function parseYonginLibrary(html: string, book: WatchedBook): LibraryCheck {
  const chunks = html.split(/<li(?:\s|>)/i).slice(1);
  const exact = chunks.find((chunk) => chunk.includes(`'${book.isbn13}'`) || chunk.includes(`\"${book.isbn13}\"`));
  const titleNeedle = book.title.replace(/[:：].*$/, "").replace(/\s+/g, "").toLowerCase();
  const sameTitle = chunks.find((chunk) => plainText(chunk).replace(/\s+/g, "").toLowerCase().includes(titleNeedle));
  const chosen = exact ?? sameTitle;
  if (!chosen) return { status: "not_found", dueDate: "", location: "" };

  const text = plainText(chosen);
  const dueDate = text.match(/반납예정일:\s*([0-9.\-]+)/)?.[1] ?? "";
  const location = text.match(/(\[보정\][^\s]+)/)?.[1] ?? "";
  const available = /대출가능\s*\(비치중\)/.test(text);
  const loaned = /대출불가|대출중|상호대차중/.test(text);
  if (!exact) return { status: "other_edition", dueDate, location };
  return { status: available ? "available" : loaned ? "loaned" : "not_found", dueDate, location };
}

export async function checkBojeongLibrary(book: WatchedBook): Promise<LibraryCheck> {
  try {
    const url = new URL("https://lib.yongin.go.kr/bojeong/menu/14328/program/30012/plusSearchResultList.do");
    url.search = new URLSearchParams({
      searchType: "SIMPLE",
      searchCategory: "BOOK",
      searchKey: "TITLE",
      searchKeyword: book.title.replace(/\s*[-–—].*$/, "").trim(),
      searchLibraryArr: "NU",
    }).toString();
    const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 BookScout/1.0" } });
    if (!response.ok) throw new Error(`보정도서관 조회 실패 (${response.status})`);
    return parseYonginLibrary(await response.text(), book);
  } catch (error) {
    return {
      status: "error",
      dueDate: "",
      location: "",
      error: error instanceof Error ? error.message : "도서관 조회 오류",
    };
  }
}
