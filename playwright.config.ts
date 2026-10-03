import { defineConfig } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const AUTH_FILE = "e2e/.auth/state.json";
const selftestOnly = process.env.E2E_SELFTEST === "1";

// Three screen sizes cover the layouts that actually differ in this app
// (single column / two columns / full grid).
const SIZES = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
} as const;

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000, toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" } },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  // Baseline screenshots are machine-specific (fonts/anti-aliasing), so they live
  // next to the tests but are not committed — see .gitignore.
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
  use: { baseURL: BASE_URL, locale: "en-GB", timezoneId: "Asia/Tbilisi", colorScheme: "light", reducedMotion: "reduce" },
  projects: [
    { name: "selftest", testMatch: /audit\.selftest\.spec\.ts/ },
    ...Object.entries(SIZES).map(([name, viewport]) => ({
      name,
      testMatch: /pages\.spec\.ts/,
      use: { viewport, storageState: AUTH_FILE },
    })),
  ],
  // Reuse a dev server if one is already running on :3000.
  webServer: selftestOnly
    ? undefined
    : { command: "npm run dev", url: BASE_URL, reuseExistingServer: true, timeout: 120_000 },
});
