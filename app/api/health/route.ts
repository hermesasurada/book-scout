import { sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { isDailyCheckStale } from "../../../lib/dailyCheck";
import { lastDailyCheck } from "../../../lib/watchCheck";

// Liveness for the hermes portal tile: the server answers and the DB opens.
// A late daily run is reported but stays 200 — the service itself is up.
export async function GET() {
  try {
    const db = await getDb();
    await db.run(sql`SELECT 1`);
    const lastRunAt = await lastDailyCheck(db);
    return Response.json({ ok: true, dailyCheck: { lastRunAt, stale: isDailyCheckStale(lastRunAt) } });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "DB 오류" }, { status: 503 });
  }
}
