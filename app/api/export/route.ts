import { env } from "cloudflare:workers";
import { getDb } from "../../../db";

// Full data export: every app table as JSON, so the reading log and purchase
// history never depend on this database file alone.
export async function GET() {
  await getDb(); // ensure migrations ran
  const { results: tables } = await env.DB
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name")
    .all<{ name: string }>();
  const data: Record<string, unknown[]> = {};
  for (const { name } of tables) {
    const { results } = await env.DB.prepare(`SELECT * FROM "${name.replace(/"/g, '""')}"`).all();
    data[name] = results;
  }
  const exportedAt = new Date().toISOString();
  const stamp = exportedAt.slice(0, 10).replace(/-/g, "");
  return new Response(JSON.stringify({ exportedAt, tables: data }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="book-scout-${stamp}.json"`,
    },
  });
}
