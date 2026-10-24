// 내 서재 list/grid choice. The cookie mirrors the browser's choice so the
// server renders the chosen view and the page does not flash on load.
export type ShelfView = "grid" | "list";
export const SHELF_VIEW_COOKIE = "bookscout-shelf-view";

export function shelfViewFrom(value: string | undefined): ShelfView {
  return value === "list" ? "list" : "grid";
}
