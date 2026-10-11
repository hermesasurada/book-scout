// Remembers which list (관심도서, 독서 기록, 내 서재) a book page was opened
// from, so going back lands on the same filter, page and scroll position.

const URL_KEY = "bookscout:list-url";
const SCROLL_KEY = "bookscout:list-scroll";
const FROM_LIST_KEY = "bookscout:from-list";

function session() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function rememberListUrl(url: string) {
  session()?.setItem(URL_KEY, url);
}

// Called when a book in a list is opened.
export function leaveList() {
  const store = session();
  if (!store) return;
  const url = `${window.location.pathname}${window.location.search}`;
  store.setItem(URL_KEY, url);
  store.setItem(SCROLL_KEY, JSON.stringify({ url, y: window.scrollY }));
  store.setItem(FROM_LIST_KEY, "1");
}

export function listReturnUrl() {
  return session()?.getItem(URL_KEY) || "/reading";
}

export function listLabel(url: string) {
  if (url.startsWith("/watch")) return "관심도서";
  if (url.startsWith("/shelf")) return "내 서재";
  return "독서 기록";
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
