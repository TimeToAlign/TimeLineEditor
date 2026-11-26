/**
 * The Regions tab and the band list in a browser: the tab after
 * Properties; the rows of a timeline and its descendant, a row's head
 * selecting its region on the canvas while the list stays, a name
 * journalled in place, a start refused
 * with core's words and dropped by Escape, a removal; the band list's
 * Visible checkboxes in the band order, a change journalling the band's
 * own rule and hiding the band. The expected values are derived in
 * `README.md` ("regions.spec.ts").
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { Address } from "../packages/core/src/index.ts";
import {
  bandsOf,
  dispatch,
  importFixture,
  journalLength,
  newestCommand,
  panel,
  select,
  selection,
  tab,
  tabs,
} from "./support.ts";

test.use({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });

/** Import the fixture, give `b` the region `motif`, select `score`'s card and open the inspector; the block. */
async function start(page: Page): Promise<string> {
  const block = await importFixture(page, "styled_score_flow_inner");
  expect(
    await dispatch(page, {
      type: "add",
      into: { block, id: "b" },
      region: { id: "motif", name: "motif", start: [1, 1], end: [3, 1] },
    }),
  ).toBeNull();
  await select(page, [{ block, id: "score", part: ["card"] }]);
  await page.getByRole("button", { name: "Open inspector" }).click();
  return block;
}

/** The row of region `id` in the shown Regions panel. */
async function row(page: Page, id: string) {
  return (await panel(page, "Regions"))
    .getByTestId("region-row")
    .filter({ has: page.locator(".id", { hasText: new RegExp(`^${id}$`) }) });
}

test("the Regions tab lists, selects, edits and removes regions", async ({ page }) => {
  const block = await start(page);
  await expect(tabs(page).getByRole("tab")).toHaveText([
    "Arranger",
    "Properties",
    "Regions",
    "Metadata",
    "Manifest",
    "Journal",
    "Timestamp",
    "Matchstamp",
    "Elisions",
  ]);
  await tab(page, "Regions").click();
  const shown = await panel(page, "Regions");
  await expect(shown.getByRole("heading")).toHaveText(["b"]);
  const values = async (id: string) =>
    Promise.all(
      ["name", "start", "end"].map((name) =>
        row(page, id).then((found) => found.locator(`input[name="${name}"]`).inputValue()),
      ),
    );
  expect(await values("intro")).toEqual(["intro", "0", "2"]);
  expect(await values("motif")).toEqual(["motif", "1", "3"]);

  await (await row(page, "motif")).locator(".select").click();
  await expect.poll(() => selection(page)).toEqual([{ block, id: "motif" }] satisfies Address[]);
  await expect((await row(page, "motif")).locator(".select")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(shown.getByRole("heading")).toHaveText(["b"]);
  await expect(shown.getByTestId("region-row")).toHaveCount(2);

  const entries = await journalLength(page);
  const name = (await row(page, "intro")).locator('input[name="name"]');
  await name.fill("Intro");
  await name.press("Enter");
  await expect.poll(() => journalLength(page)).toBe(entries + 1);
  expect(await newestCommand(page)).toEqual({
    type: "set",
    changes: [{ target: { block, id: "intro" }, values: { name: "Intro" } }],
  });
  expect(await selection(page)).toEqual([{ block, id: "motif" }] satisfies Address[]);
  await expect(shown.getByTestId("region-row")).toHaveCount(2);

  const startField = (await row(page, "intro")).locator('input[name="start"]');
  await startField.fill("3");
  await startField.press("Enter");
  await expect(startField).toHaveAttribute("aria-invalid", "true");
  await expect((await row(page, "intro")).locator(".problem")).toHaveText(
    "region 'intro' ends before it starts",
  );
  expect(await journalLength(page)).toBe(entries + 1);
  await startField.press("Escape");
  await expect(startField).toHaveValue("0");

  await (await row(page, "intro")).getByRole("button", { name: "Remove region Intro" }).click();
  await expect.poll(() => journalLength(page)).toBe(entries + 2);
  expect(await newestCommand(page)).toEqual({
    type: "remove",
    targets: [{ block, id: "intro" }],
  });
  await expect(await row(page, "intro")).toHaveCount(0);
});

test("the band list turns a band off and on", async ({ page }) => {
  const block = await start(page);
  await expect(tab(page, "Properties")).toHaveAttribute("aria-selected", "true");
  const list = (await panel(page, "Properties")).getByRole("table", { name: "Bands" });
  await expect(list.getByRole("rowheader")).toHaveText([
    "Children",
    "Markers",
    "Conversion maps",
    "Flow control",
    "Regions",
  ]);
  for (const box of await list.getByRole("checkbox").all()) await expect(box).toBeChecked();
  const facets = async () => (await bandsOf(page, block, "score")).map((band) => band.facet);
  expect(await facets()).toContain("regions");

  const regions = list.getByRole("checkbox", { name: "Regions visible" });
  const entries = await journalLength(page);
  await regions.uncheck();
  await expect.poll(() => journalLength(page)).toBe(entries + 1);
  const rule = (display: string | null) => ({
    type: "style",
    select: { element: "band", addresses: [{ id: "score", facet: "regions" }] },
    set: { display },
    blocks: [block],
  });
  expect(await newestCommand(page)).toEqual(rule("none"));
  await expect(regions).not.toBeChecked();
  await expect.poll(facets).not.toContain("regions");

  await regions.check();
  await expect.poll(() => journalLength(page)).toBe(entries + 2);
  expect(await newestCommand(page)).toEqual(rule(null));
  await expect(regions).toBeChecked();
  await expect.poll(facets).toContain("regions");
});
