/**
 * Group and bundle files on the canvas: what they draw, selecting an element
 * drawn twice, Delete in a group file, hover, and import and export through
 * the File menu. The expected values are derived in `README.md`
 * ("groups.spec.ts").
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { BundleFile, GroupFile, Manifest } from "../packages/core/src/index.ts";
import { isLoadError, loadManifest, saveManifest } from "../packages/core/src/index.ts";
import {
  BUNDLES,
  chooseItem,
  commandsFrom,
  downloaded,
  element,
  emptyPoint,
  GROUPS,
  journalLength,
  node,
  OPENED_JOURNAL,
  open,
  part,
  partCentre,
  pick,
  selection,
  setViewport,
} from "./support.ts";

test.use({ viewport: { width: 1600, height: 1000 } });

const VIEW = { x: 40, y: 40, zoom: 1 };

/**
 * The distinct `data-address` values drawn in a node, in DOM order, kept
 * when they name a frame or a line (no `/`), a card or a title.
 */
function structure(page: Page, block: string): Promise<string[]> {
  return node(page, block)
    .locator("[data-address]")
    .evaluateAll((items) => {
      const kept: string[] = [];
      for (const item of items) {
        const address = item.getAttribute("data-address") ?? "";
        const shown =
          !address.includes("/") ||
          address.endsWith("/card") ||
          /^(group|bundle)_\d+\/name$/.test(address);
        if (shown && !kept.includes(address)) kept.push(address);
      }
      return kept;
    });
}

/** The text of each title in a node, by address. */
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
          .filter(([address]) => /^(group|bundle)_\d+\/name$/.test(address)),
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

/** Every block's manifest as JSON text, to prove a refusal changed nothing. */
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

  test("Delete refuses a timeline and removes a region", async ({ page }) => {
    const start = OPENED_JOURNAL.groups;
    const hint = page.locator('[data-testid="hint"]');
    const before = await manifests(page);
    for (const timeline of ["recording", "piece"]) {
      await page.evaluate(
        (address) => window.__tilie.select([address]),
        `${GROUPS.child}/${timeline}`,
      );
      await page.keyboard.press("Delete");
      await expect(hint).toBeVisible();
      await expect(hint).toContainText(timeline);
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
            start: { unit: "quarters", number_type: "fraction", value: [2, 1] },
            end: { unit: "quarters", number_type: "fraction", value: [6, 1] },
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
        const manifest = window.__tilie.store().view.blocks[block]?.manifest as GroupFile;
        const piece = manifest.timelines.find((root) => root.id === "piece");
        return piece?.children["second-half"]?.timeline.regions.map((region) => region.id);
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

  test("hovering a member's line marks its card, not the shadow", async ({ page }) => {
    const { x, y } = await partCentre(page, GROUPS.child, "recording");
    await page.mouse.move(x, y, { steps: 2 });
    await expect
      .poll(() => marked(page, "data-hovered"))
      .toEqual([`${GROUPS.child}/recording/card`]);
    const empty = await emptyPoint(page, 600, 200);
    await page.mouse.move(empty.x, empty.y, { steps: 2 });
    await expect.poll(() => marked(page, "data-hovered")).toEqual([]);
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

  test("draws the bundle's title, its frames and its ungrouped roots", async ({ page }) => {
    await expect(page.locator(".svelte-flow__node")).toHaveCount(3);
    expect(await structure(page, BUNDLES.mixed)).toEqual([
      "bundle_1/name",
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
      "bundle_1/name",
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
      "bundle_1/name",
      "pages/card",
      "pages",
      "recording/card",
      "recording",
      "score/card",
      "score",
    ]);
    expect(await titles(page, BUNDLES.mixed)).toEqual({
      "bundle_1/name": "Mixed",
      "group_1/name": "Performance",
      "group_2/name": "Facsimile",
    });
    expect(await titles(page, BUNDLES.shared)).toEqual({
      "bundle_1/name": "Sonata",
      "group_1/name": "Exposition",
      "group_2/name": "Recapitulation",
    });
    expect(await titles(page, BUNDLES.ungrouped)).toEqual({ "bundle_1/name": "Sketches" });
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

test.describe("group and bundle files through the File menu", () => {
  test.beforeEach(async ({ page }) => {
    // The fallback path: without the pickers the editor uses a file input and a download.
    await page.addInitScript(() => {
      delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker;
      delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
    });
    await page.goto("/");
    await page.waitForFunction(() => window.__tilie !== undefined);
  });

  test("import a group and a bundle file and export each byte for byte", async ({ page }) => {
    expect(await journalLength(page)).toBe(0);
    const cases = [
      {
        name: "groups/group_styled",
        kind: "group",
        id: (manifest: Manifest) => (manifest as GroupFile).group.id,
      },
      {
        name: "bundles/bundle_mixed",
        kind: "bundle",
        id: (manifest: Manifest) => (manifest as BundleFile).bundle.id,
      },
    ];
    for (const [entry, { name, kind, id }] of cases.entries()) {
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
      const stored = await page.evaluate((target) => {
        const found = window.__tilie.store().view.blocks[target];
        return { blockKind: found?.blockKind, manifest: JSON.stringify(found?.manifest) };
      }, block);
      expect(stored).toEqual({ blockKind: kind, manifest: JSON.stringify(manifest) });

      const exported = downloaded(page.waitForEvent("download"));
      await chooseItem(page, "Export manifest…");
      const [fileName, written] = await exported;
      expect(fileName).toBe(`${id(manifest)}.json`);
      expect(written).toBe(saveManifest(manifest));
      expect(written).toBe(text);
    }
  });
});
