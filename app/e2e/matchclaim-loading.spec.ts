/**
 * Loading the MatchClaim table a manifest names, in the built editor. With
 * a server answering its health check (stubbed, with the user's files on
 * it): the table fixture opened from the Fixture menu, whose MatchClaim
 * table is served beside it, loads it without a question; the same
 * manifest imported from a folder of the server's files that does not
 * hold its table asks for it in the tables dialog, which takes a file
 * located in the editor's file dialog or a URL, or is cancelled. Without a
 * server answering (the health check refused), turning Show matches on asks
 * nothing and the message bar says that matches need a running server and
 * how to start one, which Load MatchClaims…, disabled, says too; while the
 * health check is not answered yet, turning it on says nothing, and the
 * table loads once the check answers. The server's table route is
 * replayed from the client's recording; loading is started by turning
 * Show matches on, by its key or its toolbar button, or by the Matchstamp
 * tab's Load MatchClaims…, which asks in the same dialog.
 */

import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { arranger, select, tabs } from "./support.ts";
import {
  ANSWER,
  blocks,
  HEALTH_FAILURE,
  importManifest,
  openPage,
  PARQUET,
} from "./tablesServer.ts";

const ROWS: number = JSON.parse(
  ANSWER.subarray(4, 4 + ANSWER.readUInt32LE(0)).toString("utf8"),
).rows;
const URL_OF_TABLE = "https://tables.example.org/package/match_claims.parquet";
const DIALOG = "Load the MatchClaim table of The manifest";
const NOT_BESIDE = "match_claims.parquet is not beside The manifest, at story/manifest.yaml";

/** What the canvas's status says while no server reads tables. */
const NEED = "Matches need a running tilie-server.";
/** What the message bar and the disabled controls say: that, then how to start the server. */
const NO_SERVER =
  "Matches need a running tilie-server. To start it, run " +
  "uv run tilie --static-dir ../app/packages/editor/dist in the repository's server folder " +
  "(or tilie, once installed with pip install tilie-server), " +
  "then open the editor at the address it prints.";

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
  const seen = await openPage(page, "refused");
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
  await expect(page.getByTestId("matches-state")).toHaveText(NEED);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(await tableStatus(page, block ?? "")).toHaveText("No MatchClaim table loaded.");
  const load = page.getByRole("button", { name: "Load MatchClaims…" });
  await expect(load).toBeDisabled();
  await expect(load).toHaveAccessibleDescription(warning);
  await expect(messages).toHaveText([...before, warning]);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(seen.requests).toBe(0);
});

test("M before the health check answers says nothing, and the table loads once it answers", async ({
  page,
}) => {
  const seen = await openPage(page, "held");
  await page.getByTestId("fixture-select").selectOption("tables/manifest");
  await page.getByTestId("fixture-open").click();
  await expect.poll(() => blocks(page)).toHaveLength(1);
  const messages = page.getByTestId("message").locator("p");
  const before = await messages.allTextContents();
  await pressM(page);
  await expect(page.getByTestId("matches")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".offline")).toHaveCount(0);
  await expect(messages).toHaveText(before);
  expect(seen.requests).toBe(0);
  seen.answer();
  await expect.poll(() => seen.requests).toBe(1);
  await expect(messages).toHaveText([...before, "Loaded the MatchClaims of match_claims.parquet."]);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("matches-state")).toHaveCount(0);
});
