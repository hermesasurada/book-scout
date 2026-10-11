// Remembers where the reader was in the watchlist so a book page can send
// them back to the same filter, sort, page and scroll position.

const URL_KEY = "bookscout:watch-url";
const SCROLL_KEY = "bookscout:watch-scroll";
const FROM_LIST_KEY = "bookscout:from-watch";

function session() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function rememberWatchUrl(url: string) {
  session()?.setItem(URL_KEY, url);
}

// Called when a book in the list is opened.
export function leaveWatchlist() {
  const store = session();
  if (!store) return;
  const url = `${window.location.pathname}${window.location.search}`;
  store.setItem(URL_KEY, url);
  store.setItem(SCROLL_KEY, JSON.stringify({ url, y: window.scrollY }));
  store.setItem(FROM_LIST_KEY, "1");
}

export function watchReturnUrl() {
  return session()?.getItem(URL_KEY) || "/watch";
}

// True once per visit when the book page was opened from the list, so going
// back can pop history instead of pushing a new entry.
export function consumeCameFromList() {
  const store = session();
  if (!store?.getItem(FROM_LIST_KEY)) return false;
  store.removeItem(FROM_LIST_KEY);
  return true;
}

export function takeSavedScroll(url: string): number | null {
  const store = session();
  const raw = store?.getItem(SCROLL_KEY);
  if (!store || !raw) return null;
  store.removeItem(SCROLL_KEY);
  try {
    const saved = JSON.parse(raw) as { url?: string; y?: number };
    return saved.url === url && typeof saved.y === "number" ? saved.y : null;
  } catch {
    return null;
  }
}
