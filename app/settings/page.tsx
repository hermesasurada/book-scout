import { env } from "cloudflare:workers";
import { count, max } from "drizzle-orm";
import { getDb } from "../../db";
import { mailImports, purchases, watchlist } from "../../db/schema";
import { isDailyCheckStale } from "../../lib/dailyCheck";
import { gmailConfigured } from "../../lib/gmail";
import { lastDailyCheck } from "../../lib/watchCheck";
import { Imports } from "./Imports";

export const metadata = { title: "가져오기 · 설정" };

type RuntimeEnv = { GMAIL_CLIENT_ID?: string; GMAIL_CLIENT_SECRET?: string; GMAIL_REFRESH_TOKEN?: string };

export default async function SettingsPage() {
  const runtime = env as unknown as RuntimeEnv;
  const db = await getDb();
  const [[purchaseCount], [watchCount], [lastMail], lastDaily] = await Promise.all([
    db.select({ value: count() }).from(purchases),
    db.select({ value: count() }).from(watchlist),
    db.select({ value: max(mailImports.importedAt) }).from(mailImports),
    lastDailyCheck(db),
  ]);
  return (
    <Imports
      gmailReady={gmailConfigured({ clientId: runtime.GMAIL_CLIENT_ID, clientSecret: runtime.GMAIL_CLIENT_SECRET, refreshToken: runtime.GMAIL_REFRESH_TOKEN })}
      stats={{
        purchases: purchaseCount.value,
        watchlist: watchCount.value,
        lastMailImport: lastMail.value ?? null,
        lastDailyCheck: lastDaily,
        dailyCheckStale: isDailyCheckStale(lastDaily),
      }}
    />
  );
}
