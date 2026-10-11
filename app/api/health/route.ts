import { sql } from "drizzle-orm";
import { getDb } from "../../../db";

// Liveness for the hermes portal tile: the server answers and the DB opens.
export async function GET() {
  try {
    const db = await getDb();
    await db.run(sql`SELECT 1`);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "DB 오류" }, { status: 503 });
  }
}
