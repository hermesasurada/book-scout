import { env } from "cloudflare:workers";
import { inArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import { mailImports } from "../../../../db/schema";
import { parsePurchaseMail } from "../../../../lib/aladinMail";
import { getMessage, gmailAccessToken, gmailConfigured, listMessageIds } from "../../../../lib/gmail";
import { type RecordedPurchase, recordPurchaseMail } from "../../../../lib/purchaseImport";

type RuntimeEnv = { GMAIL_CLIENT_ID?: string; GMAIL_CLIENT_SECRET?: string; GMAIL_REFRESH_TOKEN?: string };

const QUERY = 'from:no-reply@aladin.co.kr (subject:"주문을 접수하였습니다" OR subject:"중고매장 구매내용")';

// Sync Aladin purchase mails. Body: { days?: number } (default 30) or
// { all: true } for the one-time backfill. Already-read mails are skipped.
export async function POST(request: Request) {
  const runtime = env as unknown as RuntimeEnv;
  const config = { clientId: runtime.GMAIL_CLIENT_ID, clientSecret: runtime.GMAIL_CLIENT_SECRET, refreshToken: runtime.GMAIL_REFRESH_TOKEN };
  if (!gmailConfigured(config)) {
    return Response.json({ error: "Gmail 연동이 설정되지 않았습니다 (scripts/gmail-auth.mjs)." }, { status: 412 });
  }
  const payload = (await request.json().catch(() => ({}))) as { days?: number; all?: boolean };
  const days = Math.max(1, Math.min(3650, Number(payload.days) || 30));
  const since = new Date(Date.now() - days * 86400 * 1000);
  const query = payload.all ? QUERY : `${QUERY} after:${since.getUTCFullYear()}/${since.getUTCMonth() + 1}/${since.getUTCDate()}`;

  try {
    const token = await gmailAccessToken(config);
    const ids = await listMessageIds(token, query);
    const db = await getDb();
    const seen = new Set<string>();
    for (let offset = 0; offset < ids.length; offset += 50) {
      const chunk = ids.slice(offset, offset + 50);
      const rows = await db.select({ id: mailImports.messageId }).from(mailImports).where(inArray(mailImports.messageId, chunk));
      rows.forEach((row) => seen.add(row.id));
    }
    const recorded: RecordedPurchase[] = [];
    let parsed = 0;
    // Oldest first, so watchlist removals and purchase ids follow real order.
    for (const id of ids.filter((messageId) => !seen.has(messageId)).reverse()) {
      const message = await getMessage(token, id);
      const mail = parsePurchaseMail(message.subject, message.html, message.date);
      if (!mail) continue;
      parsed += 1;
      recorded.push(...(await recordPurchaseMail(db, id, mail)));
    }
    return Response.json({
      found: ids.length,
      skipped: seen.size,
      parsed,
      added: recorded.length,
      purchases: recorded,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Gmail 동기화 실패" }, { status: 502 });
  }
}
