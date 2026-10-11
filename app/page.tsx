import { redirect } from "next/navigation";

// The home dashboard arrives with the statistics; until then the reading log
// is the front page.
export default function Home() {
  redirect("/reading");
}
