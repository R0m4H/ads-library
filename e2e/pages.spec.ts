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
