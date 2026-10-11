import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Edition catalog (one row per ISBN). Watching, reading and owning are
// separate relations below.
export const books = sqliteTable(
  "books",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    isbn13: text("isbn13").notNull(),
    title: text("title").notNull(),
    author: text("author").notNull().default(""),
    publisher: text("publisher").notNull().default(""),
    cover: text("cover").notNull().default(""),
    aladinLink: text("aladin_link").notNull().default(""),
    aladinItemId: text("aladin_item_id").notNull().default(""),
    pubDate: text("pub_date").notNull().default(""),
    category: text("category").notNull().default(""),
    pages: integer("pages"),
    subTitle: text("sub_title").notNull().default(""),
    originalTitle: text("original_title").notNull().default(""),
    description: text("description").notNull().default(""),
    priceStandard: integer("price_standard"),
    priceSales: integer("price_sales"),
    salesPoint: integer("sales_point"),
    // Aladin's 10-point average carries one decimal (9.8), so this is a real.
    reviewRank: real("review_rank"),
    /** 100자평 편수 */
    commentCount: integer("comment_count"),
    /** 리뷰 편수 */
    reviewCount: integer("review_count"),
    /** When the 책 정보 fields above were last read from the Aladin product page. */
    detailsAt: text("details_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("books_isbn13_unique").on(table.isbn13)],
);

/** 관심도서 — the only books whose Aladin stock and library loans are checked. */
export const watchlist = sqliteTable("watchlist", {
  bookId: integer("book_id").primaryKey().references(() => books.id, { onDelete: "cascade" }),
  addedAt: text("added_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const checks = sqliteTable(
  "checks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bookId: integer("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
    checkedAt: text("checked_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    aladinStatus: text("aladin_status").notNull(),
    aladinStore: text("aladin_store").notNull().default(""),
    aladinPrice: integer("aladin_price"),
    aladinCount: integer("aladin_count"),
    aladinLink: text("aladin_link").notNull().default(""),
    libraryStatus: text("library_status").notNull(),
    libraryDueDate: text("library_due_date").notNull().default(""),
    libraryLocation: text("library_location").notNull().default(""),
    libraryLink: text("library_link").notNull().default(""),
    error: text("error").notNull().default(""),
  },
  (table) => [index("checks_book_date_idx").on(table.bookId, table.checkedAt)],
);

export type ReadingStatus = "reading" | "finished" | "stopped";

/**
 * One read of a book (a re-read is another row with round + 1). Title/author
 * are kept on the row so imported records that could not be matched to an
 * Aladin edition (book_id null) still display.
 */
export const readings = sqliteTable(
  "readings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bookId: integer("book_id").references(() => books.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    author: text("author").notNull().default(""),
    publisher: text("publisher").notNull().default(""),
    status: text("status").$type<ReadingStatus>().notNull(),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    stoppedAt: text("stopped_at"),
    /** Read before records began (북적북적's 2020-12-31 placeholder); no real dates. */
    datesUnknown: integer("dates_unknown", { mode: "boolean" }).notNull().default(false),
    round: integer("round").notNull().default(1),
    /** 0.5–5 */
    rating: real("rating"),
    review: text("review").notNull().default(""),
    memo: text("memo").notNull().default(""),
    currentPage: integer("current_page"),
    /** matched | unmatched | manual */
    matchStatus: text("match_status").notNull().default("manual"),
    /** manual | bookit */
    source: text("source").notNull().default("manual"),
    sourceKey: text("source_key"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("readings_source_key").on(table.source, table.sourceKey),
    index("readings_book_idx").on(table.bookId),
    index("readings_finished_idx").on(table.finishedAt),
  ],
);

export const purchases = sqliteTable(
  "purchases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bookId: integer("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
    purchasedAt: text("purchased_at").notNull(),
    /** aladin_online | aladin_store | other */
    channel: text("channel").notNull(),
    store: text("store").notNull().default(""),
    /** new | used | ebook */
    condition: text("condition").notNull().default("new"),
    price: integer("price"),
    quantity: integer("quantity").notNull().default(1),
    orderNo: text("order_no").notNull().default(""),
    /** manual | gmail */
    source: text("source").notNull().default("manual"),
    sourceKey: text("source_key"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("purchases_source_key").on(table.source, table.sourceKey), index("purchases_book_idx").on(table.bookId)],
);

/** 문장 수집 — quotes and thoughts attached to a reading. */
export const readingNotes = sqliteTable(
  "reading_notes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    readingId: integer("reading_id").notNull().references(() => readings.id, { onDelete: "cascade" }),
    page: integer("page"),
    quote: text("quote").notNull().default(""),
    memo: text("memo").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("reading_notes_reading_idx").on(table.readingId)],
);


/** Purchase e-mails already processed (by Gmail message id). */
export const mailImports = sqliteTable("mail_imports", {
  messageId: text("message_id").primaryKey(),
  /** online | store */
  kind: text("kind").notNull(),
  purchasedAt: text("purchased_at").notNull(),
  lines: integer("lines").notNull().default(0),
  importedAt: text("imported_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/** Books removed from 내 서재 by hand; their purchase history is kept. */
export const shelfHidden = sqliteTable("shelf_hidden", {
  bookId: integer("book_id").primaryKey().references(() => books.id, { onDelete: "cascade" }),
  hiddenAt: text("hidden_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
