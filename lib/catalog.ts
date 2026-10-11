// Edition catalog helpers shared by imports: find the Aladin edition for a
// title/author, and make sure a `books` row exists for an Aladin ItemId.
import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { type AladinProduct, aladinProductLink, type AladinSearchBook, lookupAladinProduct, searchAladin } from "./providers";

type Db = DrizzleD1Database<typeof schema>;
const { books } = schema;

// Title core for comparison: drop subtitles/edition notes after " - ", ":" or
// "(", then whitespace and punctuation. Volume numbers stay ("방해자 1").
export function coreTitle(title: string) {
  return title
    .replace(/\\(.)/g, "$1")
    .replace(/^\s*\[[^\]]*\]\s*/, "")
    .split(/\s[-–—]\s|[:：(\[/]/)[0]
    .replace(/[\s.,·!?'"‘’“”~\-–—]/g, "")
    .toLowerCase();
}

function fullTitle(title: string) {
  return title.replace(/[\s.,·!?'"‘’“”~:：()\[\]\-–—]/g, "").toLowerCase();
}

// "피터 린치, 존 로스차일드 (지은이), 고영태 (옮긴이)" / "마크 오언|케빈 모러" → names.
export function authorNames(author: string) {
  return author
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s(지음|옮김|엮음|편저|편역|감수|그림|글)(?=[\s,]|$)/g, " ")
    .split(/[,|·/]/)
    .map((name) => name.replace(/\s+/g, "").toLowerCase())
    .filter((name) => name.length >= 2);
}

function publisherKey(publisher: string) {
  return publisher.replace(/\([^)]*\)/g, "").replace(/\s+/g, "").toLowerCase();
}

function bigrams(value: string) {
  const grams = new Set<string>();
  for (let i = 0; i < value.length - 1; i += 1) grams.add(value.slice(i, i + 2));
  return grams;
}

// Dice coefficient over character bigrams (0–1).
function similarity(a: string, b: string) {
  const x = bigrams(a);
  const y = bigrams(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  x.forEach((gram) => {
    if (y.has(gram)) shared += 1;
  });
  return (2 * shared) / (x.size + y.size);
}

// Text after the core title: "명견만리 : 미래의 기회 편" → "미래의기회편".
function subtitle(title: string) {
  const rest = title.replace(/\\(.)/g, "$1").match(/(?:\s[-–—]\s|[:：(])(.*)$/)?.[1] ?? "";
  return fullTitle(rest);
}

const EDITION_NOTE = /에디션|리커버|기념|개정|특별판|한정판|보급판|큰글자|합본|양장/;

export type MatchInput = { title: string; author: string; publisher: string };
export type MatchResult = { itemId: string; score: number; candidate: AladinSearchBook } | null;

function score(input: MatchInput, hit: AladinSearchBook) {
  const core = coreTitle(input.title);
  const hitCore = coreTitle(hit.title);
  let title = 0;
  if (!hitCore) return 0;
  // "[세트] 제로 투 원 + 경영의 모험" bundles another book.
  if (/^\s*\[세트\]/.test(hit.title) && hit.title.includes("+") && !/세트|set|\+/i.test(input.title)) return 0;
  if (fullTitle(input.title) === fullTitle(hit.title)) title = 1.2;
  else if (core && core === hitCore) title = 1;
  else if (core.length >= 4 && (hitCore.startsWith(core) || core.startsWith(hitCore))) title = 0.7;
  if (!title) return 0;

  // Another volume of a series: "명견만리 : 미래의 기회 편" is not "명견만리 (불평등…편)".
  const sub = subtitle(input.title);
  const hitVolume = fullTitle(hit.title.match(/\s[:：]\s(.+)$/)?.[1] ?? "");
  if (sub && hitVolume && !hitVolume.includes(sub) && !sub.includes(hitVolume) && similarity(sub, hitVolume) < 0.3) return 0;

  // A different publisher is a different book (another translation or set).
  const pubA = publisherKey(input.publisher);
  const pubB = publisherKey(hit.publisher);
  const pubSimilarity = pubA && pubB ? similarity(pubA, pubB) : null;
  if (pubSimilarity === 0) return 0;

  const names = authorNames(input.author);
  const hitNames = authorNames(hit.author);
  const author = names.length && names.some((name) => hitNames.some((other) => other.includes(name) || name.includes(other))) ? 1 : 0;
  const pub = pubSimilarity != null && pubSimilarity > 0 ? 1 : 0;
  // A title match alone is weak (common titles); author or publisher confirms.
  if (!author && !pub) return names.length || input.publisher ? 0 : title * 0.5;

  // Prefer the closest full title, and the plain edition over anniversary
  // or recover editions the record does not mention.
  const closeness = similarity(fullTitle(input.title), fullTitle(hit.title)) * 0.5;
  const editionPenalty = EDITION_NOTE.test(hit.title) && !EDITION_NOTE.test(input.title) ? 0.3 : 0;
  return title + author * 0.6 + pub * 0.4 + closeness - editionPenalty;
}

const MIN_SCORE = 1.4;

// Search Aladin for the edition behind a title/author/publisher. Tries the
// title with the first author, then the bare title.
export async function matchEdition(input: MatchInput): Promise<MatchResult> {
  const title = input.title.replace(/\\(.)/g, "$1");
  const base = title.split(/\s[-–—]\s|\s?\(|\s?[:：/]/)[0].trim();
  const firstAuthor = input.author.replace(/\([^)]*\)/g, "").split(/[,|]/)[0].trim();
  const queries = [...new Set([firstAuthor ? `${base} ${firstAuthor}` : base, base])];
  let best: MatchResult = null;
  for (const query of queries) {
    const hits = await searchAladin(query).catch(() => [] as AladinSearchBook[]);
    for (const hit of hits) {
      if (!hit.itemId) continue;
      const value = score(input, hit);
      if (value >= MIN_SCORE && (!best || value > best.score)) best = { itemId: hit.itemId, score: value, candidate: hit };
    }
    if (best) break;
  }
  return best;
}

// The 책 정보 fields kept on the catalog row (read from the product page once,
// refreshed only when the book is checked on demand).
export function productDetails(product: AladinProduct) {
  return {
    subTitle: product.subTitle,
    originalTitle: product.originalTitle,
    description: product.description,
    priceStandard: product.priceStandard,
    detailsAt: new Date().toISOString().replace("T", " ").slice(0, 19),
  };
}

// Ensure a catalog row for this Aladin item and return its id. Fills the
// fields the watchlist shows, including page count for reading statistics.
export async function ensureBookForItem(db: Db, itemId: string): Promise<number | null> {
  const [known] = await db.select({ id: books.id }).from(books).where(eq(books.aladinItemId, itemId));
  if (known) return known.id;
  const product = await lookupAladinProduct(itemId).catch(() => null);
  if (!product?.isbn13) return null;
  await db
    .insert(books)
    .values({
      isbn13: product.isbn13,
      title: product.title,
      author: product.author,
      publisher: product.publisher,
      cover: product.cover,
      aladinLink: aladinProductLink(itemId),
      aladinItemId: itemId,
      pubDate: product.pubDate,
      category: product.categoryName,
      pages: product.page,
      priceSales: product.priceSales,
      salesPoint: product.salesPoint,
      reviewRank: product.reviewRank,
      commentCount: product.commentCount,
      reviewCount: product.reviewCount,
      ...productDetails(product),
    })
    .onConflictDoNothing({ target: books.isbn13 });
  const [row] = await db
    .select({ id: books.id, itemId: books.aladinItemId, pages: books.pages, detailsAt: books.detailsAt })
    .from(books)
    .where(eq(books.isbn13, product.isbn13));
  if (!row) return null;
  // Same ISBN already in the catalog under another listing — fill gaps only.
  if (!row.itemId || row.pages == null || !row.detailsAt) {
    await db
      .update(books)
      .set({
        aladinItemId: row.itemId || itemId,
        aladinLink: row.itemId ? undefined : aladinProductLink(itemId),
        pages: row.pages ?? product.page,
        ...(row.detailsAt ? {} : productDetails(product)),
      })
      .where(eq(books.id, row.id));
  }
  return row.id;
}
