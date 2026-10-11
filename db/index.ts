import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

type Migration = {
  id: number;
  name: string;
  statements: string[];
  /**
   * Only the baseline may be re-run against a database whose columns were
   * added by the old ad-hoc ALTER list, so it alone skips "duplicate column".
   */
  tolerateExisting?: boolean;
};

// Ordered, append-only. Each migration runs once per database and is recorded
// in `schema_migrations`; never edit an applied entry — add a new one.
// `drizzle/` keeps the generated history for types only; this list is what
// actually shapes the runtime database.
const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: "baseline",
    tolerateExisting: true,
    statements: [
      `CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        isbn13 TEXT NOT NULL,
        title TEXT NOT NULL,
        author TEXT NOT NULL DEFAULT '',
        publisher TEXT NOT NULL DEFAULT '',
        cover TEXT NOT NULL DEFAULT '',
        aladin_link TEXT NOT NULL DEFAULT '',
        pub_date TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      "CREATE UNIQUE INDEX IF NOT EXISTS books_isbn13_unique ON books (isbn13)",
      `CREATE TABLE IF NOT EXISTS checks (
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
      )`,
      "CREATE INDEX IF NOT EXISTS checks_book_date_idx ON checks (book_id, checked_at)",
      "ALTER TABLE books ADD COLUMN aladin_item_id TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE books ADD COLUMN category TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE books ADD COLUMN price_sales INTEGER",
      "ALTER TABLE books ADD COLUMN sales_point INTEGER",
      "ALTER TABLE books ADD COLUMN review_rank INTEGER",
      "ALTER TABLE books ADD COLUMN comment_count INTEGER",
      "ALTER TABLE books ADD COLUMN review_count INTEGER",
      "ALTER TABLE checks ADD COLUMN library_link TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE checks ADD COLUMN aladin_count INTEGER",
    ],
  },
  {
    // `books` becomes the edition catalog; watching, reading and owning are
    // separate relations. Every existing book was a watched book.
    id: 2,
    name: "watchlist-readings-purchases",
    statements: [
      `CREATE TABLE watchlist (
        book_id INTEGER PRIMARY KEY NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      "INSERT OR IGNORE INTO watchlist (book_id, added_at) SELECT id, created_at FROM books",
      "ALTER TABLE books ADD COLUMN pages INTEGER",
      `CREATE TABLE readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        book_id INTEGER REFERENCES books(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        author TEXT NOT NULL DEFAULT '',
        publisher TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        stopped_at TEXT,
        dates_unknown INTEGER NOT NULL DEFAULT 0,
        round INTEGER NOT NULL DEFAULT 1,
        rating REAL,
        review TEXT NOT NULL DEFAULT '',
        memo TEXT NOT NULL DEFAULT '',
        current_page INTEGER,
        match_status TEXT NOT NULL DEFAULT 'manual',
        source TEXT NOT NULL DEFAULT 'manual',
        source_key TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      "CREATE UNIQUE INDEX readings_source_key ON readings (source, source_key)",
      "CREATE INDEX readings_book_idx ON readings (book_id)",
      "CREATE INDEX readings_finished_idx ON readings (finished_at)",
      `CREATE TABLE purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        purchased_at TEXT NOT NULL,
        channel TEXT NOT NULL,
        store TEXT NOT NULL DEFAULT '',
        condition TEXT NOT NULL DEFAULT 'new',
        price INTEGER,
        quantity INTEGER NOT NULL DEFAULT 1,
        order_no TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'manual',
        source_key TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      "CREATE UNIQUE INDEX purchases_source_key ON purchases (source, source_key)",
      "CREATE INDEX purchases_book_idx ON purchases (book_id)",
      `CREATE TABLE reading_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        reading_id INTEGER NOT NULL REFERENCES readings(id) ON DELETE CASCADE,
        page INTEGER,
        quote TEXT NOT NULL DEFAULT '',
        memo TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      "CREATE INDEX reading_notes_reading_idx ON reading_notes (reading_id)",
    ],
  },
  {
    // Purchase e-mails already read, so the daily sync skips them even when
    // they held no book (envelopes, goods).
    id: 3,
    name: "mail-imports",
    statements: [
      `CREATE TABLE mail_imports (
        message_id TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL,
        purchased_at TEXT NOT NULL,
        lines INTEGER NOT NULL DEFAULT 0,
        imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    ],
  },
  {
    // The book page's "책 정보" is stored once instead of read from Aladin on
    // every visit. details_at marks rows whose details were fetched.
    id: 4,
    name: "book-details",
    statements: [
      "ALTER TABLE books ADD COLUMN sub_title TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE books ADD COLUMN original_title TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE books ADD COLUMN description TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE books ADD COLUMN price_standard INTEGER",
      "ALTER TABLE books ADD COLUMN details_at TEXT",
    ],
  },
];

async function migrate(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    )
    .run();
  const { results } = await db.prepare("SELECT id FROM schema_migrations").all<{ id: number }>();
  const applied = new Set(results.map((row) => row.id));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    const record = db.prepare("INSERT INTO schema_migrations (id, name) VALUES (?, ?)").bind(migration.id, migration.name);
    if (migration.tolerateExisting) {
      for (const statement of migration.statements) {
        await db.prepare(statement).run().catch((error: unknown) => {
          if (!/duplicate column name/i.test(String(error))) throw error;
        });
      }
      await record.run();
    } else {
      // D1 runs a batch as one transaction, so a failed migration leaves no trace.
      await db.batch([...migration.statements.map((statement) => db.prepare(statement)), record]);
    }
  }
}

let initialization: Promise<void> | undefined;

export async function getDb() {
  if (!env.DB) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }
  initialization ??= migrate(env.DB).catch((error) => {
    // Let the next request retry instead of caching the failure forever.
    initialization = undefined;
    throw error;
  });
  await initialization;
  return drizzle(env.DB, { schema });
}
