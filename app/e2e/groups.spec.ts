/**
 * Manifests holding groups on the canvas: what they draw, selecting an element
 * drawn twice, Delete of timelines and other elements, hover, a stretched box,
 * and import and export through the File menu. The expected values are derived in `README.md`
 * ("groups.spec.ts").
 */

import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { ElementAddress, Manifest } from "../packages/core/src/index.ts";
import {
  addressKey,
  cardAddress,
  idAddress,
  isLoadError,
  loadManifest,
  partAddress,
  saveManifest,
  TITLE_ADDRESS,
} from "../packages/core/src/index.ts";
import { manifestFileName } from "../packages/editor/src/files.ts";
import { manifestFixture } from "./schema.ts";
import {
  BUNDLES,
  chooseItem,
  commandsFrom,
  downloaded,
  dragStart,
  element,
  emptyPoint,
  framePoint,
  GROUPS,
  journalLength,
  marked,
  markOf,
  node,
  OPENED_JOURNAL,
  open,
  part,
  partCentre,
  pick,
  placement,
  select,
  selection,
  setViewport,
  structure,
  withoutPickers,
} from "./support.ts";

test.use({ viewport: { width: 1600, height: 1000 } });

const VIEW = { x: 40, y: 40, zoom: 1 };

/** The frame of group `id`. */
const frame = idAddress;

/** The title of group `id`. */
function title(id: string): ElementAddress {
  return partAddress(idAddress(id), "name");
}

/** A timeline's line, its address `{id}`. */
const line = idAddress;

/**
 * The distinct addresses of the elements showing a node's structure
 * (`support.ts`'s `structure`: a frame, a line, the title, a card or a
 * group's title), in DOM order, each once (by `addressKey`).
 */
async function structureOf(page: Page, block: string): Promise<ElementAddress[]> {
  const seen = new Map<string, ElementAddress>();
  for (const { address } of await structure(page, block)) {
    const key = addressKey(address);
    if (!seen.has(key)) seen.set(key, address);
  }
  return [...seen.values()];
}

/**
 * The text of each title in a node, the manifest's (`TITLE_ADDRESS`) and each
 * group's (`{id: G, part: ["name"]}`, `G` a group of the block's manifest), by
 * the key (`addressKey`) of its address.
 */
async function titles(page: Page, block: string): Promise<Record<string, string>> {
  const [texts, groups] = await Promise.all([
    node(page, block)
      .locator('.tilie-block svg [data-part="name"]:not([data-facet])')
      .evaluateAll((items) =>
        items.map((item) => ({
          id: item.getAttribute("data-id"),
          text: item.textContent ?? "",
        })),
      ),
    page.evaluate(
      (id) =>
        window.__tilie.store().view.blocks[id]?.manifest.groups.map((group) => group.id) ?? [],
      block,
    ),
  ]);
  return Object.fromEntries(
    texts.flatMap(({ id, text }) => {
      if (id === null) return [[addressKey(TITLE_ADDRESS), text]];
      return groups.includes(id) ? [[addressKey(title(id)), text]] : [];
    }),
  );
}

/** How many parts of `address` in `block` have their box centre inside the part `container`. */
async function partsInside(
  page: Page,
  block: string,
  address: ElementAddress,
  container: ElementAddress,
): Promise<number> {
  const outer = await part(page, block, container).boundingBox();
  if (outer === null) throw new Error(`${addressKey({ block, ...container })} is not displayed`);
  const boxes = await element(page, block, address).evaluateAll((items) =>
    items.map((item) => {
      const { x, y, width, height } = item.getBoundingClientRect();
      return { x: x + width / 2, y: y + height / 2 };
    }),
  );
  return boxes.filter(
    ({ x, y }) =>
      x >= outer.x && x <= outer.x + outer.width && y >= outer.y && y <= outer.y + outer.height,
  ).length;
}

/** Every block's manifest as JSON text, to prove that a refusal or an undo left nothing changed. */
function manifests(page: Page): Promise<string> {
  return page.evaluate(() => {
    const { view } = window.__tilie.store();
    return JSON.stringify(Object.keys(view.blocks).map((id) => [id, view.blocks[id]?.manifest]));
  });
}

test.describe("a group workspace", () => {
  test.beforeEach(async ({ page }) => {
    await open(page, "groups");
    await setViewport(page, VIEW);
  });

  test("draws its frames, cards, titles and lines in display order", async ({ page }) => {
    await expect(page.getByTestId("block")).toHaveCount(4);
    expect(await structureOf(page, GROUPS.child)).toEqual([
      frame("group_1"),
      title("group_1"),
      cardAddress("second-half"),
      line("piece"),
      line("second-half"),
      cardAddress("recording"),
      line("recording"),
    ]);
    expect(await structureOf(page, GROUPS.grandchild)).toEqual([
      frame("group_1"),
      title("group_1"),
      cardAddress("theme"),
      line("score"),
      line("movement"),
      line("theme"),
      cardAddress("recording"),
      line("recording"),
    ]);
    expect(await structureOf(page, GROUPS.mixed)).toEqual([
      frame("group_1"),
      title("group_1"),
      cardAddress("exposition"),
      line("sonata"),
      line("exposition"),
      cardAddress("take"),
      line("session"),
      line("take"),
      cardAddress("system"),
      line("page"),
      line("system"),
      cardAddress("audio"),
      line("audio"),
    ]);
    expect(await structureOf(page, GROUPS.styled)).toEqual([
      frame("group_1"),
      title("group_1"),
      cardAddress("score"),
      line("score"),
      cardAddress("page"),
      line("page"),
      cardAddress("performance"),
      line("performance"),
    ]);
    const names = {
      [GROUPS.child]: "Second half",
      [GROUPS.grandchild]: "Theme",
      [GROUPS.mixed]: "Exposition",
      [GROUPS.styled]: "Edition",
    };
    for (const [block, name] of Object.entries(names)) {
      expect(await titles(page, block)).toEqual({ [addressKey(title("group_1"))]: name });
      await expect(element(page, block, frame("group_1"))).toHaveCount(1);
    }
    await expect(element(page, GROUPS.child, cardAddress("second-half"))).toHaveCount(2);
    await expect(element(page, GROUPS.child, cardAddress("recording"))).toHaveCount(2);
  });

  test("selecting a part drawn twice marks both copies", async ({ page }) => {
    const start = partAddress(line("second-half"), "start");
    await expect(element(page, GROUPS.child, start)).toHaveCount(2);
    const { x, y } = await partCentre(page, GROUPS.child, start);
    await page.mouse.click(x, y);
    expect(await selection(page)).toEqual([{ block: GROUPS.child, ...start }]);
    expect(await marked(page, "selection")).toEqual([
      markOf(GROUPS.child, start),
      markOf(GROUPS.child, start),
    ]);
  });

  test("Delete removes a timeline with its subtree from the group, and a region", async ({
    page,
  }) => {
    const start = OPENED_JOURNAL.groups;
    const before = await manifests(page);
    /** The root ids, each with its children's ids, and every group's members. */
    const contents = () =>
      page.evaluate((block) => {
        const manifest = window.__tilie.store().view.blocks[block]?.manifest as Manifest;
        return {
          roots: manifest.timelines.map((root) => [root.id, root.children.map(({ id }) => id)]),
          members: manifest.groups.map((group) => [group.id, group.members]),
        };
      }, GROUPS.child);
    // `piece` is drawn only as `second-half`'s ancestor line, so its card goes with `second-half`.
    const removals = [
      {
        timeline: "recording",
        card: cardAddress("recording"),
        roots: [["piece", ["second-half"]]],
        members: [["group_1", ["second-half"]]],
      },
      {
        timeline: "piece",
        card: cardAddress("second-half"),
        roots: [["recording", []]],
        members: [["group_1", ["recording"]]],
      },
    ];
    for (const { timeline, card, roots, members } of removals) {
      await select(page, [{ block: GROUPS.child, id: timeline }]);
      await page.keyboard.press("Delete");
      expect(await commandsFrom(page, start)).toEqual([
        { type: "remove", targets: [{ block: GROUPS.child, id: timeline }] },
      ]);
      expect(await contents()).toEqual({ roots, members });
      await expect(element(page, GROUPS.child, card)).toHaveCount(0);
      await page.keyboard.press("ControlOrMeta+z");
      expect(await journalLength(page)).toBe(start);
      expect(await manifests(page)).toBe(before);
    }

    const refusal = await page.evaluate(
      (block) =>
        window.__tilie.store().dispatch({
          type: "add",
          into: { block, id: "second-half" },
          region: {
            id: "region_1",
            name: "A",
            start: [2, 1],
            end: [6, 1],
            meta: {},
          },
        }),
      GROUPS.child,
    );
    expect(refusal).toBeNull();
    expect(await journalLength(page)).toBe(start + 1);
    await expect(part(page, GROUPS.child, idAddress("region_1"))).toBeAttached();

    const regions = () =>
      page.evaluate((block) => {
        const manifest = window.__tilie.store().view.blocks[block]?.manifest as Manifest;
        const piece = manifest.timelines.find((root) => root.id === "piece");
        return piece?.children
          .find((child) => child.id === "second-half")
          ?.regions.map((region) => region.id);
      }, GROUPS.child);
    expect(await regions()).toEqual(["region_1"]);

    await select(page, [{ block: GROUPS.child, id: "region_1" }]);
    await page.keyboard.press("Delete");
    expect(await commandsFrom(page, start + 1)).toEqual([
      { type: "remove", targets: [{ block: GROUPS.child, id: "region_1" }] },
    ]);
    expect(await regions()).toEqual([]);
    await expect(element(page, GROUPS.child, idAddress("region_1"))).toHaveCount(0);

    await page.keyboard.press("ControlOrMeta+z");
    expect(await regions()).toEqual(["region_1"]);
    await expect(part(page, GROUPS.child, idAddress("region_1"))).toBeAttached();
  });

  test("hovering a member's line marks its card, not its shadow or the frame", async ({ page }) => {
    const { x, y } = await partCentre(page, GROUPS.child, line("recording"));
    await page.mouse.move(x, y, { steps: 2 });
    await expect
      .poll(() => marked(page, "hover"))
      .toEqual([markOf(GROUPS.child, cardAddress("recording"))]);
    const empty = await emptyPoint(page, 600, 200);
    await page.mouse.move(empty.x, empty.y, { steps: 2 });
    await expect.poll(() => marked(page, "hover")).toEqual([]);
  });

  test("hovering a frame away from its cards marks the frame", async ({ page }) => {
    const { x, y } = await framePoint(page, GROUPS.child, frame("group_1"));
    await page.mouse.move(x, y, { steps: 2 });
    await expect
      .poll(() => marked(page, "hover"))
      .toEqual([markOf(GROUPS.child, frame("group_1"))]);
  });

  test("a press on a frame selects the group", async ({ page }) => {
    const { x, y } = await framePoint(page, GROUPS.child, frame("group_1"));
    await page.mouse.click(x, y);
    expect(await selection(page)).toEqual([{ block: GROUPS.child, id: "group_1" }]);
    expect(await marked(page, "selection")).toEqual([markOf(GROUPS.child, frame("group_1"))]);
    expect(await marked(page, "affected")).toEqual([]);
  });

  test("hover at zoom 1/2 marks the card under the pointer", async ({ page }) => {
    await setViewport(page, { ...VIEW, zoom: 0.5 });
    const { x, y } = await partCentre(page, GROUPS.child, line("recording"));
    await page.mouse.move(x, y, { steps: 2 });
    await expect
      .poll(() => marked(page, "hover"))
      .toEqual([markOf(GROUPS.child, cardAddress("recording"))]);
  });

  test("hover on a block of scale 1.5 marks the card under the pointer", async ({ page }) => {
    const refusal = await page.evaluate(
      (block) =>
        window.__tilie
          .store()
          .dispatch({ type: "set", changes: [{ target: { block }, values: { scale: 1.5 } }] }),
      GROUPS.child,
    );
    expect(refusal).toBeNull();
    expect(await journalLength(page)).toBe(OPENED_JOURNAL.groups + 1);
    await expect(node(page, GROUPS.child).locator(".tilie-block > svg")).toHaveAttribute(
      "width",
      "837.62109375",
    );
    const { x, y } = await partCentre(page, GROUPS.child, line("recording"));
    await page.mouse.move(x, y, { steps: 2 });
    await expect
      .poll(() => marked(page, "hover"))
      .toEqual([markOf(GROUPS.child, cardAddress("recording"))]);
  });
});

test.describe("a bundle workspace", () => {
  test.beforeEach(async ({ page }) => {
    await open(page, "bundles");
    await setViewport(page, VIEW);
  });

  test("draws the manifest's title, its frames and its ungrouped roots", async ({ page }) => {
    await expect(page.getByTestId("block")).toHaveCount(4);
    expect(await structureOf(page, BUNDLES.mixed)).toEqual([
      TITLE_ADDRESS,
      frame("group_1"),
      title("group_1"),
      cardAddress("score"),
      line("score"),
      cardAddress("performance"),
      line("performance"),
      frame("group_2"),
      title("group_2"),
      cardAddress("page"),
      line("page"),
      cardAddress("excerpt"),
      line("recording"),
      line("excerpt"),
      cardAddress("annotations"),
      line("annotations"),
    ]);
    expect(await structureOf(page, BUNDLES.shared)).toEqual([
      TITLE_ADDRESS,
      frame("group_1"),
      title("group_1"),
      cardAddress("exposition"),
      line("score"),
      line("exposition"),
      cardAddress("take_1"),
      line("take_1"),
      frame("group_2"),
      title("group_2"),
      cardAddress("recapitulation"),
      line("recapitulation"),
      line("recapitulation_first"),
      line("recapitulation_second"),
      cardAddress("take_2"),
      line("take_2"),
      cardAddress("page"),
      line("page"),
    ]);
    expect(await structureOf(page, BUNDLES.ungrouped)).toEqual([
      TITLE_ADDRESS,
      cardAddress("pages"),
      line("pages"),
      cardAddress("recording"),
      line("recording"),
      cardAddress("score"),
      line("score"),
    ]);
    // The card and line of `t`, drawn in both frames, are listed where first drawn.
    expect(await structureOf(page, BUNDLES.twoGroups)).toEqual([
      TITLE_ADDRESS,
      frame("g1"),
      title("g1"),
      cardAddress("t"),
      line("t"),
      cardAddress("u"),
      line("u"),
      frame("g2"),
      title("g2"),
      cardAddress("v"),
      line("v"),
    ]);
    expect(await titles(page, BUNDLES.mixed)).toEqual({
      [addressKey(TITLE_ADDRESS)]: "Mixed",
      [addressKey(title("group_1"))]: "Performance",
      [addressKey(title("group_2"))]: "Facsimile",
    });
    expect(await titles(page, BUNDLES.shared)).toEqual({
      [addressKey(TITLE_ADDRESS)]: "Sonata",
      [addressKey(title("group_1"))]: "Exposition",
      [addressKey(title("group_2"))]: "Recapitulation",
    });
    expect(await titles(page, BUNDLES.ungrouped)).toEqual({
      [addressKey(TITLE_ADDRESS)]: "Sketches",
    });
    expect(await titles(page, BUNDLES.twoGroups)).toEqual({
      [addressKey(TITLE_ADDRESS)]: "Shared",
      [addressKey(title("g1"))]: "Performance",
      [addressKey(title("g2"))]: "Page",
    });
  });

  test("selecting an ancestor line drawn in two frames marks both", async ({ page }) => {
    const score = line("score");
    await expect(element(page, BUNDLES.shared, score)).toHaveCount(8);
    expect(await partsInside(page, BUNDLES.shared, score, frame("group_1"))).toBe(4);
    expect(await partsInside(page, BUNDLES.shared, score, frame("group_2"))).toBe(4);
    const { x, y } = await partCentre(page, BUNDLES.shared, score);
    await page.mouse.click(x, y);
    expect(await selection(page)).toEqual([{ block: BUNDLES.shared, id: "score" }]);
    expect(await marked(page, "selection")).toEqual(
      Array.from({ length: 8 }, () => markOf(BUNDLES.shared, score)),
    );
  });

  test("a click on a member's line marks its card and its frame dashed and the block dotted", async ({
    page,
  }) => {
    const block = node(page, BUNDLES.mixed).locator(".tilie-block");
    const dashed = node(page, BUNDLES.mixed).locator('rect.tilie-mark[data-mark="holding"]');
    await expect(page.locator("[data-contains-selection]")).toHaveCount(0);
    await expect(dashed).toHaveCount(0);
    const { x, y } = await partCentre(page, BUNDLES.mixed, line("score"));
    await page.mouse.click(x, y);
    expect(await selection(page)).toEqual([{ block: BUNDLES.mixed, id: "score" }]);
    expect(
      await dashed.evaluateAll((items) => items.map((item) => item.getAttribute("data-marks"))),
    ).toEqual(["{}", addressKey(frame("group_1")), addressKey(cardAddress("score"))]);
    await expect(block).toHaveAttribute("data-contains-selection", "");
    await expect(page.locator("[data-contains-selection]")).toHaveCount(1);
    const looks = () =>
      dashed.evaluateAll((items) =>
        items.map((item) => {
          const style = getComputedStyle(item);
          return [
            item.getAttribute("data-box"),
            style.stroke,
            style.strokeWidth,
            style.strokeDasharray,
            style.vectorEffect,
            style.fill,
          ];
        }),
      );
    const blue = "rgb(10, 132, 255)";
    expect(await looks()).toEqual([
      ["block", blue, "1px", "1px, 2px", "non-scaling-stroke", "none"],
      ["frame", blue, "2px", "6px, 4px", "non-scaling-stroke", "none"],
      ["card", blue, "3px", "6px, 4px", "non-scaling-stroke", "none"],
    ]);
    expect(
      await dashed.evaluateAll((items) =>
        items.map((item) => getComputedStyle(item).shapeRendering),
      ),
    ).toEqual(["crispedges", "auto", "auto"]);
    await setViewport(page, { ...VIEW, zoom: 2 });
    expect(await looks()).toEqual([
      ["block", blue, "0.5px", "0.5px, 1px", "non-scaling-stroke", "none"],
      ["frame", blue, "1px", "3px, 2px", "non-scaling-stroke", "none"],
      ["card", blue, "1.5px", "3px, 2px", "non-scaling-stroke", "none"],
    ]);
    const stroke = (address: ElementAddress) =>
      element(page, BUNDLES.mixed, address)
        .last()
        .evaluate((item) => getComputedStyle(item).stroke);
    expect(await stroke(frame("group_1"))).toBe("rgb(209, 213, 219)");
    expect(await stroke(cardAddress("score"))).toBe("rgb(196, 201, 209)");
  });

  test("hovering a segment boundary marks that boundary and its card", async ({ page }) => {
    const startOf = (id: string) => partAddress(idAddress(id), "start");
    await expect(element(page, BUNDLES.ungrouped, startOf("page_2"))).toHaveCount(1);
    await expect(element(page, BUNDLES.ungrouped, startOf("page_3"))).toHaveCount(1);
    await expect(element(page, BUNDLES.ungrouped, startOf("page_1"))).toHaveCount(0);
    const { x, y } = await partCentre(page, BUNDLES.ungrouped, startOf("page_2"));
    await page.mouse.move(x, y, { steps: 2 });
    await expect
      .poll(() => marked(page, "hover"))
      .toEqual([
        markOf(BUNDLES.ungrouped, cardAddress("pages")),
        markOf(BUNDLES.ungrouped, startOf("page_2")),
      ]);
    const empty = await emptyPoint(page, 610, 200);
    await page.mouse.move(empty.x, empty.y, { steps: 2 });
    await expect.poll(() => marked(page, "hover")).toEqual([]);
  });

  test("Delete refuses a selection holding the manifest's title whole", async ({ page }) => {
    const before = await manifests(page);
    await select(page, [
      { block: BUNDLES.mixed, id: "annotations" },
      { block: BUNDLES.mixed, ...TITLE_ADDRESS },
    ]);
    await page.keyboard.press("Delete");
    const hint = page.locator('[data-testid="hint"]');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText("select the block to delete it");
    expect(await journalLength(page)).toBe(OPENED_JOURNAL.bundles);
    expect(await manifests(page)).toBe(before);
    await expect(part(page, BUNDLES.mixed, cardAddress("annotations"))).toBeAttached();
  });

  test("a stretch keeps the margin a box resize added in proportion", async ({ page }) => {
    const block = BUNDLES.ungrouped;
    /** Drag a handle by whole pixels from a whole-pixel point; the release journals one `set`. */
    const drag = async (handle: string, dx: number, dy: number) => {
      const grip = await page.locator(`[data-testid="handle-${handle}"]`).boundingBox();
      if (grip === null) throw new Error(`handle ${handle} is not displayed`);
      const before = await journalLength(page);
      const start = {
        x: Math.round(grip.x + grip.width / 2),
        y: Math.round(grip.y + grip.height / 2),
      };
      await dragStart(page, start, dx, dy);
      await page.mouse.up();
      expect(await journalLength(page)).toBe(before + 1);
    };
    await select(page, [{ block }]);
    await page.locator('[data-testid="mode-box"]').click();
    await drag("bottom-right", 40, 30);
    const boxed = await placement(page, block);
    expect(boxed.width).toBe(565.89697265625);
    expect(boxed.height).not.toBeNull();

    await page.locator('[data-testid="mode-stretch"]').click();
    expect(await page.evaluate(() => window.__tilie.mode())).toBe("stretch");
    const before = await node(page, block).boundingBox();
    await drag("right", 50, 0);
    const after = await node(page, block).boundingBox();
    const stretched = await placement(page, block);
    expect({
      x: stretched.x,
      y: stretched.y,
      length: stretched.length,
      width: stretched.width,
      height: stretched.height,
    }).toEqual({
      x: 0,
      y: 480,
      length: 446.4658203125,
      width: 615.89697265625,
      height: boxed.height,
    });
    if (before === null || after === null) throw new Error(`${block} is not displayed`);
    expect(after.x).toBe(before.x);
    expect(after.x + after.width - (before.x + before.width)).toBe(50);
  });
});

function loaded(text: string): Manifest {
  const manifest = loadManifest(text);
  if (isLoadError(manifest)) throw new Error(`a fixture is refused: ${JSON.stringify(manifest)}`);
  return manifest;
}

test.describe("manifests holding groups through the File menu", () => {
  test.beforeEach(async ({ page }) => {
    await withoutPickers(page);
    await page.goto("/");
    await page.waitForFunction(() => window.__tilie !== undefined);
  });

  test("import a manifest of one group and a named one and export each byte for byte", async ({
    page,
  }) => {
    expect(await journalLength(page)).toBe(0);
    const cases = ["groups/group_styled", "bundles/bundle_mixed"];
    for (const [entry, name] of cases.entries()) {
      const text = manifestFixture(name);
      const manifest = loaded(text);
      const before = await page.evaluate(() => Object.keys(window.__tilie.store().view.blocks));

      await pick(page, "Import manifest…", path.basename(`${name}.json`), text);
      await expect.poll(() => journalLength(page)).toBe(entry + 1);
      const added = await page.evaluate(
        (known) =>
          Object.keys(window.__tilie.store().view.blocks).filter((block) => !known.includes(block)),
        before,
      );
      expect(added).toHaveLength(1);
      const [block] = added;
      if (block === undefined) throw new Error(`${name}.json added no block`);
      expect(await selection(page)).toEqual([{ block }]);
      const stored = await page.evaluate(
        (target) => JSON.stringify(window.__tilie.store().view.blocks[target]?.manifest),
        block,
      );
      expect(stored).toEqual(JSON.stringify(manifest));

      const exported = downloaded(page.waitForEvent("download"));
      await chooseItem(page, "Export manifest…");
      const [fileName, written] = await exported;
      expect(fileName).toBe(manifestFileName(manifest));
      expect(written).toBe(saveManifest(manifest));
      expect(written).toBe(text);
    }
  });
});
