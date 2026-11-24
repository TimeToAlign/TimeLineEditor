/**
 * Loading the MatchClaim table a manifest names, in the built editor. With
 * a server answering its health check (stubbed, with the user's files on
 * it): the table fixture opened from the Fixture menu, whose MatchClaim
 * table is served beside it, loads it without a question; the same
 * manifest imported from a folder of the server's files that does not
 * hold its table asks for it in the tables dialog, which takes a file
 * located in the editor's file dialog or a URL, or is cancelled, which the
 * message bar then says as information. Without a server answering (the
 * health check refused), turning Show matches on asks nothing and the
 * message bar says as information that matches need a running server,
 * beside a warning already shown and in information's style, gone after
 * three seconds while the warning stays; Load MatchClaims…, disabled, says
 * how to start one. While the health check is not answered yet, turning it
 * on says nothing, and the table loads once the check answers, or the
 * message bar says once that matches need a server when it is refused
 * then. The server's table route is
 * replayed from the client's recording; loading is started by turning
 * Show matches on, by its key or its toolbar button, or by the Matchstamp
 * tab's Load MatchClaims…, which asks in the same dialog.
 */

import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { arranger, messagesAt, messageTexts, select, tabs } from "./support.ts";
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

/** The information turning Show matches on gives while no server reads tables. */
const NEED = "Matches need a running tilie-server.";
/** The information turning Show matches on gives where no table was loaded. */
const NO_TABLE = "No MatchClaim table loaded.";
/** What the disabled controls say: that, then how to start the server. */
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

test("cancelled, the dialog loads nothing, and the message bar says no table is loaded", async ({
  page,
}) => {
  const seen = await openPage(page);
  await importManifest(page);
  const before = await page.getByTestId("message").count();
  await showMatches(page);
  const dialog = page.getByRole("dialog", { name: NOT_BESIDE });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect(seen.requests).toBe(0);
  await expect(messageTexts(page, "info")).toHaveText([NO_TABLE]);
  expect(await page.getByTestId("message").count()).toBe(before + 1);
});

test("without a server answering, M asks nothing and informs that matches need a server", async ({
  page,
}) => {
  const seen = await openPage(page, "refused");
  await page.getByTestId("fixture-select").selectOption("tables/manifest");
  await page.getByTestId("fixture-open").click();
  await expect.poll(() => blocks(page)).toHaveLength(1);
  const [block] = await blocks(page);
  const how = `${HEALTH_FAILURE} ${NO_SERVER}`;
  await expect(page.getByTestId("message")).toHaveCount(0);
  await pressM(page);
  await expect(page.getByTestId("matches")).toHaveAttribute("aria-pressed", "true");
  await expect(messageTexts(page, "info")).toHaveText([NEED]);
  await expect(page.getByTestId("message")).toHaveCount(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(await tableStatus(page, block ?? "")).toHaveText(NO_TABLE);
  const load = page.getByRole("button", { name: "Load MatchClaims…" });
  await expect(load).toBeDisabled();
  await expect(load).toHaveAccessibleDescription(how);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(seen.requests).toBe(0);
});

test("the information that matches need a server shows beside a warning in its own style, and leaves after 3 s while the warning stays", async ({
  page,
}) => {
  await openPage(page, "refused");
  await page.getByTestId("fixture-select").selectOption("tables/manifest");
  await page.getByTestId("fixture-open").click();
  await expect.poll(() => blocks(page)).toHaveLength(1);
  // A warning: an address the hook cannot read.
  await page.evaluate(() => window.__tilie.select([{ block: "nothing", facet: "markers" }]));
  const warning = messagesAt(page, "warning");
  await expect(warning.getByRole("paragraph")).toHaveText([
    "Some addresses could not be selected.",
  ]);
  // The information leaves 3 s after it is posted: the clock stands still until it has been read.
  await page.clock.install();
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
  await pressM(page);
  const info = messagesAt(page, "info");
  await expect(info.getByRole("paragraph")).toHaveText([NEED]);
  // Heard through the bar's two announcers, never through the cards.
  await expect(page.getByTestId("messages-status").locator("p")).toHaveText([`Info: ${NEED}`]);
  await expect(page.getByTestId("messages-alert").locator("p")).toHaveText([
    "Warning: Some addresses could not be selected.",
  ]);
  await expect(info).not.toHaveAttribute("role");
  await expect(warning).not.toHaveAttribute("role");
  await expect(info.locator(".level")).toHaveText("Info");
  await expect(warning.locator(".level")).toHaveText("Warning");
  await expect(info).toBeVisible();
  await expect(warning).toBeVisible();
  const colours = (card: Locator) =>
    card.evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.borderTopColor, style.backgroundColor];
    });
  expect(await colours(info)).toEqual(["rgb(122, 167, 217)", "rgb(238, 245, 253)"]);
  expect(await colours(warning)).toEqual(["rgb(201, 162, 39)", "rgb(255, 248, 225)"]);
  const [above, below] = [await warning.boundingBox(), await info.boundingBox()];
  if (above === null || below === null) throw new Error("a message is not shown");
  // Posted later, the information lies below the warning, apart from it.
  expect(below.y >= above.y + above.height).toBe(true);
  await page.clock.runFor(2999);
  await expect(info).toHaveCount(1);
  await page.clock.runFor(1);
  await expect(info).toHaveCount(0);
  await expect(warning.getByRole("paragraph")).toHaveText([
    "Some addresses could not be selected.",
  ]);
  await page.clock.runFor(60_000);
  await expect(warning).toHaveCount(1);
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
});

test("M before the health check is refused says nothing until it is, then that matches need a server, once", async ({
  page,
}) => {
  const seen = await openPage(page, "held");
  await page.getByTestId("fixture-select").selectOption("tables/manifest");
  await page.getByTestId("fixture-open").click();
  await expect.poll(() => blocks(page)).toHaveLength(1);
  const [block] = await blocks(page);
  const how = `${HEALTH_FAILURE} ${NO_SERVER}`;
  const messages = page.getByTestId("message").locator("p");
  const before = await messages.allTextContents();
  await pressM(page);
  await expect(page.getByTestId("matches")).toHaveAttribute("aria-pressed", "true");
  await expect(messages).toHaveText(before);
  seen.refuse();
  await expect(page.locator(".offline")).toHaveAttribute("title", HEALTH_FAILURE);
  await expect(messages).toHaveText([...before, NEED]);
  await expect(messageTexts(page, "info")).toHaveText([NEED]);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(await tableStatus(page, block ?? "")).toHaveText(NO_TABLE);
  await expect(page.getByRole("button", { name: "Load MatchClaims…" })).toHaveAccessibleDescription(
    how,
  );
  expect(seen.requests).toBe(0);
});
