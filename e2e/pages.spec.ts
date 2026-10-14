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
