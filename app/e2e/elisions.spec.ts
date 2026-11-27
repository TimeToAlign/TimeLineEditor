/**
 * An elision added through the Elisions tab, as a viewer adds it, is drawn
 * on the timeline: on a placed virtual card of TimeToShare's fixture
 * `flow/virtual_cards` (`allegro_default` placed by one `set` of its place,
 * and the card of the row `by_hand` dragged out of the flow editor, whose
 * four A's are drawn once as a run) and on the virtual member
 * `allegro_default` of `groups/virtual_member`'s frame `performance`. The
 * card is selected, the tab's timeline or group block opened by its
 * disclosure button and Add elision pressed; then the drawing of the stored
 * block holds exactly the new elision's gap, its ellipsis and its name
 * label, and the page draws that ellipsis visibly. A root drawn once behind a row of
 * groups side by side offers no mode, lists its elision as not drawn there and keeps Add,
 * the elision drawn once the row is free. The expected values are derived in
 * `README.md` ("elisions.spec.ts").
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { drawingOf } from "../packages/arranger/src/drawing.ts";
import type { ElementAddress } from "../packages/core/src/index.ts";
import { isLoadError, readWorkspace } from "../packages/core/src/index.ts";
import { FONT_METRICS } from "./schema.ts";
import {
  bandPoint,
  dispatch,
  done,
  editing,
  element,
  framePoint,
  importFixture,
  journalLength,
  newestMinted,
  paneOf,
  selection,
  settledDrawing,
  setViewport,
  tab,
  type Viewport,
} from "./support.ts";

test.use({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });

/** The viewport at zoom 1 that shows block `block`'s place at canvas pixel (40, 40). */
async function viewAtBlock(page: Page, block: string): Promise<Viewport> {
  const place = await page.evaluate((id) => {
    const found = window.__tilie.store().view.blocks[id];
    return found === undefined ? null : { x: found.x, y: found.y };
  }, block);
  if (place === null) throw new Error(`block ${block} is missing`);
  return { x: 40 - place.x, y: 40 - place.y, zoom: 1 };
}

/** Open the drawer when it is closed and choose the Elisions tab. */
async function elisionsTab(page: Page): Promise<void> {
  const opener = page.getByRole("button", { name: "Open inspector" });
  if (await opener.isVisible()) await opener.click();
  await tab(page, "Elisions").click();
  await expect(tab(page, "Elisions")).toHaveAttribute("aria-selected", "true");
}

/**
 * Open the Elisions tab, click the box `card` of block `block` as a viewer
 * selects it (`framePoint`: the selection is exactly it), open the Elisions tab's block
 * `testid` (`elisions` a timeline's, `group-elisions` a group's) by its
 * disclosure button and press its Add elision: the one command journaled
 * and the ID of the elision it adds.
 */
async function addThroughTab(
  page: Page,
  block: string,
  card: ElementAddress,
  testid: "elisions" | "group-elisions",
): Promise<{ command: unknown; id: string }> {
  await elisionsTab(page);
  const at = await framePoint(page, block, card);
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => selection(page)).toEqual([{ block, ...card }]);
  const tile = page.getByTestId(testid);
  const expand = page.getByTestId(`${testid}-expand`);
  if ((await expand.getAttribute("aria-expanded")) !== "true") await expand.click();
  const before = await journalLength(page);
  await tile.getByRole("button", { name: "Add elision" }).click();
  await expect.poll(() => journalLength(page)).toBe(before + 1);
  const { command, ids } = await newestMinted(page);
  const [id] = ids;
  if (id === undefined || ids.length !== 1) throw new Error("Add elision minted no single ID");
  return { command, id };
}

/**
 * The elements of the elision `id` in the drawing the arranger gives of
 * block `block` as the store holds it now, at the canvas's pane: their
 * types and addresses, in drawing order.
 */
async function drawnOf(
  page: Page,
  block: string,
  id: string,
): Promise<{ type: string; part: readonly (string | number)[] | undefined }[]> {
  const workspace = readWorkspace(await page.evaluate(() => window.__tilie.text()));
  if (isLoadError(workspace)) throw new Error("the workspace is refused");
  const found = workspace.view.blocks[block];
  if (found === undefined) throw new Error(`block ${block} is missing`);
  const drawing = drawingOf(
    found,
    workspace.view.graphical,
    FONT_METRICS,
    undefined,
    await paneOf(page),
  );
  return drawing.elements
    .filter((drawn) => drawn.address.id === id)
    .map((drawn) => ({ type: drawn.type, part: drawn.address.part }));
}

/**
 * The elision `id` is drawn in block `block`: its gap and its ellipsis are
 * the drawing's only elements of it with its name label (its `display`
 * lists `ellipsis` and `name`, the label the timeline's name), and the
 * page draws the ellipsis inside the window, visibly.
 */
async function drawn(page: Page, block: string, id: string): Promise<void> {
  await settledDrawing(page, block);
  expect(await drawnOf(page, block, id)).toEqual([
    { type: "elision", part: undefined },
    { type: "ellipsis", part: ["ellipsis"] },
    { type: "label", part: ["name"] },
  ]);
  const ellipsis = element(page, block, { id, part: ["ellipsis"] } as ElementAddress);
  await expect(ellipsis.first()).toBeVisible();
  const box = await ellipsis.first().boundingBox();
  expect(box !== null && box.width > 0 && box.height > 0).toBe(true);
}

/** Import `flow/virtual_cards` and place `allegro_default` at (0, 200); the block. */
async function virtualCards(page: Page): Promise<string> {
  const block = await importFixture(page, "flow/virtual_cards");
  expect(
    await dispatch(page, {
      type: "set",
      changes: [{ target: { block, id: "allegro_default" }, values: { place: { x: 0, y: 200 } } }],
    }),
  ).toBeNull();
  await settledDrawing(page, block);
  return block;
}

test("an elision added on a placed virtual card is drawn", async ({ page }) => {
  const block = await virtualCards(page);
  const { command, id } = await addThroughTab(
    page,
    block,
    { id: "allegro_default", part: ["card"] },
    "elisions",
  );
  expect(command).toEqual({
    type: "add",
    into: { block, id: "allegro_default" },
    elision: { start: [4241, 6], end: [4241, 3] },
  });
  await drawn(page, block, id);
});

test("an elision added on the card dragged out of the flow editor is drawn", async ({ page }) => {
  const block = await virtualCards(page);
  const view = await viewAtBlock(page, block);
  await setViewport(page, view);
  await settledDrawing(page, block);
  const inBand = await bandPoint(page, block, { id: "allegro", facet: "flow_control" }, 2);
  await page.mouse.dblclick(inBand.x, inBand.y);
  await expect
    .poll(() => editing(page))
    .toEqual([{ target: { block, id: "allegro" }, kind: "flow" }]);
  const pane = page.getByTestId("flow-pane");
  const name = pane.locator('[data-testid="flow-row"][data-flow-map="by_hand"] .name');
  const from = await name.boundingBox();
  const below = await pane.boundingBox();
  if (from === null || below === null) throw new Error("the pane is not laid out");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, below.y + below.height + 80, { steps: 8 });
  await page.mouse.up();
  await done(page);
  await expect.poll(() => editing(page)).toEqual([]);
  // Back at the viewport the card was dropped at, where it lies inside the window.
  await setViewport(page, view);
  // The row's FlowMap has its virtual timeline, `allegro_by_hand`: the drop places its card.
  const card = "allegro_by_hand";
  expect(
    await page.evaluate(
      ([at, id]) => Object.hasOwn(window.__tilie.store().view.blocks[at]?.places ?? {}, id),
      [block, card] as const,
    ),
  ).toBe(true);
  await settledDrawing(page, block);
  const { command, id } = await addThroughTab(
    page,
    block,
    { id: card, part: ["card"] },
    "elisions",
  );
  // The middle third of the gap and C, the longest stretch the card draws: 1906–3054.
  expect(command).toEqual({
    type: "add",
    into: { block, id: card },
    elision: { start: [6866, 3], end: [8014, 3] },
  });
  await drawn(page, block, id);
  // The middle third of the whole axis, all but its last 130 ♩ in the run gap: a gap narrower
  // than 20 in the card, which a stored elision's ellipsis is drawn in whatever its width.
  expect(
    await dispatch(page, {
      type: "add",
      into: { block, id: card },
      elision: { start: [1018, 1], end: [2036, 1] },
    }),
  ).toBeNull();
  const { ids } = await newestMinted(page);
  const [narrow] = ids;
  if (narrow === undefined) throw new Error("the add minted no ID");
  await drawn(page, block, narrow);
});

test("an elision added on a virtual member is drawn across its frame", async ({ page }) => {
  const block = await importFixture(page, "groups/virtual_member");
  await settledDrawing(page, block);
  const { command, id } = await addThroughTab(
    page,
    block,
    { id: "allegro_default", part: ["card"] },
    "group-elisions",
  );
  expect(command).toEqual({
    type: "add",
    into: { block, id: "allegro_default" },
    elision: { start: [4241, 6], end: [4241, 3] },
  });
  await drawn(page, block, id);
});

test("an elision added on a virtual member's frame is drawn across it", async ({ page }) => {
  const block = await importFixture(page, "groups/virtual_member");
  await settledDrawing(page, block);
  const { command, id } = await addThroughTab(page, block, { id: "performance" }, "group-elisions");
  expect(command).toEqual({
    type: "add",
    into: { block, id: "allegro_default" },
    elision: { start: [4241, 6], end: [4241, 3] },
  });
  await drawn(page, block, id);
});

test("a root drawn once behind a row offers no mode, keeps its elision undrawn, and draws it free", async ({
  page,
}) => {
  const block = await importFixture(page, "bundles/bundle_arranged_roots");
  const arranged = { direction: "horizontal", order: ["page", "group_3", "group_1", "group_2"] };
  expect(
    await dispatch(page, {
      type: "set",
      changes: [{ target: { block }, values: { arrangement: arranged } }],
    }),
  ).toBeNull();
  // The whole row inside the window: the block's place at (40, 40), at half size.
  const view = await viewAtBlock(page, block);
  await setViewport(page, { x: 40 + (view.x - 40) / 2, y: 40 + (view.y - 40) / 2, zoom: 0.5 });
  await settledDrawing(page, block);
  const tile = page.getByTestId("elisions");
  const summary = async () =>
    (await page.getByTestId("elisions-expand").textContent())?.replace(/\s+/g, " ").trim();
  const { command, id } = await addThroughTab(
    page,
    block,
    { id: "take_b", part: ["card"] },
    "elisions",
  );
  // The once card is the card behind the row's first group, `group_1`, whose anchor `take_a`
  // covers 0.0–30.0: the middle third of 30.0–130.0, written as `session`'s float.
  expect(command).toEqual({
    type: "add",
    into: { block, id: "session" },
    elision: { start: 63.333333333333336, end: 96.66666666666667 },
  });
  await expect.poll(summary).toBe('Timeline Parent timeline "Session" Drawn once, 1 elision');
  await expect(tile.getByRole("radio")).toHaveCount(0);
  await expect(tile.locator(".once")).toHaveText(
    "Drawn once behind the row: its elisions are not drawn while the bundle is arranged side by side.",
  );
  await expect(tile.getByTestId("arranged-gaps").locator("li")).toHaveText([
    'between "Exposition" and "Recapitulation" 33″–44″',
  ]);
  await expect(tile.locator(".rows .note")).toHaveText(["not drawn while arranged side by side"]);
  await settledDrawing(page, block);
  expect(await drawnOf(page, block, id)).toEqual([]);
  // Free, each of `session`'s two ancestor cards draws it: behind `group_1` and behind `group_3`.
  expect(
    await dispatch(page, {
      type: "set",
      changes: [{ target: { block }, values: { arrangement: null } }],
    }),
  ).toBeNull();
  await settledDrawing(page, block);
  const pieces = [
    { type: "elision", part: undefined },
    { type: "ellipsis", part: ["ellipsis"] },
    { type: "label", part: ["name"] },
  ];
  expect(await drawnOf(page, block, id)).toEqual([...pieces, ...pieces]);
  await expect(
    element(page, block, { id, part: ["ellipsis"] } as ElementAddress).first(),
  ).toBeVisible();
});
