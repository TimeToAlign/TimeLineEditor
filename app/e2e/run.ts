/**
 * Runs `playwright test` with the given arguments inside the Playwright image
 * whose version matches the installed `@playwright/test`.
 *
 * Screenshots are rendered and compared only there, and WebKit's Linux build
 * needs the image's system libraries on hosts other than Ubuntu. Inside the
 * image (detected by its browser path, which is also how CI runs) Playwright
 * is started directly; elsewhere the same command is re-run through rootless
 * podman with the app directory mounted at its own path, the host network
 * (the preview server and the browsers share it) and the host IPC namespace
 * (Chromium's shared memory), and `CI` and `TILIE_E2E_WORKERS` passed in
 * when set. A schema package linked from a sibling checkout lies outside the
 * app directory; it is mounted read-only at its own path as well
 * (`container.ts`).
 *
 * Usage: `node e2e/run.ts [playwright test arguments]`.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { podmanArguments } from "./container.ts";

const appRoot = path.resolve(import.meta.dirname, "..");
const cli = path.join(appRoot, "node_modules", "@playwright", "test", "cli.js");
const { version } = JSON.parse(
  readFileSync(path.join(appRoot, "node_modules", "@playwright", "test", "package.json"), "utf8"),
) as { version: string };
const image = `mcr.microsoft.com/playwright:v${version}-noble`;
const args = process.argv.slice(2);
/** The variables the configuration reads, passed into the container when set. */
const env = ["CI", "TILIE_E2E_WORKERS"].filter((name) => process.env[name]);

/** The real directory of the `@timetoalign/timeskeleton` the packages resolve. */
const schemaPackage = realpathSync(
  path.dirname(
    createRequire(path.join(appRoot, "packages", "core", "package.json")).resolve(
      "@timetoalign/timeskeleton/package.json",
    ),
  ),
);

const inImage = process.env.PLAYWRIGHT_BROWSERS_PATH === "/ms-playwright";
const run = inImage
  ? spawnSync(process.execPath, [cli, "test", ...args], { cwd: appRoot, stdio: "inherit" })
  : spawnSync("podman", podmanArguments({ appRoot, schemaPackage, image, env, args }), {
      stdio: "inherit",
    });

if (run.error) throw run.error;
process.exit(run.status ?? 1);
