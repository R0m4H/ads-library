/**
 * The Ad Library keeps its filters, page and scroll position in the page address, so opening an ad and
 * coming back lands on the same filtered list. The address of the list (and where the user had
 * scrolled to) is also remembered for the browser tab, so the "Back to Ad Library" link on an ad can
 * return to exactly that list instead of a blank one.
 */

import type { AdFilters } from "@/components/FiltersBar";

const KEY = "adsListState";
const PAGE_SIZES = [12, 24, 48, 96];

interface Saved {
  url: string;
  scrollY?: number;
}

function read(): Saved | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null; // storage blocked (private window etc.) — everything below degrades to "no memory"
  }
}

function write(value: Saved | null) {
  try {
    if (value) window.sessionStorage.setItem(KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Where the "Back to Ad Library" link should go. */
export function getListUrl(): string {
  const saved = read();
  return saved && saved.url.startsWith("/ads") ? saved.url : "/ads";
}

export function saveListUrl(url: string) {
  const saved = read();
  // A different list means the old scroll position no longer applies.
  write({ url, scrollY: saved?.url === url ? saved.scrollY : undefined });
}

export function saveScroll(url: string, scrollY: number) {
  write({ url, scrollY });
}

/** Scroll position to restore for this exact list, once. */
export function takeScroll(url: string): number | null {
  const saved = read();
  if (!saved || saved.url !== url || saved.scrollY === undefined) return null;
  write({ url, scrollY: undefined });
  return saved.scrollY;
}

/** Filters, page and page size from the page address (the same names the API takes). */
export function readListState(params: URLSearchParams): { filters: AdFilters; page: number; pageSize: number } {
  const own = params.get("own");
  const platform = params.get("platform");
  const size = Number(params.get("page_size"));
  const page = Number(params.get("page"));
  return {
    filters: {
      q: params.get("q") ?? "",
      platform: platform === "meta" || platform === "google" || platform === "linkedin" ? platform : "",
      brand_ids: params.getAll("brand_id").filter(Boolean),
      themes: params.getAll("theme").filter(Boolean),
      ad_formats: params.getAll("ad_format").filter(Boolean),
      active_only: params.get("active_only") === "true",
      missing_copy: params.get("missing_copy") === "true",
      own: own === "own" || own === "competitors" ? own : "",
    },
    page: Number.isInteger(page) && page > 0 ? page : 0,
    pageSize: PAGE_SIZES.includes(size) ? size : 24,
  };
}

/** The address for a list: the API query without the defaults, so a plain list stays a plain /ads. */
export function listUrlFor(query: string): string {
  const params = new URLSearchParams(query);
  if (params.get("page") === "0") params.delete("page");
  if (params.get("page_size") === "24") params.delete("page_size");
  const rest = params.toString();
  return rest ? `/ads?${rest}` : "/ads";
}
