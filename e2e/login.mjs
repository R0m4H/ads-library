// One-time sign-in helper for the layout tests.
//
// Opens a real browser window, you sign in yourself, and the session cookies are
// saved to e2e/.auth/state.json (git-ignored). The tests then reuse that session.
// Your password is typed into the app's own login page — this script never sees it.
//
// Use an account with the Owner role so every page (including Team) can be tested.
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const OUT = "e2e/.auth/state.json";

fs.mkdirSync("e2e/.auth", { recursive: true });

let browser;
try {
  browser = await chromium.launch({ headless: false, channel: "chrome" });
} catch {
  browser = await chromium.launch({ headless: false });
}
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(`${BASE_URL}/login`);

console.log("\nA browser window opened. Sign in there (use an Owner account).");
console.log("Waiting up to 5 minutes for you to finish…\n");

await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 5 * 60_000 });
await page.waitForLoadState("networkidle").catch(() => {});
await context.storageState({ path: OUT });
await browser.close();
console.log(`Saved session to ${OUT}. You can now run: npm run e2e:update  (first time)  or  npm run e2e`);
