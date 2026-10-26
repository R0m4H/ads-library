import { test, expect, type Page } from "@playwright/test";
import { auditLayout, formatIssues, type LayoutIssue } from "./layout-audit";
import { installMocks, FIXED_NOW } from "./mocks";

/**
 * Opens every screen at three sizes (see playwright.config.ts), then:
 *   1. runs the layout audit (overlaps, clipping, sideways scroll, …) — fails on any finding
 *   2. compares a full-page screenshot to the saved baseline (`npm run e2e:update` to accept changes)
 *
 * API calls are mocked (see mocks.ts) so nothing real is read, synced or paid for.
 * The dashboard is rendered on the server from real data, so it only gets the audit, not a screenshot.
 */

// Suppress a documented false positive here, e.g.
//   { rule: "overlap", whereIncludes: "some text", reason: "why this is fine" }
const IGNORE: { rule: LayoutIssue["rule"]; whereIncludes: string; reason: string }[] = [];

interface Screen {
  name: string;
  path: string;
  mocked?: boolean;
  screenshot?: boolean;
  run?: (page: Page) => Promise<void>;
}

const SCREENS: Screen[] = [
  { name: "ad-library", path: "/ads" },
  { name: "ad-detail", path: "/ads/ad-0" },
  { name: "ad-detail-no-copy", path: "/ads/ad-3" },
  {
    name: "ad-library-brand-filter-open",
    path: "/ads",
    run: async (page) => {
      await page.getByRole("button", { name: "All brands" }).click();
      await page.getByText("Competitors", { exact: true }).waitFor();
    },
  },
  {
    name: "ad-library-theme-filter-open",
    path: "/ads",
    run: async (page) => {
      await page.getByRole("button", { name: "All themes" }).click();
      await page.getByText("No theme", { exact: true }).waitFor();
    },
  },
  {
    name: "ad-library-own-filter-open",
    path: "/ads",
    run: async (page) => {
      await page.getByRole("button", { name: "Yours + competitors" }).click();
      await page.getByRole("option", { name: "Only competitors" }).waitFor();
    },
  },
  {
    name: "ad-library-per-page-open",
    path: "/ads",
    run: async (page) => {
      await page.getByRole("button", { name: "24", exact: true }).click();
      await page.getByRole("option", { name: "96" }).waitFor();
    },
  },
  {
    name: "ad-library-card-add-theme-open",
    path: "/ads",
    run: async (page) => {
      await page.getByRole("button", { name: "+ Add theme…" }).nth(1).click();
      await page.getByRole("option").first().waitFor();
    },
  },
  { name: "ad-detail-expired-preview", path: "/ads/ad-5" },
  {
    name: "ad-detail-add-theme-open",
    path: "/ads/ad-0",
    run: async (page) => {
      await page.getByRole("button", { name: "+ Add theme…" }).click();
      await page.getByRole("option").first().waitFor();
    },
  },
  {
    name: "themes-ai-suggestions-swap-open",
    path: "/themes",
    run: async (page) => {
      await page.getByRole("button", { name: "Suggest tags for untagged ads" }).click();
      await page.getByRole("button", { name: "Swap to…" }).first().click();
      await page.getByRole("option").first().waitFor();
    },
  },
  {
    name: "team-role-open",
    path: "/team",
    run: async (page) => {
      await page.getByRole("button", { name: "viewer", exact: true }).first().click();
      await page.getByRole("option", { name: "owner" }).waitFor();
    },
  },
  { name: "brands", path: "/brands" },
  {
    name: "brands-add-form-open",
    path: "/brands",
    run: async (page) => {
      await page.getByRole("button", { name: "+ Add brand" }).click();
    },
  },
  { name: "brand-detail", path: "/brands/brand-a" },
  {
    name: "brand-detail-editing",
    path: "/brands/brand-a",
    run: async (page) => {
      await page.getByRole("button", { name: "Edit identifiers" }).click();
    },
  },
  { name: "themes", path: "/themes" },
  {
    name: "analysis-with-insights",
    path: "/analysis",
    run: async (page) => {
      for (const label of [/Bank of Georgia Business/, /^TBC$/, /A Very Long Competitor/]) {
        await page.getByRole("button", { name: label }).first().click();
      }
      await page.getByRole("button", { name: "Generate comparison" }).click();
      await expect(page.getByText("Ads by theme")).toBeVisible();
      await page.getByRole("button", { name: "Generate AI insights" }).click();
      await expect(page.getByText("30-day action checklist")).toBeVisible();
    },
  },
  { name: "team", path: "/team" },
  { name: "dashboard", path: "/", mocked: false, screenshot: false },
];

// Supabase rotates its tokens: the app refreshes the session while a test runs, and the old
// refresh token stops working afterwards. Save the refreshed cookies back so the session
// from `npm run e2e:login` keeps working across runs. (Signed-out tests have no cookies; skip.)
test.afterEach(async ({ context }) => {
  const state = await context.storageState();
  if (state.cookies.length > 0) await context.storageState({ path: "e2e/.auth/state.json" });
});

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await expect(page.getByText("Loading…")).toHaveCount(0, { timeout: 20_000 });
  // Dev-only Next.js indicator would otherwise appear in screenshots and the audit.
  await page.addStyleTag({ content: "nextjs-portal{display:none !important}" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  // Charts draw on a canvas; give them a moment (the animation itself is off via reducedMotion).
  if ((await page.locator("canvas").count()) > 0) await page.waitForTimeout(500);
}

for (const screen of SCREENS) {
  test(screen.name, async ({ page }, testInfo) => {
    await page.clock.setFixedTime(FIXED_NOW);
    if (screen.mocked !== false) await installMocks(page);

    await page.goto(screen.path);
    if (page.url().includes("/login")) {
      throw new Error("Redirected to /login — the saved session is missing or expired. Run `npm run e2e:login` again.");
    }
    await settle(page);
    if (screen.run) {
      await screen.run(page);
      await settle(page);
    }

    const all = await auditLayout(page);
    const issues = all.filter((i) => !IGNORE.some((ig) => ig.rule === i.rule && i.where.includes(ig.whereIncludes)));
    expect(issues, `Layout problems on "${screen.name}" (${testInfo.project.name}):\n${formatIssues(issues)}\n`).toEqual([]);

    if (screen.screenshot !== false) {
      await expect(page).toHaveScreenshot(`${screen.name}.png`, {
        fullPage: true,
        mask: [page.getByTestId("nav-email")],
      });
    }
  });
}

test("ad library: ticking several brands, themes and ad types sends all of them", async ({ page }) => {
  await installMocks(page);
  const adRequests: URL[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname === "/api/ads") adRequests.push(u);
  });

  await page.goto("/ads");
  await settle(page);

  await page.getByRole("button", { name: "All brands" }).click();
  await page.getByLabel("TBC", { exact: true }).check();
  await page.getByLabel("Silk Bank").check();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /^(Silk Bank|2 brands)/ }).waitFor();
  await expect(page.getByRole("button", { name: "2 brands" })).toBeVisible();

  await page.getByRole("button", { name: "All themes" }).click();
  await page.getByLabel("No theme").check();
  await page.getByLabel("Deposits").check();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "2 themes" })).toBeVisible();

  await page.getByRole("button", { name: "All ad types" }).click();
  await page.getByLabel("Image").check();
  await page.getByLabel("Video").check();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "2 ad types" })).toBeVisible();

  await expect.poll(() => adRequests.at(-1)?.searchParams.getAll("brand_id").length).toBe(2);
  const last = adRequests.at(-1)!;
  expect(last.searchParams.getAll("brand_id")).toHaveLength(2);
  expect(last.searchParams.getAll("theme").sort()).toEqual(["Deposits", "__untagged__"]);
  expect(last.searchParams.getAll("ad_format").sort()).toEqual(["image", "video"]);

  // Clearing goes back to "all".
  await page.getByRole("button", { name: "2 brands" }).click();
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByRole("button", { name: "All brands" })).toBeVisible();
});

test("ad library: the yours/competitors dropdown picks one option and sends it", async ({ page }) => {
  await installMocks(page);
  const adRequests: URL[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname === "/api/ads") adRequests.push(u);
  });
  await page.goto("/ads");
  await settle(page);

  await page.getByRole("button", { name: "Yours + competitors" }).click();
  await page.getByRole("option", { name: "Only yours" }).click();
  await expect(page.getByRole("button", { name: "Only yours" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Only competitors" })).toHaveCount(0); // choosing closes the list
  await expect.poll(() => adRequests.at(-1)?.searchParams.get("own")).toBe("own");

  await page.getByRole("button", { name: "Only yours" }).click();
  await page.getByRole("option", { name: "Yours + competitors" }).click();
  await expect.poll(() => adRequests.at(-1)?.searchParams.get("own")).toBe(null);
});

test("ad library: per-page dropdown changes the page size", async ({ page }) => {
  await installMocks(page);
  const adRequests: URL[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname === "/api/ads") adRequests.push(u);
  });
  await page.goto("/ads");
  await settle(page);
  await page.getByRole("button", { name: "24", exact: true }).click();
  await page.getByRole("option", { name: "48" }).click();
  await expect(page.getByRole("button", { name: "48", exact: true })).toBeVisible();
  await expect.poll(() => adRequests.at(-1)?.searchParams.get("page_size")).toBe("48");
});

test("themes: swapping an AI suggestion's theme from the dropdown", async ({ page }) => {
  await installMocks(page);
  await page.goto("/themes");
  await settle(page);
  await page.getByRole("button", { name: "Suggest tags for untagged ads" }).click();
  const field = page.locator('input[class*="rounded-full"]').first();
  await expect(field).toHaveValue("Deposits");
  await page.getByRole("button", { name: "Swap to…" }).first().click();
  await page.getByRole("option", { name: "Mortgage" }).click();
  await expect(field).toHaveValue("Mortgage");
});

test("team: inviting an outside address lists it as waiting to sign up", async ({ page }) => {
  await installMocks(page);
  await page.goto("/team");
  await settle(page);
  await expect(page.getByText("colleague.on.gmail@gmail.com")).toBeVisible();

  await page.getByLabel("Email address to invite").fill("New.Person@Gmail.com");
  await page.getByRole("button", { name: "viewer", exact: true }).first().click();
  await page.getByRole("option", { name: "editor" }).click();
  await page.getByRole("button", { name: "Add invitation" }).click();

  await expect(page.getByText("new.person@gmail.com can now sign up as editor")).toBeVisible();
  await expect(page.getByLabel("Email address to invite")).toHaveValue("");
  await expect(page.getByText("will join as editor")).toHaveCount(2);
});

test("analysis: the theme table shows the difference between brands, and who is ahead", async ({ page }) => {
  await installMocks(page);
  await page.goto("/analysis");
  await settle(page);

  // One brand has nothing to be compared with.
  await page.getByRole("button", { name: /Bank of Georgia Business/ }).first().click();
  await page.getByRole("button", { name: "Generate comparison" }).click();
  const table = page.locator("table").first();
  await expect(table.getByText("Deposits")).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Difference" })).toHaveCount(0);

  // Two brands: Deposits is 6 vs 2 (gap 4, the first brand ahead); Untagged is 4 vs 5 (gap 1, TBC ahead).
  await page.getByRole("button", { name: /^TBC$/ }).first().click();
  await page.getByRole("button", { name: "Generate comparison" }).click();
  await expect(table.getByRole("columnheader", { name: "Difference" })).toBeVisible();
  const deposits = table.getByRole("row", { name: /^Deposits/ });
  await expect(deposits.getByRole("cell").last()).toContainText(/^4/);
  await expect(deposits.getByRole("cell").last()).toContainText("Bank of Georgia");
  const untagged = table.getByRole("row", { name: /^Untagged/ });
  await expect(untagged.getByRole("cell").last()).toContainText(/^1\s*TBC/);
});

test("analysis: a theme is hidden only when every selected brand has 0 ads in it", async ({ page }) => {
  await installMocks(page);
  await page.goto("/analysis");
  await settle(page);

  // First brand only. In the mock data it has 0 ads in "სამომხმარებლო სესხი" and in "Theme nobody uses".
  await page.getByRole("button", { name: /Bank of Georgia Business/ }).first().click();
  await page.getByRole("button", { name: "Generate comparison" }).click();
  await expect(page.getByText("Ads by theme")).toBeVisible();
  const table = page.locator("table").first();
  await expect(table.getByText("Theme nobody uses")).toHaveCount(0);
  await expect(table.getByText("სამომხმარებლო სესხი")).toHaveCount(0);
  await expect(table.getByText("Deposits")).toBeVisible();
  await expect(page.getByText("2 themes with no ads for the selected brands are hidden.")).toBeVisible();

  // Add a second brand that has ads there: the theme comes back (with a 0 for the first brand).
  await page.getByRole("button", { name: /^TBC$/ }).first().click();
  await page.getByRole("button", { name: "Generate comparison" }).click();
  await expect(table.getByText("სამომხმარებლო სესხი")).toBeVisible();
  await expect(table.getByText("Theme nobody uses")).toHaveCount(0);
  await expect(page.getByText("1 theme with no ads for the selected brands is hidden.")).toBeVisible();
});

test("ad library: filters survive opening an ad and coming back", async ({ page }) => {
  await installMocks(page);
  await page.goto("/ads");
  await settle(page);

  await page.getByRole("button", { name: "All brands" }).click();
  await page.getByLabel("TBC", { exact: true }).check();
  await page.keyboard.press("Escape");
  await page.getByPlaceholder("Search headline, body, CTA…").fill("loan");
  await page.getByLabel("Active only").check();
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("loan");

  await page.locator('a[href^="/ads/ad-"]').first().click();
  await expect(page).toHaveURL(/\/ads\/ad-/);
  await page.getByRole("link", { name: /Back to Ad Library/ }).click();

  await expect(page).toHaveURL(/\/ads\?/);
  const back = new URL(page.url()).searchParams;
  expect(back.get("q")).toBe("loan");
  expect(back.getAll("brand_id")).toHaveLength(1);
  expect(back.get("active_only")).toBe("true");
  await expect(page.getByPlaceholder("Search headline, body, CTA…")).toHaveValue("loan");
  await expect(page.getByRole("button", { name: "TBC", exact: true })).toBeVisible();
  await expect(page.getByLabel("Active only")).toBeChecked();
});

test("ad library: coming back from an ad returns to the same scroll position", async ({ page }) => {
  await installMocks(page);
  await page.goto("/ads");
  await settle(page);
  await page.evaluate(() => window.scrollTo(0, 400));
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(300);

  // dispatchEvent, not click(): click() would first scroll the card into view and move the page.
  await page.locator('a[href^="/ads/ad-"]').nth(1).dispatchEvent("click");
  await expect(page).toHaveURL(/\/ads\/ad-/);
  await page.getByRole("link", { name: /Back to Ad Library/ }).click();
  await expect(page.getByPlaceholder("Search headline, body, CTA…")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before - 40);
});

test("ad page: setting themes by hand shows the marker, and the undo link hands the ad back to the rules", async ({ page }) => {
  await installMocks(page);
  await page.goto("/ads/ad-1"); // an ad whose themes are automatic: no marker yet
  await settle(page);
  await expect(page.getByText("Set by hand")).toHaveCount(0);

  await page.getByRole("button", { name: "+ Add theme…" }).click();
  await page.getByRole("option").first().click();
  await expect(page.getByText("Set by hand")).toBeVisible();
  await expect(page.getByText("Re-tagging skips this ad.")).toBeVisible();

  await page.getByRole("button", { name: "Use automatic tags again" }).click();
  await expect(page.getByText("Set by hand")).toHaveCount(0);
  await expect(page.getByText("Deposits").first()).toBeVisible(); // the rules' tags came back
});

test("ad library: adding a theme from a card saves it without opening the ad", async ({ page }) => {
  await installMocks(page);
  const patches: { url: string; body: { theme_tags?: string[] } }[] = [];
  page.on("request", (r) => {
    if (r.method() === "PATCH" && /\/api\/ads\/ad-/.test(r.url())) patches.push({ url: r.url(), body: JSON.parse(r.postData() ?? "{}") });
  });
  await page.goto("/ads");
  await settle(page);

  // The second card (ad-1) has no themes yet.
  const card = page.locator('a[href="/ads/ad-1"]');
  await expect(card.getByText("Deposits")).toHaveCount(0);
  await card.getByRole("button", { name: "+ Add theme…" }).click();
  await page.getByRole("option", { name: "Deposits" }).click();

  await expect(card.getByText("Deposits")).toBeVisible(); // shown on the card straight away
  await expect(page).toHaveURL(/\/ads(\?|$)/); // and the ad did not open
  expect(patches).toHaveLength(1);
  expect(patches[0].url).toContain("/api/ads/ad-1");
  expect(patches[0].body.theme_tags).toEqual(["Deposits"]);
});

test("ad library: an ad whose image link has expired shows a clear placeholder instead of a blank gap", async ({ page }) => {
  await installMocks(page);
  const deadRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("scontent.example.invalid")) deadRequests.push(r.url());
  });
  await page.goto("/ads");
  await settle(page);

  const card = page.locator('a[href="/ads/ad-5"]');
  await expect(card.getByText("Preview expired")).toBeVisible();
  // Other ads still show their pictures, and the dead link is never even requested.
  await expect(page.getByText("Preview expired")).toHaveCount(1);
  expect(deadRequests).toHaveLength(0);
});

test("themes: 'Fix blank ad copy' runs the repair and reports what it did", async ({ page }) => {
  await installMocks(page);
  await page.goto("/themes");
  await settle(page);
  await page.getByRole("button", { name: "Fix blank ad copy" }).click();
  await expect(page.getByText("Fixed 3 ads; 1 had no text to recover and was cleared.")).toBeVisible();
});

test("brand page: the sync limit starts at 2000 and can be typed higher", async ({ page }) => {
  await installMocks(page);
  const syncBodies: { limit?: number }[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/sync" && r.method() === "POST") syncBodies.push(JSON.parse(r.postData() ?? "{}"));
  });
  await page.goto("/brands/brand-a");
  await settle(page);

  const max = page.locator('input[type="number"]').first();
  await expect(max).toHaveValue("2000");
  await expect(page.getByText("Over 2,000 ads")).toHaveCount(0);

  await max.fill("5000");
  await expect(max).toHaveValue("5000");
  await expect(page.getByText("Over 2,000 ads: costs more and takes longer.").first()).toBeVisible();

  await page.getByRole("button", { name: "Sync", exact: true }).first().click();
  await expect.poll(() => syncBodies.length).toBe(1);
  expect(syncBodies[0].limit).toBe(5000);
});

test("ad library: an ad with a saved picture shows it even though Meta's link has expired", async ({ page }) => {
  await installMocks(page);
  const savedRequests: string[] = [];
  page.on("request", (r) => {
    if (/\/api\/ads\/ad-2\/preview\?i=0$/.test(r.url())) savedRequests.push(r.url());
  });
  await page.goto("/ads");
  await settle(page);

  const card = page.locator('a[href="/ads/ad-2"]');
  await expect(card.locator("img").first()).toBeVisible();
  await expect(card.getByText("Preview expired")).toHaveCount(0);
  expect(savedRequests.length).toBeGreaterThan(0);
  // ad-5 has an expired link and no saved copy: it still shows the placeholder.
  await expect(page.locator('a[href="/ads/ad-5"]').getByText("Preview expired")).toBeVisible();
});

test("brands: 'Save previews' copies the pictures and reports how many", async ({ page }) => {
  await installMocks(page);
  await page.goto("/brands");
  await settle(page);
  await page.getByRole("button", { name: "Save previews" }).click();
  await expect(page.getByText("Saved 5 pictures.")).toBeVisible();
});

test("brand page: a finished sync saves the pictures by itself", async ({ page }) => {
  await installMocks(page);
  await page.goto("/brands/brand-a");
  await settle(page);
  await page.getByRole("button", { name: "Sync", exact: true }).first().click();
  await expect(page.getByText("Found 10 ads. Saved 5 pictures.").first()).toBeVisible({ timeout: 20_000 });
});

test("opening the app saves waiting previews in the background, with a small note", async ({ page }) => {
  await installMocks(page, { pendingPreviews: 3 });
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/ads/save-previews") posts.push(r.url());
  });
  await page.goto("/ads");
  await expect(page.getByRole("status").filter({ hasText: "Saved 3 pictures." })).toBeVisible({ timeout: 20_000 });
  expect(posts.length).toBeGreaterThan(0);
});

test("opening the app does nothing visible when no previews are waiting", async ({ page }) => {
  await installMocks(page, { pendingPreviews: 0 });
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/ads/save-previews") posts.push(r.url());
  });
  await page.goto("/ads");
  await settle(page);
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(posts).toHaveLength(0);
});

test("brands: a notice says how many previews are waiting to be saved", async ({ page }) => {
  await installMocks(page, { pendingPreviews: 7 });
  await page.goto("/brands");
  await settle(page);
  await expect(page.getByText("7 ads have a preview waiting to be saved.")).toBeVisible();
});

test("ad library: a card shows the squarest saved version of an ad that has a vertical and a square one", async ({ page }) => {
  await installMocks(page);
  const requested: string[] = [];
  page.on("request", (r) => {
    if (/\/api\/ads\/ad-7\/preview/.test(r.url())) requested.push(new URL(r.url()).searchParams.get("i") ?? "");
  });
  await page.goto("/ads");
  await settle(page);
  await expect(page.locator('a[href="/ads/ad-7"] img[src*="/preview?i=1"]')).toBeVisible();
  expect(requested).toContain("1"); // the square one
  expect(requested).not.toContain("0"); // not the vertical one cropped into a square
});

test("ad page: every saved version is shown, labelled by shape", async ({ page }) => {
  await installMocks(page);
  await page.goto("/ads/ad-7");
  await settle(page);
  await expect(page.getByText("Vertical", { exact: true })).toBeVisible();
  await expect(page.getByText("Square", { exact: true })).toBeVisible();
  await expect(page.locator('img[src*="/preview?i=0"]')).toBeVisible();
  await expect(page.locator('img[src*="/preview?i=1"]')).toBeVisible();
});

test("themes: general themes and the ones limited to specific pages are listed separately", async ({ page }) => {
  await installMocks(page);
  await page.goto("/themes");
  await settle(page);
  const general = page.locator("section", { has: page.getByRole("heading", { name: "All pages", exact: true }) });
  const specific = page.locator("section", { has: page.getByRole("heading", { name: "Specific pages", exact: true }) });
  await expect(general.getByText("Deposits", { exact: true })).toBeVisible();
  await expect(general.getByText("Student offers")).toHaveCount(0);
  await expect(specific.getByText("Student offers")).toBeVisible();
  await expect(specific.getByText("Only for: TBC", { exact: true })).toBeVisible();
  // a theme can list several pages
  await expect(specific.getByText(/Only for: .*Bank of Georgia Business.*, TBC/)).toBeVisible();
  await expect(specific.getByText("Deposits", { exact: true })).toHaveCount(0);
});

test("themes: a new theme can be limited to several pages at once", async ({ page }) => {
  await installMocks(page);
  const posts: { name?: string; brand_ids?: string[] }[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/themes") posts.push(JSON.parse(r.postData() ?? "{}"));
  });
  await page.goto("/themes");
  await settle(page);
  const form = page.locator("form", { has: page.getByRole("heading", { name: "Add a theme" }) });
  await form.getByPlaceholder("e.g. Remittance offers").fill("Premium cards");
  await form.getByPlaceholder("e.g. remittance, transfer, გზავნილი").fill("premium, infinite");
  await form.getByRole("button", { name: "All pages" }).click();
  await page.getByLabel("TBC", { exact: true }).check();
  await page.getByLabel("Silk Bank").check();
  await page.keyboard.press("Escape");
  await expect(form.getByRole("button", { name: "2 pages" })).toBeVisible();
  await form.getByRole("button", { name: "Add theme" }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].name).toBe("Premium cards");
  expect([...(posts[0].brand_ids ?? [])].sort()).toEqual(["brand-b", "brand-d"]);
  await expect(page.locator("section", { has: page.getByRole("heading", { name: "Specific pages", exact: true }) }).getByText("Premium cards")).toBeVisible();
});

test("themes: editing a theme can change which pages it applies to", async ({ page }) => {
  await installMocks(page);
  const patches: { brand_ids?: string[] }[] = [];
  page.on("request", (r) => {
    if (r.method() === "PATCH" && /\/api\/themes\/t3$/.test(r.url())) patches.push(JSON.parse(r.postData() ?? "{}"));
  });
  await page.goto("/themes");
  await settle(page);
  // "Deposits" is a general theme: limit it to TBC and Silk Bank.
  const card = page.locator("div.rounded-xl", { hasText: "Deposits" }).filter({ has: page.getByRole("button", { name: "Edit" }) }).first();
  await card.getByRole("button", { name: "Edit" }).click();
  const editor = page.locator("div.rounded-xl", { has: page.getByRole("button", { name: "Save", exact: true }) }).first();
  await editor.getByRole("button", { name: "All pages" }).click();
  await page.getByLabel("TBC", { exact: true }).check();
  await page.getByLabel("Silk Bank").check();
  await page.keyboard.press("Escape");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => patches.length).toBe(1);
  expect([...(patches[0].brand_ids ?? [])].sort()).toEqual(["brand-b", "brand-d"]);
});

test("themes: a general theme can exclude a theme that belongs to one page", async ({ page }) => {
  await installMocks(page);
  const patches: { excludes?: string[] }[] = [];
  page.on("request", (r) => {
    if (r.method() === "PATCH" && /\/api\/themes\/t3$/.test(r.url())) patches.push(JSON.parse(r.postData() ?? "{}"));
  });
  await page.goto("/themes");
  await settle(page);

  // The add form offers every theme, including "Student offers" which only TBC has.
  await expect(page.getByRole("button", { name: "Student offers", exact: true }).first()).toBeVisible();

  // "Deposits" is general; "Student offers" is TBC-only. It can still be excluded.
  const card = page.locator("div.rounded-xl", { hasText: "Deposits" }).filter({ has: page.getByRole("button", { name: "Edit" }) }).first();
  await card.getByRole("button", { name: "Edit" }).click();
  const editor = page.locator("div.rounded-xl", { has: page.getByRole("button", { name: "Save", exact: true }) }).first();
  await editor.getByRole("button", { name: "Student offers", exact: true }).click();
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0].excludes).toEqual(["Student offers"]);
});

test("ads: an ad is only offered the general themes and the ones that list its page", async ({ page }) => {
  await installMocks(page);
  // ad-1 belongs to TBC: it may get TBC's themes, including the two-page one.
  await page.goto("/ads/ad-1");
  await settle(page);
  await page.getByRole("button", { name: "+ Add theme…" }).click();
  await expect(page.getByRole("option", { name: "Student offers" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Premium offers" })).toBeVisible();
  await page.keyboard.press("Escape");
  // ad-0 belongs to Bank of Georgia: the two-page theme lists it, TBC's own theme does not.
  await page.goto("/ads/ad-0");
  await settle(page);
  await page.getByRole("button", { name: "+ Add theme…" }).click();
  await expect(page.getByRole("option", { name: "Premium offers" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Student offers" })).toHaveCount(0);
});

test("ad library: the theme filter lists every theme name once", async ({ page }) => {
  await installMocks(page);
  await page.goto("/ads");
  await settle(page);
  await page.getByRole("button", { name: "All themes" }).click();
  await expect(page.getByLabel("Student offers")).toHaveCount(1);
  await expect(page.getByLabel("Premium offers")).toHaveCount(1);
  await expect(page.getByLabel("Deposits")).toHaveCount(1);
});

test("ad library: choosing pages narrows the theme filter to the themes those pages have", async ({ page }) => {
  await installMocks(page);
  await page.goto("/ads");
  await settle(page);

  // No page chosen: every theme is listed.
  await page.getByRole("button", { name: "All themes" }).click();
  await expect(page.getByLabel("Mortgage")).toHaveCount(1);
  await expect(page.getByLabel("Student offers")).toHaveCount(1);
  await page.keyboard.press("Escape");

  // Silk Bank only has "Deposits" ads: nothing else (and no "No theme") is offered.
  await page.getByRole("button", { name: "All brands" }).click();
  await page.getByLabel("Silk Bank").check();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "All themes" }).click();
  await expect(page.getByLabel("Deposits")).toHaveCount(1);
  await expect(page.getByLabel("Mortgage")).toHaveCount(0);
  await expect(page.getByLabel("Student offers")).toHaveCount(0);
  await expect(page.getByLabel("No theme")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Adding a second page adds the themes that page has.
  await page.getByRole("button", { name: "Silk Bank" }).click();
  await page.getByLabel("A Very Long Competitor").check();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "All themes" }).click();
  await expect(page.getByLabel("Mortgage")).toHaveCount(1);
  await expect(page.getByLabel("Deposits")).toHaveCount(1);
  await expect(page.getByLabel("Student offers")).toHaveCount(0);

  // A theme already picked that the pages no longer have is dropped.
  await page.getByLabel("Mortgage").check();
  await page.keyboard.press("Escape");
  await expect(page.locator('button[aria-haspopup="true"]', { hasText: "Mortgage" })).toBeVisible();
  await page.getByRole("button", { name: "2 brands" }).click();
  await page.getByLabel("A Very Long Competitor").uncheck();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "All themes" })).toBeVisible();
});

test("ad library: clicking a theme on a card filters the list by it, without opening the ad", async ({ page }) => {
  await installMocks(page);
  const adRequests: URL[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname === "/api/ads") adRequests.push(u);
  });
  await page.goto("/ads");
  await settle(page);

  await page.getByTitle("Show all ads with “Mortgage”").first().click();
  await expect(page).toHaveURL(/\/ads\?theme=Mortgage/);
  await expect(page.locator('button[aria-haspopup="true"]', { hasText: "Mortgage" })).toBeVisible();
  await expect.poll(() => adRequests.at(-1)?.searchParams.getAll("theme")).toEqual(["Mortgage"]);
});

test("ad detail: a theme links to the Ad Library filtered by it", async ({ page }) => {
  await installMocks(page);
  await page.goto("/ads/ad-2");
  await settle(page);
  await page.getByRole("link", { name: "Mortgage" }).click();
  await expect(page).toHaveURL(/\/ads\?theme=Mortgage/);
});

test("ad library: a page number past the end moves to the last page instead of a dead end", async ({ page }) => {
  await installMocks(page);
  await page.goto("/ads?page=9");
  await settle(page);
  await expect(page.getByText("Open a deposit")).toBeVisible();
  await expect(page.getByText("No ads yet")).toHaveCount(0);
  await expect(page).not.toHaveURL(/page=9/);
});

test("ad library: sorting sends the choice, and 'Active first' is the default", async ({ page }) => {
  await installMocks(page);
  const adRequests: URL[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname === "/api/ads") adRequests.push(u);
  });
  await page.goto("/ads");
  await settle(page);
  expect(adRequests.at(-1)?.searchParams.get("sort")).toBeNull();
  await page.getByRole("button", { name: "Active first", exact: true }).click();
  await page.getByRole("option", { name: "Platform" }).click();
  await expect.poll(() => adRequests.at(-1)?.searchParams.get("sort")).toBe("platform");
  await expect(page).toHaveURL(/sort=platform/);
  await page.getByRole("button", { name: "Platform", exact: true }).click();
  await page.getByRole("option", { name: "Newest first" }).click();
  await expect.poll(() => adRequests.at(-1)?.searchParams.get("sort")).toBe("newest");
  await page.getByRole("button", { name: "Newest first", exact: true }).click();
  await page.getByRole("option", { name: "Active first" }).click();
  await expect.poll(() => adRequests.at(-1)?.searchParams.get("sort")).toBeNull();
});

test("ad library: when filters match nothing it says so and offers to clear them", async ({ page }) => {
  await installMocks(page);
  await page.route("**/api/ads?*", async (route) => {
    const u = new URL(route.request().url());
    if (u.searchParams.get("q") === "zzzz") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ads: [], total: 0, page: 0, pageSize: 24 }) });
    return route.fallback();
  });
  await page.goto("/ads");
  await settle(page);
  await page.getByPlaceholder("Search headline, body, CTA…").fill("zzzz");
  await expect(page.getByText("No ads match these filters.")).toBeVisible();
  await expect(page.getByText("No ads yet")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByPlaceholder("Search headline, body, CTA…")).toHaveValue("");
  await expect(page.getByText("Open a deposit")).toBeVisible();
});

test("ad library: the filter buttons keep their size when something is chosen", async ({ page }) => {
  await installMocks(page);
  await page.goto("/ads");
  await settle(page);
  const search = page.getByPlaceholder("Search headline, body, CTA…");
  const widths = async () => ({
    brands: (await page.locator("div.rounded-xl").filter({ has: search }).locator("button[aria-haspopup]").first().boundingBox())?.width,
    search: (await search.boundingBox())?.width,
  });
  const before = await widths();
  await page.getByRole("button", { name: "All brands" }).click();
  await page.getByLabel("A Very Long Competitor").check();
  await page.keyboard.press("Escape");
  const after = await widths();
  expect(after.brands).toBe(before.brands);
  expect(after.search).toBe(before.search);
});

test("analysis: 'total seen' is only shown when it differs from 'active'", async ({ page }) => {
  await installMocks(page);
  await page.goto("/analysis");
  await settle(page);
  await page.getByRole("button", { name: /^TBC$/ }).first().click();
  await page.getByRole("button", { name: "Generate comparison" }).click();
  await expect(page.getByText("Ads by theme")).toBeVisible();
  await expect(page.getByText("total seen")).toHaveCount(0);
  await page.getByLabel("Active ads only").uncheck();
  await page.getByRole("button", { name: "Generate comparison" }).click();
  await expect(page.getByText("total seen")).toBeVisible();
});

test("analysis: the theme table downloads as a CSV file", async ({ page }) => {
  await installMocks(page);
  await page.goto("/analysis");
  await settle(page);
  for (const label of [/Bank of Georgia Business/, /^TBC$/]) await page.getByRole("button", { name: label }).first().click();
  await page.getByRole("button", { name: "Generate comparison" }).click();
  await expect(page.getByText("Ads by theme")).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download CSV" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^theme-comparison-all-\d{4}-\d{2}-\d{2}\.csv$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  expect(text.charCodeAt(0)).toBe(0xfeff); // Excel reads Georgian text correctly with this marker
  expect(text).toContain("Theme,");
  expect(text).toContain("Difference,Ahead");
  expect(text).toContain("Deposits,6,2,4,");
  expect(text).toContain("სამომხმარებლო სესხი");
});

test("analysis: printing hides the menus and controls (Save as PDF)", async ({ page }) => {
  await installMocks(page);
  await page.goto("/analysis");
  await settle(page);
  await page.getByRole("button", { name: /^TBC$/ }).first().click();
  await page.getByRole("button", { name: "Generate comparison" }).click();
  await expect(page.getByText("Ads by theme")).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: "Generate comparison" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Download CSV" })).toBeHidden();
  await expect(page.getByRole("link", { name: "Ad Library" })).toBeHidden();
  await expect(page.getByText("Ads by theme")).toBeVisible();
});

test("analysis: a busy AI service shows a plain message and 'Try again' works", async ({ page }) => {
  await installMocks(page);
  let calls = 0;
  await page.route("**/api/analysis/insights", async (route) => {
    calls += 1;
    if (calls === 1) {
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "The AI service is busy right now. Try again in a minute.", retryable: true }) });
    }
    return route.fallback();
  });
  await page.goto("/analysis");
  await settle(page);
  await page.getByRole("button", { name: /^TBC$/ }).first().click();
  await page.getByRole("button", { name: "Generate comparison" }).click();
  await page.getByRole("button", { name: "Generate AI insights" }).click();
  await expect(page.getByText("The AI service is busy right now. Try again in a minute.")).toBeVisible();
  await expect(page.getByText("{")).toHaveCount(0);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("30-day action checklist")).toBeVisible();
  await expect(page.getByText("The AI service is busy")).toHaveCount(0);
});

test("analysis: AI insights show progress and can be cancelled", async ({ page }) => {
  await installMocks(page);
  await page.route("**/api/analysis/insights", () => new Promise(() => {})); // never answers
  await page.goto("/analysis");
  await settle(page);
  await page.getByRole("button", { name: /^TBC$/ }).first().click();
  await page.getByRole("button", { name: "Generate comparison" }).click();
  await page.getByRole("button", { name: "Generate AI insights" }).click();
  await expect(page.getByRole("status")).toContainText("Asking Gemini");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Generate AI insights" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
});

test.describe("login (signed out)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login page", async ({ page }, testInfo) => {
    await page.goto("/login");
    await settle(page);
    const issues = await auditLayout(page);
    expect(issues, `Layout problems on login (${testInfo.project.name}):\n${formatIssues(issues)}\n`).toEqual([]);
    await expect(page).toHaveScreenshot("login.png", { fullPage: true });
  });
});
