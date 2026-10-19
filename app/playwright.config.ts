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
 *
 * `TILIE_E2E_WORKERS`, a positive integer, sets the number of workers
 * (default 4).
 */

const PORT = 4317;
const SPECIAL = /@visual|@budget/;
const desktop = { viewport: { width: 1280, height: 800 } };

/** The worker count from `TILIE_E2E_WORKERS`, 4 when it is unset or empty. */
function workers(): number {
  const value = process.env.TILIE_E2E_WORKERS;
  if (!value) return 4;
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`TILIE_E2E_WORKERS must be a positive integer, not ${JSON.stringify(value)}`);
  }
  return Number(value);
}

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  outputDir: "e2e/test-results",
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: workers(),
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
    // inside the image. The test hook is compiled in only by these builds, which
    // go to `dist-e2e`, never to `dist` (the folder the wheel bundles): the page
    // at its root, the embed (`tilie.js`, `tilie.css`, `assets/`) under `embed/`,
    // where `embed.spec.ts` loads it into a host page of its own.
    command: [
      "node_modules/.bin/vite build --outDir dist-e2e",
      "node_modules/.bin/vite build --mode embed --outDir dist-e2e/embed",
      `node_modules/.bin/vite preview --outDir dist-e2e --port ${PORT} --strictPort --host 127.0.0.1`,
    ].join(" && "),
    cwd: "packages/editor",
    env: { VITE_TILIE_TEST_HOOK: "1" },
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
