import { getDb } from "../../db";
import { today } from "../../lib/readingInput";
import { loadReadings } from "../../lib/readingQueries";
import { ReadingLog } from "./ReadingLog";

export const metadata = { title: "독서 기록" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ReadingPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const db = await getDb();
  const readings = await loadReadings(db);
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");
  return <ReadingLog readings={readings} initial={{ tab: one("tab"), year: one("year"), q: one("q"), view: one("view"), month: one("month") }} today={today()} />;
}
