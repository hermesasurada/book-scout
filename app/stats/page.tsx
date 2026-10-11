import { getDb } from "../../db";
import { today } from "../../lib/readingInput";
import { loadReadings } from "../../lib/readingQueries";
import type { StatReading } from "../../lib/stats";
import { StatsView } from "./StatsView";

export const metadata = { title: "독서 통계" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function StatsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const db = await getDb();
  const readings: StatReading[] = (await loadReadings(db)).map((reading) => ({
    bookId: reading.bookId,
    title: reading.title,
    author: reading.author,
    category: reading.category,
    pages: reading.pages,
    status: reading.status,
    startedAt: reading.startedAt,
    finishedAt: reading.finishedAt,
    stoppedAt: reading.stoppedAt,
    datesUnknown: reading.datesUnknown,
    round: reading.round,
  }));
  const year = typeof params.year === "string" ? params.year : "";
  return <StatsView readings={readings} today={today()} initialYear={year} />;
}
