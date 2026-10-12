import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests of the built editor in three engines and on a touch
 * device. Every run happens inside the Playwright image of the pinned
 * version (see `e2e/run.ts`), so screenshots are compared against baselines
 * rendered by the same browser builds and fonts.
 *
 * Tags select the special projects: `@visual` tests run only in `visual`,
 * `@budget` tests only in `budget`; both are excluded from the engine
 * projects. `touch.spec.ts` runs only in `touch`, and the desktop specs only
 * in the three engine projects.
 */

const PORT = 4317;
const SPECIAL = /@visual|@budget/;
const desktop = { viewport: { width: 1280, height: 800 } };

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  outputDir: "e2e/test-results",
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 2,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    trace: "retain-on-failure",
  },
  expect: {
    toHaveScreenshot: { maxDiffPixels: 0, threshold: 0, animations: "disabled" },
  },
  projects: [
    {
      name: "chromium",
      testIgnore: "touch.spec.ts",
      grepInvert: SPECIAL,
      use: { ...devices["Desktop Chrome"], ...desktop },
    },
    {
      name: "firefox",
      testIgnore: "touch.spec.ts",
      grepInvert: SPECIAL,
      use: { ...devices["Desktop Firefox"], ...desktop },
    },
    {
      name: "webkit",
      testIgnore: "touch.spec.ts",
      grepInvert: SPECIAL,
      use: { ...devices["Desktop Safari"], ...desktop },
    },
    {
      name: "touch",
      testMatch: "touch.spec.ts",
      grepInvert: SPECIAL,
      use: { ...devices["Pixel 7"], hasTouch: true, isMobile: true },
    },
    {
      name: "visual",
      grep: /@visual/,
      use: { ...devices["Desktop Chrome"], ...desktop },
    },
    {
      name: "budget",
      grep: /@budget/,
      use: { ...devices["Desktop Chrome"], ...desktop },
    },
  ],
  webServer: {
    // The editor's own Vite binaries, so the command needs no package manager
    // inside the image. The test hook is compiled in only by this build, which
    // goes to `dist-e2e`, never to `dist` (the folder the wheel bundles).
    command: `node_modules/.bin/vite build --outDir dist-e2e && node_modules/.bin/vite preview --outDir dist-e2e --port ${PORT} --strictPort --host 127.0.0.1`,
    cwd: "packages/editor",
    env: { VITE_TILIE_TEST_HOOK: "1" },
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
