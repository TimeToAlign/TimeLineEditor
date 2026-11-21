/**
 * Loading the tables a manifest names, in the built editor: the table
 * fixture opened from the Fixture menu, whose MatchClaim and Projections
 * tables are served beside it, loads both without a question; the same
 * manifest imported from the user's system (where nothing beside it can be
 * reached) asks for them in the tables dialog, which takes a file chosen on
 * the system or a URL, or is cancelled. The server's table route is
 * replayed from the client's recording; loading is started through the
 * hook's `loadTables`, what turning Show matches on asks.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { packageDir, SCHEMA_VERSION } from "./schema.ts";
import { chooseItem, select, tabs, withoutPickers } from "./support.ts";

const TABLES = path.join(packageDir, "fixtures", "tables", SCHEMA_VERSION);
const MANIFEST = readFileSync(path.join(TABLES, "manifest.yaml"));
const PARQUET = readFileSync(path.join(TABLES, "match_claims.parquet"));
const PROJECTIONS = readFileSync(path.join(TABLES, "projections.parquet"));
const ANSWER = readFileSync(
  path.join(import.meta.dirname, "../packages/client/tests/data/match-claims.answer.bin"),
);
const ROWS: number = JSON.parse(
  ANSWER.subarray(4, 4 + ANSWER.readUInt32LE(0)).toString("utf8"),
).rows;
const URL_OF_TABLE = "https://tables.example.org/package/match_claims.parquet";

/** Open a fresh page whose table requests the recording answers, counting them. */
async function openPage(page: Page): Promise<{ requests: number }> {
  const seen = { requests: 0 };
  await withoutPickers(page);
  await page.route("**/api/match-claims", async (route) => {
    seen.requests += 1;
    await route.fulfill({ status: 200, contentType: "application/octet-stream", body: ANSWER });
  });
  await page.goto("/");
  await page.waitForFunction(() => window.__tilie !== undefined);
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

/** Import the table fixture's manifest alone through "Import manifest…"; its block. */
async function importManifest(page: Page): Promise<string> {
  const chooser = page.waitForEvent("filechooser");
  await chooseItem(page, "Import manifest…");
  await (await chooser).setFiles([
    { name: "manifest.yaml", mimeType: "application/octet-stream", buffer: MANIFEST },
  ]);
  await expect.poll(() => blocks(page)).toHaveLength(1);
  return (await blocks(page))[0] ?? "";
}

test("a fixture whose tables are served beside it loads them without a question", async ({
  page,
}) => {
  const seen = await openPage(page);
  await page.getByTestId("fixture-select").selectOption("tables/manifest");
  await page.getByTestId("fixture-open").click();
  await expect.poll(() => blocks(page)).toHaveLength(1);
  const [block] = await blocks(page);
  await page.evaluate(() => window.__tilie.loadTables());
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(seen.requests).toBe(1);
  await expect(await tableStatus(page, block ?? "")).toHaveText(
    `match_claims.parquet: ${ROWS} MatchClaims`,
  );
});

test("a manifest from the user's system asks for its tables, a file each", async ({ page }) => {
  const seen = await openPage(page);
  const block = await importManifest(page);
  const loading = page.evaluate(() => window.__tilie.loadTables());
  const dialog = page.getByRole("dialog", { name: "Load the tables of The manifest" });
  await expect(dialog).toBeVisible();
  const load = dialog.getByRole("button", { name: "Load" });
  await expect(load).toBeDisabled();
  const groups = dialog.getByRole("group");
  await expect(groups).toHaveText([
    /MatchClaim table\s+match_claims\.parquet/u,
    /Projections table\s+projections\.parquet/u,
  ]);
  for (const [at, [name, buffer]] of [
    ["match_claims.parquet", PARQUET],
    ["projections.parquet", PROJECTIONS],
  ].entries()) {
    const chooser = page.waitForEvent("filechooser");
    await groups.nth(at).getByRole("button", { name: "Choose file…" }).click();
    await (await chooser).setFiles([
      { name: name as string, mimeType: "application/octet-stream", buffer: buffer as Buffer },
    ]);
    await expect(groups.nth(at)).toContainText(name as string);
  }
  await load.click();
  await loading;
  await expect(dialog).toBeHidden();
  expect(seen.requests).toBe(1);
  await expect(await tableStatus(page, block)).toHaveText(
    `match_claims.parquet: ${ROWS} MatchClaims`,
  );
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
  const loading = page.evaluate(() => window.__tilie.loadTables());
  const dialog = page.getByRole("dialog", { name: "Load the tables of The manifest" });
  await dialog.getByRole("textbox", { name: "URL of the MatchClaim table" }).fill(URL_OF_TABLE);
  await dialog.getByRole("button", { name: "Load" }).click();
  await loading;
  expect(fetched).toEqual([URL_OF_TABLE]);
  expect(seen.requests).toBe(1);
  await expect(await tableStatus(page, block)).toHaveText(
    `match_claims.parquet: ${ROWS} MatchClaims`,
  );
});

test("cancelled, the dialog loads nothing and says nothing", async ({ page }) => {
  const seen = await openPage(page);
  await importManifest(page);
  const before = await page.getByTestId("message").count();
  const loading = page.evaluate(() => window.__tilie.loadTables());
  const dialog = page.getByRole("dialog", { name: "Load the tables of The manifest" });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await loading;
  await expect(dialog).toBeHidden();
  expect(seen.requests).toBe(0);
  expect(await page.getByTestId("message").count()).toBe(before);
});
