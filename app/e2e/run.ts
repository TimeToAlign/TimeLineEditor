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
 * (Chromium's shared memory).
 *
 * Usage: `node e2e/run.ts [playwright test arguments]`.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const appRoot = path.resolve(import.meta.dirname, "..");
const cli = path.join(appRoot, "node_modules", "@playwright", "test", "cli.js");
const { version } = JSON.parse(
  readFileSync(path.join(appRoot, "node_modules", "@playwright", "test", "package.json"), "utf8"),
) as { version: string };
const image = `mcr.microsoft.com/playwright:v${version}-noble`;
const args = process.argv.slice(2);

const inImage = process.env.PLAYWRIGHT_BROWSERS_PATH === "/ms-playwright";
const run = inImage
  ? spawnSync(process.execPath, [cli, "test", ...args], { cwd: appRoot, stdio: "inherit" })
  : spawnSync(
      "podman",
      [
        "run",
        "--rm",
        "--init",
        "--network=host",
        "--ipc=host",
        `--volume=${appRoot}:${appRoot}:z`,
        `--workdir=${appRoot}`,
        ...(process.env.CI ? ["--env=CI"] : []),
        image,
        "node",
        "e2e/run.ts",
        ...args,
      ],
      { stdio: "inherit" },
    );

if (run.error) throw run.error;
process.exit(run.status ?? 1);
