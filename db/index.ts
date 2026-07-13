import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

let initialization: Promise<void> | undefined;

export async function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  initialization ??= env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      isbn13 TEXT NOT NULL,
      title TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT '',
      publisher TEXT NOT NULL DEFAULT '',
      cover TEXT NOT NULL DEFAULT '',
      aladin_link TEXT NOT NULL DEFAULT '',
      pub_date TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS books_isbn13_unique ON books (isbn13)"),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      aladin_status TEXT NOT NULL,
      aladin_store TEXT NOT NULL DEFAULT '',
      aladin_price INTEGER,
      aladin_link TEXT NOT NULL DEFAULT '',
      library_status TEXT NOT NULL,
      library_due_date TEXT NOT NULL DEFAULT '',
      library_location TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT ''
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS checks_book_date_idx ON checks (book_id, checked_at)"),
  ])
    // Add columns introduced after the initial schema. SQLite has no
    // "ADD COLUMN IF NOT EXISTS", so tolerate the "duplicate column" error on
    // databases that already have it.
    .then(() =>
      Promise.all(
        [
          "ALTER TABLE books ADD COLUMN pub_date TEXT NOT NULL DEFAULT ''",
          "ALTER TABLE books ADD COLUMN category TEXT NOT NULL DEFAULT ''",
          "ALTER TABLE books ADD COLUMN price_sales INTEGER",
          "ALTER TABLE books ADD COLUMN sales_point INTEGER",
          "ALTER TABLE books ADD COLUMN review_rank INTEGER",
          "ALTER TABLE books ADD COLUMN used_min_price INTEGER",
          "ALTER TABLE checks ADD COLUMN library_link TEXT NOT NULL DEFAULT ''",
        ].map((statement) => env.DB.prepare(statement).run().catch(() => undefined)),
      ),
    )
    .then(() => undefined);
  await initialization;

  return drizzle(env.DB, { schema });
}
