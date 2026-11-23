/**
 * A page whose tilie-server is stubbed in the page's routes, for the specs
 * of the MatchClaim tables: the table route replayed from the client's
 * recording, the health check answered, refused or held until the spec
 * answers it, and the user's files on the server (`story/` holding the
 * table fixture's manifest alone, `other/` its MatchClaim table).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { packageDir, SCHEMA_VERSION } from "./schema.ts";
import { chooseItem, withoutPickers } from "./support.ts";

const TABLES = path.join(packageDir, "fixtures", "tables", SCHEMA_VERSION);
export const MANIFEST = readFileSync(path.join(TABLES, "manifest.yaml"));
export const PARQUET = readFileSync(path.join(TABLES, "match_claims.parquet"));
export const ANSWER = readFileSync(
  path.join(import.meta.dirname, "../packages/client/tests/data/match-claims.answer.bin"),
);

/** What the header's offline mark says after the refused health check. */
export const HEALTH_FAILURE =
  "The server did not answer the health check (503 Service Unavailable).";

/** How the health check is met: answered at once, refused with 503, or held until `answer()`. */
export type Health = "answered" | "refused" | "held";

/** The stubbed server: the table requests it answered, and the answer of a held health check. */
export interface Served {
  readonly requests: number;
  /** Answer the held health check (nothing for one answered or refused already). */
  answer(): void;
}

/**
 * Stub the page's health check as `health` says; the function answering
 * it where it is held (doing nothing otherwise).
 */
async function stubHealth(page: Page, health: Health): Promise<() => void> {
  let answer: () => void = () => undefined;
  const answered = new Promise<void>((resolve) => {
    answer = resolve;
  });
  await page.route("**/api/health", async (route) => {
    if (health === "held") await answered;
    return health === "refused"
      ? route.fulfill({ status: 503, body: "" })
      : route.fulfill({ json: { name: "tilie-server", version: "0.1.0", timetoalign: "1.2.0" } });
  });
  return answer;
}

/** The answers of the health checks `holdHealth` holds, by page. */
const heldChecks = new WeakMap<Page, () => void>();

/**
 * Hold the page's health check, before the page is opened: until
 * `answerHealth` answers it, the editor uses the browser's pickers and
 * reads no table.
 */
export async function holdHealth(page: Page): Promise<void> {
  heldChecks.set(page, await stubHealth(page, "held"));
}

/** Answer the health check `holdHealth` held; resolves once the editor has the answer. */
export async function answerHealth(page: Page): Promise<void> {
  const answer = heldChecks.get(page);
  if (answer === undefined) throw new Error("no health check is held");
  answer();
  await page.waitForFunction(() => window.__tilie.health() !== null);
}

/**
 * Open a fresh page whose table requests the recording answers, counting
 * them, its health check met as `health` says, the user's files on the
 * server. Returns once the page is up and, unless held, the check met.
 */
export async function openPage(page: Page, health: Health = "answered"): Promise<Served> {
  await withoutPickers(page);
  const seen = { requests: 0, answer: await stubHealth(page, health) };
  await page.route("**/api/match-claims", async (route) => {
    seen.requests += 1;
    await route.fulfill({ status: 200, contentType: "application/octet-stream", body: ANSWER });
  });
  const files = new Map<string, Buffer>([
    ["story/manifest.yaml", MANIFEST],
    ["other/match_claims.parquet", PARQUET],
  ]);
  await page.route("**/api/folders?*", (route) => {
    const at = new URL(route.request().url()).searchParams.get("path") ?? "";
    const folders = at === "" ? ["other", "story"] : [];
    const prefix = at === "" ? "" : `${at}/`;
    const held = [...files.keys()].filter(
      (file) => file.startsWith(prefix) && !file.slice(prefix.length).includes("/"),
    );
    const entries = [
      ...folders.map((name) => ({ name, kind: "folder" })),
      ...held.map((file) => ({ name: file.slice(prefix.length), kind: "file" })),
    ];
    return route.fulfill({ json: { path: at, entries } });
  });
  await page.route("**/api/files?*", (route) => {
    const found = files.get(new URL(route.request().url()).searchParams.get("path") ?? "");
    return found === undefined
      ? route.fulfill({ status: 404, json: { detail: "no such file" } })
      : route.fulfill({ body: found, contentType: "application/octet-stream" });
  });
  await page.goto("/");
  await page.waitForFunction(() => window.__tilie !== undefined);
  if (health === "answered") await page.waitForFunction(() => window.__tilie.health() !== null);
  if (health === "refused") {
    await expect(page.locator(".offline")).toHaveAttribute("title", HEALTH_FAILURE);
  }
  return seen;
}

/** The IDs of the workspace's blocks. */
export function blocks(page: Page): Promise<string[]> {
  return page.evaluate(() => Object.keys(window.__tilie.store().view.blocks));
}

/** Import the table fixture's manifest from `story/` through "Import manifest…" and the file dialog; its block. */
export async function importManifest(page: Page): Promise<string> {
  await chooseItem(page, "Import manifest…");
  const open = page.getByRole("dialog", { name: "Open" });
  await open.getByRole("option", { name: "story/" }).dblclick();
  await open.getByRole("option", { name: "manifest.yaml" }).dblclick();
  await expect.poll(() => blocks(page)).toHaveLength(1);
  return (await blocks(page))[0] ?? "";
}
