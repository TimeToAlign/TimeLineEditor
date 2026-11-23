/**
 * Loading the MatchClaim table a manifest names, in the built editor. With
 * a server answering its health check (stubbed, with the user's files on
 * it): the table fixture opened from the Fixture menu, whose MatchClaim
 * table is served beside it, loads it without a question; the same
 * manifest imported from a folder of the server's files that does not
 * hold its table asks for it in the tables dialog, which takes a file
 * located in the editor's file dialog or a URL, or is cancelled. Without a
 * server answering (the health check refused), turning Show matches on and
 * Load MatchClaims… ask nothing: the message bar says that matches need a
 * running server and how to start one. The server's table route is
 * replayed from the client's recording; loading is started by turning
 * Show matches on, by its key or its toolbar button, or by the Matchstamp
 * tab's Load MatchClaims…, which asks in the same dialog.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { packageDir, SCHEMA_VERSION } from "./schema.ts";
import { arranger, chooseItem, select, tabs, withoutPickers } from "./support.ts";

const TABLES = path.join(packageDir, "fixtures", "tables", SCHEMA_VERSION);
const MANIFEST = readFileSync(path.join(TABLES, "manifest.yaml"));
const PARQUET = readFileSync(path.join(TABLES, "match_claims.parquet"));
const ANSWER = readFileSync(
  path.join(import.meta.dirname, "../packages/client/tests/data/match-claims.answer.bin"),
);
const ROWS: number = JSON.parse(
  ANSWER.subarray(4, 4 + ANSWER.readUInt32LE(0)).toString("utf8"),
).rows;
const URL_OF_TABLE = "https://tables.example.org/package/match_claims.parquet";
const DIALOG = "Load the MatchClaim table of The manifest";
const NOT_BESIDE = "match_claims.parquet is not beside The manifest, at story/manifest.yaml";

const HEALTH_FAILURE = "The server did not answer the health check (503 Service Unavailable).";
const NO_SERVER =
  "Matches need a running server: MatchClaim tables are read through tilie-server. " +
  "Start it from the repository's `server/` folder with " +
  "`uv run tilie --static-dir ../app/packages/editor/dist` " +
  "(or `tilie` once installed with `pip install tilie-server`), " +
  "then open the editor at the address it prints.";

/**
 * Open a fresh page whose table requests the recording answers, counting
 * them; its health check answered (with the user's files: `story/` holding
 * the table fixture's manifest alone, `other/` its MatchClaim table) or,
 * with `answered` false, refused.
 */
async function openPage(page: Page, answered = true): Promise<{ requests: number }> {
  const seen = { requests: 0 };
  await withoutPickers(page);
  await page.route("**/api/match-claims", async (route) => {
    seen.requests += 1;
    await route.fulfill({ status: 200, contentType: "application/octet-stream", body: ANSWER });
  });
  await page.route("**/api/health", (route) =>
    answered
      ? route.fulfill({ json: { name: "tilie-server", version: "0.1.0", timetoalign: "1.2.0" } })
      : route.fulfill({ status: 503, body: "" }),
  );
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
  if (answered) await page.waitForFunction(() => window.__tilie.health() !== null);
  else await expect(page.locator(".offline")).toHaveAttribute("title", HEALTH_FAILURE);
  return seen;
}

function blocks(page: Page): Promise<string[]> {
  return page.evaluate(() => Object.keys(window.__tilie.store().view.blocks));
}

/** The status line of block `block`'s table in the Matchstamp tab. */
async function tableStatus(page: Page, block: string) {
  await select(page, [{ block }]);
  const open = page.getByRole("button", { name: "Open inspector" });
  if (await open.isVisible()) await open.click();
  await tabs(page).getByRole("tab", { name: "Matchstamp", exact: true }).click();
  return page.getByTestId("matchclaims-status");
}

/** Turn Show matches on with its key, the arranger focused. */
async function pressM(page: Page): Promise<void> {
  await arranger(page).focus();
  await page.keyboard.press("m");
}

/** Turn Show matches on with its toolbar button. */
async function showMatches(page: Page): Promise<void> {
  await page.getByTestId("matches").click();
}

/** Import the table fixture's manifest from `story/` through "Import manifest…" and the file dialog; its block. */
async function importManifest(page: Page): Promise<string> {
  await chooseItem(page, "Import manifest…");
  const open = page.getByRole("dialog", { name: "Open" });
  await open.getByRole("option", { name: "story/" }).dblclick();
  await open.getByRole("option", { name: "manifest.yaml" }).dblclick();
  await expect.poll(() => blocks(page)).toHaveLength(1);
  return (await blocks(page))[0] ?? "";
}

/** Locate the MatchClaim table at `other/match_claims.parquet` from the tables dialog `dialog`. */
async function locateTable(page: Page, dialog: Locator): Promise<void> {
  await dialog.getByRole("button", { name: "Locate…" }).click();
  const open = page.getByRole("dialog", { name: "Open" });
  await open.getByRole("button", { name: "Root" }).click();
  await open.getByRole("option", { name: "other/" }).dblclick();
  await open.getByRole("option", { name: "match_claims.parquet" }).dblclick();
}

test("a fixture whose tables are served beside it loads them without a question", async ({
  page,
}) => {
  const seen = await openPage(page);
  await page.getByTestId("fixture-select").selectOption("tables/manifest");
  await page.getByTestId("fixture-open").click();
  await expect.poll(() => blocks(page)).toHaveLength(1);
  const [block] = await blocks(page);
  await pressM(page);
  await expect.poll(() => seen.requests).toBe(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(await tableStatus(page, block ?? "")).toHaveText(
    `match_claims.parquet: ${ROWS} MatchClaims`,
  );
});

test("a manifest whose table is not beside it asks for it, and loads the file located", async ({
  page,
}) => {
  const seen = await openPage(page);
  const block = await importManifest(page);
  await showMatches(page);
  const dialog = page.getByRole("dialog", { name: NOT_BESIDE });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Load" })).toBeDisabled();
  await expect(dialog.getByRole("group")).toHaveText([/MatchClaim table\s+match_claims\.parquet/u]);
  await locateTable(page, dialog);
  await expect(dialog).toBeHidden();
  await expect.poll(() => seen.requests).toBe(1);
  await expect(await tableStatus(page, block)).toHaveText(
    `match_claims.parquet: ${ROWS} MatchClaims`,
  );
});

test("Load MatchClaims… asks for the MatchClaim table the manifest names", async ({ page }) => {
  const seen = await openPage(page);
  const block = await importManifest(page);
  const status = await tableStatus(page, block);
  await expect(status).toHaveText("No MatchClaim table loaded.");
  await page.getByRole("button", { name: "Load MatchClaims…" }).click();
  const dialog = page.getByRole("dialog", { name: DIALOG });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("group")).toHaveText([/MatchClaim table\s+match_claims\.parquet/u]);
  await locateTable(page, dialog);
  await expect(dialog).toBeHidden();
  await expect.poll(() => seen.requests).toBe(1);
  await expect(status).toHaveText(`match_claims.parquet: ${ROWS} MatchClaims`);
});

test("a table is read from the URL the user enters", async ({ page }) => {
  const seen = await openPage(page);
  const fetched: string[] = [];
  await page.route(URL_OF_TABLE, async (route) => {
    fetched.push(route.request().url());
    await route.fulfill({
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      contentType: "application/vnd.apache.parquet",
      body: PARQUET,
    });
  });
  const block = await importManifest(page);
  await showMatches(page);
  const dialog = page.getByRole("dialog", { name: NOT_BESIDE });
  await dialog.getByRole("textbox", { name: "URL of the MatchClaim table" }).fill(URL_OF_TABLE);
  await dialog.getByRole("button", { name: "Load" }).click();
  await expect.poll(() => seen.requests).toBe(1);
  expect(fetched).toEqual([URL_OF_TABLE]);
  await expect(await tableStatus(page, block)).toHaveText(
    `match_claims.parquet: ${ROWS} MatchClaims`,
  );
});

test("cancelled, the dialog loads nothing and says nothing", async ({ page }) => {
  const seen = await openPage(page);
  await importManifest(page);
  const before = await page.getByTestId("message").count();
  await showMatches(page);
  const dialog = page.getByRole("dialog", { name: NOT_BESIDE });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect(seen.requests).toBe(0);
  expect(await page.getByTestId("message").count()).toBe(before);
});

test("without a server answering, M and Load MatchClaims… ask nothing and say how to start one", async ({
  page,
}) => {
  const seen = await openPage(page, false);
  await page.getByTestId("fixture-select").selectOption("tables/manifest");
  await page.getByTestId("fixture-open").click();
  await expect.poll(() => blocks(page)).toHaveLength(1);
  const [block] = await blocks(page);
  const warning = `${HEALTH_FAILURE} ${NO_SERVER}`;
  const messages = page.getByTestId("message").locator("p");
  const before = await messages.allTextContents();
  await pressM(page);
  await expect(page.getByTestId("matches")).toHaveAttribute("aria-pressed", "true");
  await expect(messages).toHaveText([...before, warning]);
  await expect(page.getByTestId("matches-state")).toHaveText(NO_SERVER);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(await tableStatus(page, block ?? "")).toHaveText("No MatchClaim table loaded.");
  await page.getByRole("button", { name: "Load MatchClaims…" }).click();
  await expect(messages).toHaveText([...before, warning, warning]);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(seen.requests).toBe(0);
});
