import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("books_isbn13_unique").on(table.isbn13)],
);

export const checks = sqliteTable(
  "checks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bookId: integer("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
    checkedAt: text("checked_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    aladinStatus: text("aladin_status").notNull(),
    aladinStore: text("aladin_store").notNull().default(""),
    aladinPrice: integer("aladin_price"),
    aladinLink: text("aladin_link").notNull().default(""),
    libraryStatus: text("library_status").notNull(),
    libraryDueDate: text("library_due_date").notNull().default(""),
    libraryLocation: text("library_location").notNull().default(""),
    error: text("error").notNull().default(""),
  },
  (table) => [index("checks_book_date_idx").on(table.bookId, table.checkedAt)],
);
