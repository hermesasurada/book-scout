import { redirect } from "next/navigation";

// The home dashboard arrives with the reading features; until then the
// watchlist is the front page.
export default function Home() {
  redirect("/watch");
}
