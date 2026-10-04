import type { Page, Route } from "@playwright/test";

/**
 * Fake API responses so the page tests never touch real ads, never trigger a
 * sync and never spend Apify/Gemini credits. The data is deliberately awkward:
 * long Georgian + English names, missing logos, missing copy, inactive ads,
 * every ad format — the things that break layouts.
 */

const svg = (label: string, color: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="${color}"/><text x="400" y="310" font-size="48" text-anchor="middle" fill="#fff" font-family="sans-serif">${label}</text></svg>`
  );
const logo = (letter: string, color: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="${color}"/><text x="48" y="62" font-size="44" text-anchor="middle" fill="#fff" font-family="sans-serif">${letter}</text></svg>`
  );

const LONG_GE = "საქართველოს ბანკი ბიზნესი • Bank of Georgia Business";
const NOW = "2026-06-15T12:00:00.000Z";
const daysAgo = (n: number) => new Date(Date.parse(NOW) - n * 864e5).toISOString();

export const brands = [
  { id: "brand-a", name: LONG_GE, is_own: true, category: "Finance", notes: null, logo_url: logo("B", "#ff5a00"), meta_page_id: "1", meta_page_url: null, google_advertiser_id: "AR1", google_domain: null, linkedin_company_url: null, created_at: NOW, updated_at: NOW },
  { id: "brand-b", name: "TBC", is_own: false, category: "Finance", notes: null, logo_url: null, meta_page_id: "2", meta_page_url: null, google_advertiser_id: "AR2", google_domain: null, linkedin_company_url: "https://linkedin.com/company/tbc", created_at: NOW, updated_at: NOW },
  { id: "brand-c", name: "A Very Long Competitor Name Holding Company International Group Limited", is_own: false, category: null, notes: null, logo_url: logo("V", "#1a2e52"), meta_page_id: "3", meta_page_url: null, google_advertiser_id: null, google_domain: null, linkedin_company_url: null, created_at: NOW, updated_at: NOW },
  { id: "brand-d", name: "Silk Bank", is_own: true, category: "Finance", notes: null, logo_url: null, meta_page_id: null, meta_page_url: null, google_advertiser_id: null, google_domain: null, linkedin_company_url: null, created_at: NOW, updated_at: NOW },
];

export const themes = [
  { id: "t1", name: "სამომხმარებლო სესხი", keywords: ["სამომხმარებლ", "სესხი"], priority: 10, excludes: [], created_at: NOW, updated_at: NOW },
  { id: "t2", name: "Cards & Everyday Payments With A Deliberately Overlong Theme Name", keywords: ["ბარათი", "card", "ანგარიში", "payment"], priority: 0, excludes: ["სამომხმარებლო სესხი"], created_at: NOW, updated_at: NOW },
  { id: "t3", name: "Deposits", keywords: ["ანაბარი", "deposit"], priority: 5, excludes: [], created_at: NOW, updated_at: NOW },
  { id: "t4", name: "Mortgage", keywords: ["იპოთეკა"], priority: 0, excludes: [], created_at: NOW, updated_at: NOW },
];

type Fmt = "image" | "video" | "carousel" | null;
function ad(i: number, o: Partial<{ brand: number; platform: string; fmt: Fmt; headline: string | null; body: string | null; cta: string | null; active: boolean; tags: string[]; media: boolean }> = {}) {
  const b = brands[o.brand ?? i % brands.length];
  const fmt: Fmt = o.fmt === undefined ? "image" : o.fmt;
  return {
    id: `ad-${i}`,
    brand_id: b.id,
    platform: o.platform ?? ["meta", "google", "linkedin"][i % 3],
    external_id: `ext-${i}`,
    ad_format: fmt,
    headline: o.headline === undefined ? `Headline number ${i}` : o.headline,
    body: o.body === undefined ? "Short body copy for the ad." : o.body,
    cta: o.cta === undefined ? "Learn more" : o.cta,
    media: o.media === false ? [] : [fmt === "video" ? { type: "video", url: "https://example.invalid/v.mp4", thumbnail_url: svg("video", "#334155") } : { type: "image", url: svg(`creative ${i}`, i % 2 ? "#0a1628" : "#ff5a00") }],
    landing_url: "https://example.com/landing",
    source_url: `https://www.facebook.com/ads/library/?id=${i}`,
    theme_tags: o.tags ?? ["Deposits"],
    spend_estimate: null,
    impressions_estimate: null,
    first_seen_at: daysAgo(3 + i),
    last_seen_at: daysAgo(0),
    is_active: o.active ?? true,
    created_at: NOW,
    updated_at: NOW,
    brand: { id: b.id, name: b.name, is_own: b.is_own, logo_url: b.logo_url, category: b.category },
  };
}

export const ads = [
  ad(0, { brand: 0, platform: "meta", headline: "ჩაერთე გათამაშებაში და მოიგე გარანტირებული ბილეთები უკვე დღესვე, ახალი ბარათით", body: "🗝️ დააგროვე 5 გასაღები და გახსენი სკივრი, სადაც გათამაშების გარანტირებული 50 ბილეთი დაგხვდება. დამატებით შეიძლება დაგხვდეს 1 000 ბილეთი და სხვა სიურპრიზები.", tags: ["Cards & Everyday Payments With A Deliberately Overlong Theme Name", "Deposits", "Mortgage"] }),
  ad(1, { brand: 1, platform: "meta", fmt: "video", headline: "TBC", body: null, cta: null, tags: [] }),
  ad(2, { brand: 2, platform: "google", fmt: "carousel", headline: "Short", body: "Carousel body copy", tags: ["Mortgage"] }),
  ad(3, { brand: 0, platform: "linkedin", headline: null, body: null, cta: null, media: false, tags: [] }),
  ad(4, { brand: 3, platform: "meta", active: false, headline: "Inactive ad with a normal headline", tags: ["Deposits"] }),
  ad(5, { brand: 1, platform: "meta", headline: "Averyveryveryveryverylongsingleworddoesnotbreakanywhereandkeepsgoingandgoing", body: "Averyveryveryveryverylongsingleworddoesnotbreakanywhereandkeepsgoingandgoing", tags: ["Deposits"] }),
  ad(6, { brand: 2, platform: "google", headline: "სამომხმარებლო სესხი 0% პირველ თვეებში", body: "მიიღე სესხი რამდენიმე წუთში, ონლაინ, ფილიალში მისვლის გარეშე.", cta: "მიიღე სესხი", tags: ["სამომხმარებლო სესხი"] }),
  ad(7, { brand: 0, platform: "meta", headline: "Open a deposit", body: "Grow your savings with competitive rates.", tags: ["Deposits", "სამომხმარებლო სესხი"] }),
];

const bucket = (total: number, active: number, untagged: number, counts: Record<string, number>, hl: [string, number][]) => ({
  total, active, untagged, themeCounts: counts, headlines: hl.map(([headline, count]) => ({ headline, count })),
});
const themeNames = themes.map((t) => t.name);

export const analysis = {
  themes: themeNames,
  brands: brands.slice(0, 3).map((b, i) => {
    const counts = Object.fromEntries(themeNames.map((n, j) => [n, (i * 7 + j * 3) % 11]));
    const hl: [string, number][] = [
      [i === 0 ? LONG_GE + " — a deliberately long headline that has to wrap inside its card" : "Short headline", 12 - i],
      ["ჩაერთე გათამაშებაში", 7],
      ["Averyveryveryveryverylongsingleword" + "x".repeat(40), 2],
    ];
    const bk = bucket(40 - i * 6, 30 - i * 5, 4 + i, counts, hl);
    return { brand: { id: b.id, name: b.name, is_own: b.is_own, logo_url: b.logo_url, category: b.category }, platforms: { all: bk, meta: bk, google: bk, linkedin: bk } };
  }),
};

export const insights = {
  findings: [
    { brand: LONG_GE, tag: "advantage", title: "Strong lead in everyday payments messaging across a very long finding title", body: "Bank of Georgia runs 3× more payment-themed ads than the nearest competitor, concentrated on Meta. ".repeat(2) },
    { brand: "TBC", tag: "contested", title: "Deposits are contested", body: "Both brands push deposit rates with similar copy." },
    { brand: null, tag: "white-space", title: "Nobody owns mortgage storytelling", body: "Only a handful of ads reference mortgages and none use long-form creative." },
    { brand: "A Very Long Competitor Name Holding Company International Group Limited", tag: "risk", title: "Rising consumer-loan push", body: "Competitor is ramping consumer-loan ads week over week." },
  ],
  gaps: [
    { gap: "Mortgage education content", evidence: "2 of 40 competitor ads mention mortgages; none in carousel format.", move: "Launch a 4-card carousel explaining the mortgage process with a calculator CTA.", priority: "high" },
    { gap: "LinkedIn employer-brand presence", evidence: "No active LinkedIn ads for own brands.", move: "Test a small LinkedIn campaign.", priority: "med" },
    { gap: "Deposit seasonality", evidence: "Competitors dip in summer.", move: "Run summer deposit offers.", priority: "low" },
  ],
  checklist: [
    "Audit all untagged ads and add missing theme keywords this week so the numbers can be trusted before the next review meeting with the wider team.",
    "Draft the mortgage carousel concept.",
    "Re-run this comparison in 30 days.",
  ],
};

export const suggestions = [0, 3].map((i) => ({
  id: `ad-${i}`,
  platform: "meta",
  headline: ads[i].headline,
  body: ads[i].body,
  cta: ads[i].cta,
  media: ads[i].media,
  brandName: brands[i % brands.length].name,
  suggestedTheme: i === 0 ? "Deposits" : "A brand new theme the AI invented",
  isNewTheme: i !== 0,
  reason: "Mentions savings rates, which matches the Deposits theme.",
}));

export const team = [
  { id: "u-owner", email: "owner@example.com", display_name: "Owner Person", role: "owner" },
  { id: "u-ed", email: "an.extremely.long.email.address.for.layout.testing@some-very-long-company-domain.example.com", display_name: null, role: "editor" },
  { id: "u-v", email: "viewer@example.com", display_name: "Viewer With A Pretty Long Display Name Indeed", role: "viewer" },
];

export const presets = [
  { id: "p1", label: "Quick", value: 50, sort_order: 1, created_at: NOW, updated_at: NOW },
  { id: "p2", label: "Standard", value: 200, sort_order: 2, created_at: NOW, updated_at: NOW },
  { id: "p3", label: "Full", value: 1000, sort_order: 3, created_at: NOW, updated_at: NOW },
];

export const runs = [
  { id: "r1", brand_id: "brand-a", platform: "meta", apify_run_id: "x", apify_dataset_id: "y", status: "succeeded", ads_found: 505, ads_active: 421, error: null, started_at: daysAgo(1), finished_at: daysAgo(1) },
  { id: "r2", brand_id: "brand-a", platform: "google", apify_run_id: "x", apify_dataset_id: "y", status: "failed", ads_found: null, ads_active: null, error: "Failed to save ads: canceling statement due to statement timeout while updating a very large batch of rows", started_at: daysAgo(2), finished_at: daysAgo(2) },
  { id: "r3", brand_id: "brand-a", platform: "meta", apify_run_id: "x", apify_dataset_id: "y", status: "failed", ads_found: null, ads_active: null, error: "Cancelled by user", started_at: daysAgo(3), finished_at: daysAgo(3) },
];

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

/** Intercepts every /api call the pages make. Any write is answered with a harmless OK. */
export async function installMocks(page: Page) {
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();

    if (path === "/api/themes/suggest") return json(route, { suggestions, remainingUntagged: 12 });
    if (method !== "GET" && path !== "/api/analysis/insights") return json(route, { ok: true });

    if (path === "/api/brands") return json(route, { brands });
    let m = path.match(/^\/api\/brands\/([^/]+)\/runs$/);
    if (m) return json(route, { runs });
    m = path.match(/^\/api\/brands\/([^/]+)$/);
    if (m) return json(route, { brand: brands.find((b) => b.id === m![1]) ?? brands[0] });
    if (path === "/api/themes") return json(route, { themes });
    if (path === "/api/sync-presets") return json(route, { presets });
    if (path === "/api/team") return json(route, { members: team });
    if (path === "/api/analysis") return json(route, analysis);
    if (path === "/api/analysis/insights") return json(route, insights);
    m = path.match(/^\/api\/ads\/([^/]+)$/);
    if (m) return json(route, { ad: ads.find((a) => a.id === m![1]) ?? ads[0] });
    if (path === "/api/ads") {
      const brandIds = url.searchParams.getAll("brand_id");
      const list = brandIds.length ? ads.filter((a) => brandIds.includes(a.brand_id)) : ads;
      const active = url.searchParams.get("active_only") === "true" ? list.filter((a) => a.is_active) : list;
      return json(route, { ads: active, total: active.length, page: 0, pageSize: 24 });
    }
    return json(route, {});
  });
}

export const FIXED_NOW = new Date(NOW);
