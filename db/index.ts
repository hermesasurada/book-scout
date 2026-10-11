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
