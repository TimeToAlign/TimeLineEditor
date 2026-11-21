/**
 * MatchClaims in the built editor: TimeToShare's table fixture imported with
 * its MatchClaim table, the server's answer replayed from the client's
 * recording (`packages/client/tests/data/match-claims.answer.bin`, the
 * server's answer for exactly this manifest and table), the Matchstamp tab
 * showing the loaded table and its filter, a named MatchStamp shown when it
 * is selected and removed in one journal entry (the selection losing it,
 * the tab shown before it is shown again; its coordinates disabled fields
 * with their Copy buttons), a click on the line of one of its match
 * timestamps selecting it and showing it in the tab, its lines listed in
 * screen order with a timestamp's display toggled from them, and a manifest naming
 * a MatchClaim table imported without it saying nothing of the table and
 * requesting nothing (Show matches loads it when asked).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { packageDir, SCHEMA_VERSION } from "./schema.ts";
import { chooseItem, select, selection, tabs, withoutPickers } from "./support.ts";

const TABLES = path.join(packageDir, "fixtures", "tables", SCHEMA_VERSION);
const MANIFEST = readFileSync(path.join(TABLES, "manifest.yaml"));
const PARQUET = readFileSync(path.join(TABLES, "match_claims.parquet"));
const ANSWER = readFileSync(
  path.join(import.meta.dirname, "../packages/client/tests/data/match-claims.answer.bin"),
);
/** The answer's number of MatchClaims, from its header. */
const ROWS: number = JSON.parse(
  ANSWER.subarray(4, 4 + ANSWER.readUInt32LE(0)).toString("utf8"),
).rows;

/** Open a fresh page whose match-claims requests the recording answers, counting them. */
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

/** Import the files `files` through "Import manifest…"; the one block's ID. */
async function importFiles(
  page: Page,
  files: readonly { name: string; buffer: Buffer }[],
): Promise<string> {
  const chooser = page.waitForEvent("filechooser");
  await chooseItem(page, "Import manifest…");
  await (await chooser).setFiles(
    files.map(({ name, buffer }) => ({ name, mimeType: "application/octet-stream", buffer })),
  );
  await expect
    .poll(() => page.evaluate(() => Object.keys(window.__tilie.store().view.blocks).length))
    .toBe(1);
  return page.evaluate(() => Object.keys(window.__tilie.store().view.blocks)[0] ?? "");
}

/** Open the inspector if it is closed and show the Matchstamp tab. */
async function showMatchstamps(page: Page): Promise<void> {
  const open = page.getByRole("button", { name: "Open inspector" });
  if (await open.isVisible()) await open.click();
  await tabs(page).getByRole("tab", { name: "Matchstamp", exact: true }).click();
}

test("a manifest imported with its MatchClaim table loads it through the server", async ({
  page,
}) => {
  const seen = await openPage(page);
  const block = await importFiles(page, [
    { name: "manifest.yaml", buffer: MANIFEST },
    { name: "match_claims.parquet", buffer: PARQUET },
  ]);
  await select(page, [{ block }]);
  await showMatchstamps(page);
  await expect(page.getByTestId("matchclaims-status")).toHaveText(
    `match_claims.parquet: ${ROWS} MatchClaims`,
  );
  expect(seen.requests).toBe(1);
  await expect(page.getByTestId("matchstamp-hint")).toBeVisible();
  await expect(page.getByRole("group", { name: "Timelines" }).getByRole("checkbox")).toHaveCount(4);

  // The workspace file never holds the table.
  const text = await page.evaluate(() => window.__tilie.text());
  expect(text.includes("claim_1")).toBe(false);

  // Unchecking a timeline stores the block's filter outside the journal.
  const journal = await page.evaluate(() => window.__tilie.store().journal.length);
  await page.getByRole("checkbox", { name: "cpt_1" }).uncheck();
  await expect
    .poll(() =>
      page.evaluate((id) => window.__tilie.store().view.settings.matchClaimFilters[id], block),
    )
    .toEqual({
      timelines: ["clt_1", "clt_2", "dpt_1"],
      beliefs: ["true", "undecided", "unlikely"],
    });
  expect(await page.evaluate(() => window.__tilie.store().journal.length)).toBe(journal);
});

test("a named MatchStamp is shown when selected and removed in one entry", async ({ page }) => {
  await openPage(page);
  const block = await importFiles(page, [
    { name: "manifest.yaml", buffer: MANIFEST },
    { name: "match_claims.parquet", buffer: PARQUET },
  ]);
  const refusal = await page.evaluate(
    (id) =>
      window.__tilie.store().dispatch({
        type: "add",
        into: { block: id },
        matchstamp: {
          name: "Downbeat",
          anchors: [
            [
              { timeline: "clt_1", coordinate: [0, 1] },
              { timeline: "dpt_1", coordinate: 0 },
            ],
          ],
          match_claims: ["claim_1"],
        },
      }),
    block,
  );
  expect(refusal).toBe(null);
  await select(page, [{ block, id: "matchstamp_1" }]);
  await expect(tabs(page).getByRole("tab", { name: "Matchstamp", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByTestId("matchstamp-name").getByRole("textbox", { name: "Name" }),
  ).toHaveValue("Downbeat");
  const coordinates = page.getByRole("region", { name: "Coordinates", exact: true });
  for (const timeline of ["clt_1", "dpt_1"]) {
    const field = coordinates.getByLabel(`coordinate of ${timeline}`, { exact: true });
    await expect(field).toHaveValue("0");
    await expect(field).toBeDisabled();
    await expect(
      coordinates.getByRole("button", {
        name: `Copy the value of coordinate of ${timeline}`,
        exact: true,
      }),
    ).toBeEnabled();
  }
  const claims = page.getByRole("region", { name: "MatchClaims", exact: true });
  await expect(claims.locator("li[data-claim='claim_1'] code")).toHaveText("claim_1");
  // The live regions are there while empty, in the accessibility tree, taking no room.
  for (const region of [
    claims.getByRole("status"),
    page.getByTestId("matchstamp-name").getByRole("status"),
  ]) {
    await expect(region).toHaveCount(1);
    await expect(region).toHaveText("");
    expect(
      await region.evaluate((element) => {
        const { display, position } = getComputedStyle(element);
        const { width, height } = element.getBoundingClientRect();
        return { display, position, width, height };
      }),
    ).toEqual({ display: "block", position: "absolute", width: 1, height: 1 });
  }

  const journal = await page.evaluate(() => window.__tilie.store().journal.length);
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        (id) => window.__tilie.store().view.blocks[id]?.manifest.graphical?.matchstamps ?? [],
        block,
      ),
    )
    .toEqual([]);
  expect(await page.evaluate(() => window.__tilie.store().journal.length)).toBe(journal + 1);
  // The selection loses the MatchStamp, which lets it go: the tab shown before it is shown again.
  await expect(tabs(page).getByRole("tab", { name: "Properties", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("a click on a match timestamp's line selects its MatchStamp in the Matchstamp tab", async ({
  page,
}) => {
  await openPage(page);
  const block = await importFiles(page, [
    { name: "manifest.yaml", buffer: MANIFEST },
    { name: "match_claims.parquet", buffer: PARQUET },
  ]);
  const refusal = await page.evaluate(
    (id) =>
      window.__tilie.store().dispatch({
        type: "add",
        into: { block: id },
        matchstamp: {
          name: "Downbeat",
          anchors: [
            [
              { timeline: "clt_1", coordinate: [0, 1] },
              { timeline: "dpt_1", coordinate: 0 },
            ],
          ],
          match_claims: ["claim_1"],
        },
      }),
    block,
  );
  expect(refusal).toBe(null);
  // The match timestamp naming wrote on clt_1, whose children band gives its line a length; drawn
  // with its line only.
  const timestamp = await page.evaluate(
    (id) =>
      window.__tilie
        .store()
        .view.blocks[id]?.manifest.graphical?.timestamps?.filter(
          (each) => each.matchstamp && each.timeline === "clt_1",
        )
        .map((each) => ({ id: each.id, display: each.display })),
    block,
  );
  expect(timestamp?.map(({ display }) => display)).toEqual([["cross_section"]]);
  const line = page.locator(
    `[data-testid="block"] svg line[data-id="${timestamp?.[0]?.id}"][data-part="line"]`,
  );
  await line.dispatchEvent("click");
  await expect.poll(() => selection(page)).toEqual([{ block, id: "matchstamp_1" }]);
  await expect(tabs(page).getByRole("tab", { name: "Matchstamp", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByTestId("matchstamp-name").getByRole("textbox", { name: "Name" }),
  ).toHaveValue("Downbeat");
  // Its lines in screen order, a timestamp's display toggled from them.
  const lines = page.locator("section.lines li");
  await expect(lines).toHaveCount(3);
  const [onClt, onDpt] = await page.evaluate(
    (id) =>
      ["clt_1", "dpt_1"].map(
        (timeline) =>
          window.__tilie
            .store()
            .view.blocks[id]?.manifest.graphical?.timestamps?.find(
              (each) => each.matchstamp && each.timeline === timeline,
            )?.id,
      ),
    block,
  );
  expect(
    await lines.evaluateAll((items) =>
      items.map((item) => item.getAttribute("data-timestamp") ?? item.getAttribute("data-anchor")),
    ),
  ).toEqual([onClt, "anchor_1", onDpt]);
  const journal = () => page.evaluate(() => window.__tilie.store().journal.length);
  const before = await journal();
  await lines.first().getByRole("button", { name: "Wedge", exact: true }).click();
  await expect.poll(journal).toBe(before + 1);
  expect(
    await page.evaluate(
      ([id, timestamp]) =>
        window.__tilie
          .store()
          .view.blocks[id ?? ""]?.manifest.graphical?.timestamps?.find(
            (each) => each.id === timestamp,
          )?.display,
      [block, onClt],
    ),
  ).toEqual(["wedge", "cross_section"]);
});

test("importing a manifest that names a MatchClaim table says nothing of it and requests nothing", async ({
  page,
}) => {
  const seen = await openPage(page);
  const asked: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("match_claims")) asked.push(request.url());
  });
  const block = await importFiles(page, [{ name: "manifest.yaml", buffer: MANIFEST }]);
  await select(page, [{ block }]);
  await showMatchstamps(page);
  await expect(page.getByTestId("matchclaims-status")).toHaveText("No MatchClaim table loaded.");
  await expect(page.getByTestId("message")).toHaveCount(0);
  expect(seen.requests).toBe(0);
  expect(asked).toEqual([]);
});
