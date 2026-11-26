/**
 * An elision selected by a real pointer click on the canvas brings the
 * inspector's Elisions tab forward, an automatic elision as a stored one,
 * for every part of one a viewer can click and from every state the
 * inspector may be in: another tab chosen, a timestamp pinned, a MatchStamp
 * shown, an editor opened while the drawer was closed. The click is the
 * mouse's on the drawn part, never the hook's selection, which serves only
 * to set up. The expected values are derived in `README.md`
 * ("elision-tab.spec.ts").
 */

import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { Address, ElementAddress } from "../packages/core/src/index.ts";
import {
  dispatch,
  done,
  editing,
  element,
  importFixture,
  pane,
  select,
  selection,
  setViewport,
  tab,
  viewportOf,
} from "./support.ts";

test.use({ viewport: { width: 1920, height: 1080 } });

/** The blocks of `e2e/groups` that draw automatic elisions. */
const GRANDCHILD = "ggrand0000";
const MIXED = "gmixed0000";

/** The elision `{id: T, part: ["elision"]}` drawn automatically on timeline `T`, or its part `word`. */
function automatic(timeline: string, word?: string): ElementAddress {
  return {
    id: timeline,
    part: word === undefined ? ["elision"] : ["elision", word],
  } as ElementAddress;
}

/** The stored elision `id`, or its part `word`. */
function stored(id: string, word?: string): ElementAddress {
  return (word === undefined ? { id } : { id, part: [word] }) as ElementAddress;
}

/**
 * Click the drawn part `address` of block `block` with the mouse: the first
 * of its drawings (an elision draws its ellipsis in every card it crosses)
 * that the pointer reaches at its centre. Each drawing in turn is brought to
 * (400, 400) on the canvas, left of the drawer, with the mouse resting
 * outside the canvas, so that no hover mark lies over it; it is clicked
 * where the element the page finds at its centre (`partCentre`'s point) is
 * that drawing itself, and nothing covers it (a member card covers a
 * group's ellipsis drawn in the ancestor card behind it).
 */
async function press(page: Page, block: string, address: ElementAddress): Promise<void> {
  const drawings = element(page, block, address);
  const count = await drawings.count();
  for (let index = 0; index < count; index += 1) {
    const drawing = drawings.nth(index);
    await page.mouse.move(0, 0);
    const centre = await centreOf(drawing);
    const canvas = await pane(page).boundingBox();
    if (canvas === null) throw new Error("the canvas is not displayed");
    const view = await viewportOf(page);
    await setViewport(page, {
      x: view.x + canvas.x + 400 - centre.x,
      y: view.y + canvas.y + 400 - centre.y,
      zoom: view.zoom,
    });
    const shown = await centreOf(drawing);
    if (
      await drawing.evaluate((drawn, { x, y }) => document.elementFromPoint(x, y) === drawn, shown)
    ) {
      await page.mouse.click(shown.x, shown.y);
      return;
    }
  }
  throw new Error(`no drawing of ${JSON.stringify(address)} in ${block} is reached by the pointer`);
}

/** The centre of `drawn`'s client rectangle, each coordinate rounded to a whole pixel (as `partCentre`). */
async function centreOf(drawn: Locator): Promise<{ x: number; y: number }> {
  const { x, y, width, height } = await drawn.evaluate((part) => {
    const box = part.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  });
  return { x: Math.round(x + width / 2), y: Math.round(y + height / 2) };
}

/** Open the drawer when it is closed. */
async function openDrawer(page: Page): Promise<void> {
  const opener = page.getByRole("button", { name: "Open inspector" });
  if (await opener.isVisible()) await opener.click();
  await expect(page.getByTestId("inspector")).toBeVisible();
}

/** Close the drawer. */
async function closeDrawer(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Close inspector" }).click();
  await expect(page.getByRole("button", { name: "Open inspector" })).toBeVisible();
}

/** The selection is exactly `address` of `block`, and the Elisions tab is shown with the elision's form open. */
async function elisionsShown(page: Page, block: string, address: ElementAddress): Promise<void> {
  await expect.poll(() => selection(page)).toEqual([{ block, ...address }]);
  await expect(tab(page, "Elisions")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("elision-form-expand")).toHaveAttribute("aria-expanded", "true");
}

/** Open `e2e/groups` from the header's Fixture menu, as a viewer does, and open the drawer. */
async function groups(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("fixture-select").selectOption("e2e/groups");
  await page.getByTestId("fixture-open").click();
  await expect
    .poll(() => page.evaluate(() => Object.keys(window.__tilie.store().view.blocks).length))
    .toBe(4);
  await openDrawer(page);
}

/** Import `bundle_elisions_stored` and open the drawer; the block's ID. */
async function elisionsStored(page: Page): Promise<string> {
  const block = await importFixture(page, "bundles/bundle_elisions_stored");
  await openDrawer(page);
  return block;
}

/** Choose Properties and empty the selection, so that the next click changes it. */
async function properties(page: Page): Promise<void> {
  await select(page, []);
  await expect.poll(() => selection(page)).toEqual([]);
  await tab(page, "Properties").click();
  await expect(tab(page, "Properties")).toHaveAttribute("aria-selected", "true");
}

/** Click `address` with Properties chosen before, and see the Elisions tab come forward. */
async function fromProperties(
  page: Page,
  block: string,
  address: ElementAddress,
  elision: ElementAddress,
) {
  await properties(page);
  await press(page, block, address);
  await elisionsShown(page, block, elision);
}

test.describe("another tab chosen", () => {
  test("automatic elisions of e2e/groups, each part", async ({ page }) => {
    await groups(page);
    const score = automatic("score");
    await fromProperties(page, GRANDCHILD, automatic("score", "ellipsis"), score);
    await fromProperties(page, GRANDCHILD, automatic("score", "name"), score);
    await fromProperties(
      page,
      GRANDCHILD,
      automatic("movement", "ellipsis"),
      automatic("movement"),
    );
    await fromProperties(page, MIXED, automatic("session", "ellipsis"), automatic("session"));
    expect(
      await dispatch(page, {
        type: "style",
        select: { addresses: [{ id: "score", part: ["card"] }] },
        set: { "elision-display": "ellipsis name coordinate" },
        blocks: [GRANDCHILD],
      }),
    ).toBeNull();
    const coordinate = automatic("score", "coordinate");
    await expect(
      page
        .locator(
          `.svelte-flow__node[data-id="${GRANDCHILD}"] text[data-id="score"][data-part="elision coordinate"]`,
        )
        .first(),
    ).toHaveText("0–16 ♩");
    await fromProperties(page, GRANDCHILD, coordinate, score);
  });

  test("stored elisions, each part", async ({ page }) => {
    const block = await elisionsStored(page);
    const appendix = stored("elision_2");
    await fromProperties(page, block, stored("elision_2", "ellipsis"), appendix);
    await fromProperties(page, block, stored("elision_2", "name"), appendix);
    await fromProperties(page, block, stored("elision_2", "coordinate"), appendix);
    await fromProperties(page, block, stored("elision_4", "id"), stored("elision_4"));
    await fromProperties(page, block, stored("elision_3", "ellipsis"), stored("elision_3"));
  });
});

/** A named timestamp's wedge clicked shows the Timestamp tab with its name header. */
async function pinWedge(page: Page, block: string, timestamp: string): Promise<void> {
  await select(page, []);
  await press(page, block, { id: timestamp } as ElementAddress);
  await expect.poll(() => selection(page)).toEqual([{ block, id: timestamp }]);
  await expect(tab(page, "Timestamp")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("timestamp-name")).toBeVisible();
}

/** After an elision's click: the selection emptied keeps Elisions, and Timestamp then shows no pin. */
async function pinLetGo(page: Page): Promise<void> {
  await select(page, []);
  await expect.poll(() => selection(page)).toEqual([]);
  await expect(tab(page, "Elisions")).toHaveAttribute("aria-selected", "true");
  await tab(page, "Timestamp").click();
  await expect(tab(page, "Timestamp")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("timestamp-name")).toHaveCount(0);
}

test.describe("a pin held", () => {
  test("an automatic elision", async ({ page }) => {
    await groups(page);
    await pinWedge(page, GRANDCHILD, "timestamp_3");
    await press(page, GRANDCHILD, automatic("score", "ellipsis"));
    await elisionsShown(page, GRANDCHILD, automatic("score"));
    await pinLetGo(page);
  });

  test("a stored elision", async ({ page }) => {
    const block = await elisionsStored(page);
    await pinWedge(page, block, "timestamp_7");
    await press(page, block, stored("elision_2", "ellipsis"));
    await elisionsShown(page, block, stored("elision_2"));
    await pinLetGo(page);
  });
});

/**
 * Import `group_child_member_stamps`, apply `command` (which makes an
 * elision drawn), open the drawer and click the MatchStamp's anchor line,
 * which shows the Matchstamp tab with its name header; the block's ID.
 */
async function matchStampShown(page: Page, command: unknown): Promise<string> {
  const block = await importFixture(page, "groups/group_child_member_stamps");
  expect(await dispatch(page, { ...(command as object), ...blockOf(command, block) })).toBeNull();
  await openDrawer(page);
  await press(page, block, { id: "anchor_1", part: ["name"] } as ElementAddress);
  await expect.poll(() => selection(page)).toEqual([{ block, id: "matchstamp_1" }]);
  await expect(tab(page, "Matchstamp")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("matchstamp-name")).toBeVisible();
  return block;
}

/** `command`'s members naming the block: a style's `blocks`, an add's `into`. */
function blockOf(command: unknown, block: string): object {
  const { type, into } = command as { type: string; into?: Address };
  return type === "style" ? { blocks: [block] } : { into: { ...into, block } };
}

/** After an elision's click: the selection emptied keeps Elisions, and Matchstamp then shows no MatchStamp. */
async function matchLetGo(page: Page): Promise<void> {
  await select(page, []);
  await expect.poll(() => selection(page)).toEqual([]);
  await expect(tab(page, "Elisions")).toHaveAttribute("aria-selected", "true");
  await tab(page, "Matchstamp").click();
  await expect(tab(page, "Matchstamp")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("matchstamp-name")).toHaveCount(0);
}

test.describe("a MatchStamp shown", () => {
  test("an automatic elision", async ({ page }) => {
    const block = await matchStampShown(page, {
      type: "style",
      select: { addresses: [{ id: "piece", part: ["card"] }] },
      set: { "elision-mode": "proportional", "elision-proportion": 0.25 },
    });
    await press(page, block, automatic("piece", "ellipsis"));
    await elisionsShown(page, block, automatic("piece"));
    await matchLetGo(page);
  });

  test("a stored elision", async ({ page }) => {
    const block = await matchStampShown(page, {
      type: "add",
      into: { id: "middle" },
      elision: { start: [5, 1], end: [7, 1], name: "Gap" },
      ids: ["gap"],
    });
    await press(page, block, stored("gap", "ellipsis"));
    await elisionsShown(page, block, stored("gap"));
    await matchLetGo(page);
  });
});

/** Open the editor of `address` through the hook and wait until it is open. */
async function openEditor(page: Page, address: Address): Promise<void> {
  const open = (await editing(page)).length;
  expect(await page.evaluate((target) => window.__tilie.open(target), address)).toBeNull();
  await expect.poll(async () => (await editing(page)).length).toBe(open + 1);
}

test("an editor opened while the drawer is closed, then an elision selected", async ({ page }) => {
  const block = await importFixture(page, "bundles/bundle_elisions_stored");
  const group = stored("elision_3");
  await expect(page.getByRole("button", { name: "Open inspector" })).toBeVisible();

  // The first editor opens the drawer itself, on the level tab; the elision then brings Elisions.
  await openEditor(page, { block, id: "group_1" });
  await expect(tab(page, "Group")).toHaveAttribute("aria-selected", "true");
  await press(page, block, stored("elision_3", "ellipsis"));
  await elisionsShown(page, block, group);

  // Closed, a nested editor opened leaves it closed; an elision selected then leaves it closed too,
  // and opened it shows Elisions: the elision was selected after the editor opened.
  await closeDrawer(page);
  await openEditor(page, { block, id: "recording" });
  await expect(page.getByRole("button", { name: "Open inspector" })).toBeVisible();
  await press(page, block, stored("elision_3", "ellipsis"));
  await expect.poll(() => selection(page)).toEqual([{ block, ...group }]);
  await expect(page.getByRole("button", { name: "Open inspector" })).toBeVisible();
  await openDrawer(page);
  await expect(tab(page, "Elisions")).toHaveAttribute("aria-selected", "true");

  // Back on the arranger, closed: an elision selected leaves it closed, and an editor opened
  // afterwards opens it on the level tab.
  await done(page);
  await done(page);
  await closeDrawer(page);
  await select(page, []);
  await press(page, block, stored("elision_2", "ellipsis"));
  await expect.poll(() => selection(page)).toEqual([{ block, ...stored("elision_2") }]);
  await expect(page.getByRole("button", { name: "Open inspector" })).toBeVisible();
  await openEditor(page, { block, id: "group_1" });
  await expect(page.getByTestId("inspector")).toBeVisible();
  await expect(tab(page, "Group")).toHaveAttribute("aria-selected", "true");
});
