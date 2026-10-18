/**
 * Manifests holding groups on the canvas: what they draw, selecting an element
 * drawn twice, Delete of timelines and other elements, hover, a stretched box,
 * and import and export through the File menu. The expected values are derived in `README.md`
 * ("groups.spec.ts").
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { Manifest } from "../packages/core/src/index.ts";
import { isLoadError, loadManifest, saveManifest } from "../packages/core/src/index.ts";
import { manifestFileName } from "../packages/editor/src/files.ts";
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
  node,
  OPENED_JOURNAL,
  open,
  part,
  partCentre,
  pick,
  placement,
  selection,
  setViewport,
} from "./support.ts";

test.use({ viewport: { width: 1600, height: 1000 } });

const VIEW = { x: 40, y: 40, zoom: 1 };

/**
 * The distinct `data-address` values drawn in a node, in DOM order, kept
 * when they name a frame, a line or the manifest's title (no `/`), a card or
 * a group's title.
 */
function structure(page: Page, block: string): Promise<string[]> {
  return node(page, block)
    .locator("[data-address]")
    .evaluateAll((items) => {
      const kept: string[] = [];
      for (const item of items) {
        const address = item.getAttribute("data-address") ?? "";
        const shown =
          !address.includes("/") || address.endsWith("/card") || /^group_\d+\/name$/.test(address);
        if (shown && !kept.includes(address)) kept.push(address);
      }
      return kept;
    });
}

/** The text of each title in a node (the manifest's `name`, a group's `G/name`), by address. */
function titles(page: Page, block: string): Promise<Record<string, string>> {
  return node(page, block)
    .locator("[data-address]")
    .evaluateAll((items) =>
      Object.fromEntries(
        items
          .map((item): [string, string] => [
            item.getAttribute("data-address") ?? "",
            item.textContent ?? "",
          ])
          .filter(([address]) => /^(name|group_\d+\/name)$/.test(address)),
      ),
    );
}

/** The `data-address` of every part marked with `attribute`, block-qualified, in DOM order. */
function marked(page: Page, attribute: string): Promise<string[]> {
  return page
    .locator(`[${attribute}]`)
    .evaluateAll((items) =>
      items.map(
        (item) =>
          `${item.closest(".svelte-flow__node")?.getAttribute("data-id")}/${item.getAttribute("data-address")}`,
      ),
    );
}

/** How many parts of `address` in `block` have their box centre inside the part `frame`. */
async function partsInside(
  page: Page,
  block: string,
  address: string,
  frame: string,
): Promise<number> {
  const outer = await part(page, block, frame).boundingBox();
  if (outer === null) throw new Error(`${block}/${frame} is not displayed`);
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
    await expect(page.locator(".svelte-flow__node")).toHaveCount(4);
    expect(await structure(page, GROUPS.child)).toEqual([
      "group_1",
      "group_1/name",
      "second-half/card",
      "piece",
      "second-half",
      "recording/card",
      "recording",
    ]);
    expect(await structure(page, GROUPS.grandchild)).toEqual([
      "group_1",
      "group_1/name",
      "theme/card",
      "score",
      "movement",
      "theme",
      "recording/card",
      "recording",
    ]);
    expect(await structure(page, GROUPS.mixed)).toEqual([
      "group_1",
      "group_1/name",
      "exposition/card",
      "sonata",
      "exposition",
      "take/card",
      "session",
      "take",
      "system/card",
      "page",
      "system",
      "audio/card",
      "audio",
    ]);
    expect(await structure(page, GROUPS.styled)).toEqual([
      "group_1",
      "group_1/name",
      "score/card",
      "score",
      "page/card",
      "page",
      "performance/card",
      "performance",
    ]);
    const names = {
      [GROUPS.child]: "Second half",
      [GROUPS.grandchild]: "Theme",
      [GROUPS.mixed]: "Exposition",
      [GROUPS.styled]: "Edition",
    };
    for (const [block, name] of Object.entries(names)) {
      expect(await titles(page, block)).toEqual({ "group_1/name": name });
      await expect(element(page, block, "group_1")).toHaveCount(1);
    }
    await expect(element(page, GROUPS.child, "second-half/card")).toHaveCount(2);
    await expect(element(page, GROUPS.child, "recording/card")).toHaveCount(2);
  });

  test("selecting a part drawn twice marks both copies", async ({ page }) => {
    await expect(element(page, GROUPS.child, "second-half/start")).toHaveCount(2);
    const { x, y } = await partCentre(page, GROUPS.child, "second-half/start");
    await page.mouse.click(x, y);
    expect(await selection(page)).toEqual([`${GROUPS.child}/second-half/start`]);
    expect(await marked(page, "data-selected")).toEqual([
      `${GROUPS.child}/second-half/start`,
      `${GROUPS.child}/second-half/start`,
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
        card: "recording/card",
        roots: [["piece", ["second-half"]]],
        members: [["group_1", ["second-half"]]],
      },
      {
        timeline: "piece",
        card: "second-half/card",
        roots: [["recording", []]],
        members: [["group_1", ["recording"]]],
      },
    ];
    for (const { timeline, card, roots, members } of removals) {
      await page.evaluate(
        (address) => window.__tilie.select([address]),
        `${GROUPS.child}/${timeline}`,
      );
      await page.keyboard.press("Delete");
      expect(await commandsFrom(page, start)).toEqual([
        { type: "remove", targets: [`${GROUPS.child}/${timeline}`] },
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
          into: `${block}/second-half`,
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
    await expect(part(page, GROUPS.child, "piece/region_1")).toBeAttached();

    const regions = () =>
      page.evaluate((block) => {
        const manifest = window.__tilie.store().view.blocks[block]?.manifest as Manifest;
        const piece = manifest.timelines.find((root) => root.id === "piece");
        return piece?.children
          .find((child) => child.id === "second-half")
          ?.regions.map((region) => region.id);
      }, GROUPS.child);
    expect(await regions()).toEqual(["region_1"]);

    await page.evaluate(
      (address) => window.__tilie.select([address]),
      `${GROUPS.child}/piece/region_1`,
    );
    await page.keyboard.press("Delete");
    expect(await commandsFrom(page, start + 1)).toEqual([
      { type: "remove", targets: [`${GROUPS.child}/piece/region_1`] },
    ]);
    expect(await regions()).toEqual([]);
    await expect(element(page, GROUPS.child, "piece/region_1")).toHaveCount(0);

    await page.keyboard.press("ControlOrMeta+z");
    expect(await regions()).toEqual(["region_1"]);
    await expect(part(page, GROUPS.child, "piece/region_1")).toBeAttached();
  });

  test("hovering a member's line marks its card, not its shadow or the frame", async ({ page }) => {
    const { x, y } = await partCentre(page, GROUPS.child, "recording");
    await page.mouse.move(x, y, { steps: 2 });
    await expect
      .poll(() => marked(page, "data-hovered"))
      .toEqual([`${GROUPS.child}/recording/card`]);
    const empty = await emptyPoint(page, 600, 200);
    await page.mouse.move(empty.x, empty.y, { steps: 2 });
    await expect.poll(() => marked(page, "data-hovered")).toEqual([]);
  });

  test("hovering a frame away from its cards marks the frame", async ({ page }) => {
    const { x, y } = await framePoint(page, GROUPS.child, "group_1");
    await page.mouse.move(x, y, { steps: 2 });
    await expect.poll(() => marked(page, "data-hovered")).toEqual([`${GROUPS.child}/group_1`]);
  });

  test("a press on a frame selects the group", async ({ page }) => {
    const { x, y } = await framePoint(page, GROUPS.child, "group_1");
    await page.mouse.click(x, y);
    expect(await selection(page)).toEqual([`${GROUPS.child}/group_1`]);
    expect(await marked(page, "data-selected")).toEqual([`${GROUPS.child}/group_1`]);
    expect(await marked(page, "data-affected")).toEqual([]);
  });

  test("hover at zoom 1/2 marks the card under the pointer", async ({ page }) => {
    await setViewport(page, { ...VIEW, zoom: 0.5 });
    const { x, y } = await partCentre(page, GROUPS.child, "recording");
    await page.mouse.move(x, y, { steps: 2 });
    await expect
      .poll(() => marked(page, "data-hovered"))
      .toEqual([`${GROUPS.child}/recording/card`]);
  });

  test("hover on a block of scale 1.5 marks the card under the pointer", async ({ page }) => {
    const refusal = await page.evaluate(
      (block) =>
        window.__tilie
          .store()
          .dispatch({ type: "set", changes: [{ target: block, values: { scale: 1.5 } }] }),
      GROUPS.child,
    );
    expect(refusal).toBeNull();
    expect(await journalLength(page)).toBe(OPENED_JOURNAL.groups + 1);
    await expect(node(page, GROUPS.child).locator(".tilie-block > svg")).toHaveAttribute(
      "width",
      "837.62109375",
    );
    const { x, y } = await partCentre(page, GROUPS.child, "recording");
    await page.mouse.move(x, y, { steps: 2 });
    await expect
      .poll(() => marked(page, "data-hovered"))
      .toEqual([`${GROUPS.child}/recording/card`]);
  });
});

test.describe("a bundle workspace", () => {
  test.beforeEach(async ({ page }) => {
    await open(page, "bundles");
    await setViewport(page, VIEW);
  });

  test("draws the manifest's title, its frames and its ungrouped roots", async ({ page }) => {
    await expect(page.locator(".svelte-flow__node")).toHaveCount(3);
    expect(await structure(page, BUNDLES.mixed)).toEqual([
      "name",
      "group_1",
      "group_1/name",
      "score/card",
      "score",
      "performance/card",
      "performance",
      "group_2",
      "group_2/name",
      "page/card",
      "page",
      "excerpt/card",
      "recording",
      "excerpt",
      "annotations/card",
      "annotations",
    ]);
    expect(await structure(page, BUNDLES.shared)).toEqual([
      "name",
      "group_1",
      "group_1/name",
      "exposition/card",
      "score",
      "exposition",
      "take_1/card",
      "take_1",
      "group_2",
      "group_2/name",
      "recapitulation/card",
      "recapitulation",
      "take_2/card",
      "take_2",
      "page/card",
      "page",
    ]);
    expect(await structure(page, BUNDLES.ungrouped)).toEqual([
      "name",
      "pages/card",
      "pages",
      "recording/card",
      "recording",
      "score/card",
      "score",
    ]);
    expect(await titles(page, BUNDLES.mixed)).toEqual({
      name: "Mixed",
      "group_1/name": "Performance",
      "group_2/name": "Facsimile",
    });
    expect(await titles(page, BUNDLES.shared)).toEqual({
      name: "Sonata",
      "group_1/name": "Exposition",
      "group_2/name": "Recapitulation",
    });
    expect(await titles(page, BUNDLES.ungrouped)).toEqual({ name: "Sketches" });
  });

  test("selecting an ancestor line drawn in two frames marks both", async ({ page }) => {
    await expect(element(page, BUNDLES.shared, "score")).toHaveCount(8);
    expect(await partsInside(page, BUNDLES.shared, "score", "group_1")).toBe(4);
    expect(await partsInside(page, BUNDLES.shared, "score", "group_2")).toBe(4);
    const { x, y } = await partCentre(page, BUNDLES.shared, "score");
    await page.mouse.click(x, y);
    expect(await selection(page)).toEqual([`${BUNDLES.shared}/score`]);
    expect(await marked(page, "data-selected")).toEqual(
      Array.from({ length: 8 }, () => `${BUNDLES.shared}/score`),
    );
  });

  test("a click on a member's line marks its card and its frame dashed and the block dotted", async ({
    page,
  }) => {
    const block = node(page, BUNDLES.mixed).locator(".tilie-block");
    const boxes = node(page, BUNDLES.mixed).locator("rect[data-contains-selection]");
    const dashed = node(page, BUNDLES.mixed).locator("rect.tilie-holding");
    await expect(page.locator("[data-contains-selection]")).toHaveCount(0);
    await expect(dashed).toHaveCount(0);
    const { x, y } = await partCentre(page, BUNDLES.mixed, "score");
    await page.mouse.click(x, y);
    expect(await selection(page)).toEqual([`${BUNDLES.mixed}/score`]);
    expect(
      await boxes.evaluateAll((items) => items.map((item) => item.getAttribute("data-address"))),
    ).toEqual(["group_1", "score/card"]);
    await expect(block).toHaveAttribute("data-contains-selection", "");
    await expect(page.locator("[data-contains-selection]")).toHaveCount(3);
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
      ["group", blue, "2px", "6px, 4px", "non-scaling-stroke", "none"],
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
      ["group", blue, "1px", "3px, 2px", "non-scaling-stroke", "none"],
      ["card", blue, "1.5px", "3px, 2px", "non-scaling-stroke", "none"],
    ]);
    const stroke = (address: string) =>
      element(page, BUNDLES.mixed, address)
        .last()
        .evaluate((item) => getComputedStyle(item).stroke);
    expect(await stroke("group_1")).toBe("rgb(209, 213, 219)");
    expect(await stroke("score/card")).toBe("rgb(196, 201, 209)");
  });

  test("hovering a segment boundary marks that boundary and its card", async ({ page }) => {
    await expect(element(page, BUNDLES.ungrouped, "page_2/start")).toHaveCount(1);
    await expect(element(page, BUNDLES.ungrouped, "page_3/start")).toHaveCount(1);
    await expect(element(page, BUNDLES.ungrouped, "page_1/start")).toHaveCount(0);
    const { x, y } = await partCentre(page, BUNDLES.ungrouped, "page_2/start");
    await page.mouse.move(x, y, { steps: 2 });
    await expect
      .poll(() => marked(page, "data-hovered"))
      .toEqual([`${BUNDLES.ungrouped}/pages/card`, `${BUNDLES.ungrouped}/page_2/start`]);
    const empty = await emptyPoint(page, 610, 200);
    await page.mouse.move(empty.x, empty.y, { steps: 2 });
    await expect.poll(() => marked(page, "data-hovered")).toEqual([]);
  });

  test("Delete refuses a selection holding the manifest's title whole", async ({ page }) => {
    const before = await manifests(page);
    await page.evaluate(
      (addresses) => window.__tilie.select(addresses),
      [`${BUNDLES.mixed}/annotations`, `${BUNDLES.mixed}/name`],
    );
    await page.keyboard.press("Delete");
    const hint = page.locator('[data-testid="hint"]');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText("select the block to delete it");
    expect(await journalLength(page)).toBe(OPENED_JOURNAL.bundles);
    expect(await manifests(page)).toBe(before);
    await expect(part(page, BUNDLES.mixed, "annotations/card")).toBeAttached();
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
    await page.evaluate((id) => window.__tilie.select([id]), block);
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

/** The timeskeleton package that `core` depends on, and its schema version's manifest fixtures. */
const packageDir = path.dirname(
  createRequire(path.join(import.meta.dirname, "../packages/core/package.json")).resolve(
    "@timetoalign/timeskeleton/package.json",
  ),
);
const { SCHEMA_VERSION } = (await import(
  pathToFileURL(path.join(packageDir, "dist", "index.js")).href
)) as { readonly SCHEMA_VERSION: string };

/** A manifest fixture's text by its path below the schema version's fixtures (`groups/group_styled`). */
function fixtureFile(name: string): string {
  return readFileSync(path.join(packageDir, "fixtures", SCHEMA_VERSION, `${name}.json`), "utf8");
}

function loaded(text: string): Manifest {
  const manifest = loadManifest(text);
  if (isLoadError(manifest)) throw new Error(`a fixture is refused: ${JSON.stringify(manifest)}`);
  return manifest;
}

test.describe("manifests holding groups through the File menu", () => {
  test.beforeEach(async ({ page }) => {
    // The fallback path: without the pickers the editor uses a file input and a download.
    await page.addInitScript(() => {
      delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker;
      delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
    });
    await page.goto("/");
    await page.waitForFunction(() => window.__tilie !== undefined);
  });

  test("import a manifest of one group and a named one and export each byte for byte", async ({
    page,
  }) => {
    expect(await journalLength(page)).toBe(0);
    const cases = ["groups/group_styled", "bundles/bundle_mixed"];
    for (const [entry, name] of cases.entries()) {
      const text = fixtureFile(name);
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
      expect(await selection(page)).toEqual([block]);
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
