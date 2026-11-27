/**
 * The canvas's time budgets on the 300-block workspace, and the coordinate
 * flag's over a PiecewiseMap of 10^5 breaks, measured in Chromium through
 * the DevTools Protocol's `Performance.getMetrics` (script time, the number
 * the frame rate cap cannot hide). Each test prints what it measured.
 * The same budgets hold for pointer moves and zoom over a workspace of
 * virtual cards. Derivation in `README.md` ("budget.spec.ts").
 */

import type { CDPSession, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { CommandError } from "../packages/core/src/index.ts";
import { FACETS } from "../packages/core/src/index.ts";
import { GRID_PITCH } from "./fixtures/generate.ts";
import { manifestFixture } from "./schema.ts";
import {
  cardPoint,
  dispatch,
  drag,
  emptyPoint,
  frames,
  journalLength,
  node,
  open,
  partCentre,
  pick,
  SMALL,
  setViewport,
  viewportOf,
  withoutPickers,
} from "./support.ts";

const MOVES = 60;
/** Zoom 1, the grid's first rows in view. */
const VIEW = { x: 20, y: 20, zoom: 1 };

async function scriptSeconds(cdp: CDPSession): Promise<number> {
  const { metrics } = await cdp.send("Performance.getMetrics");
  const found = metrics.find((metric) => metric.name === "ScriptDuration");
  if (found === undefined) throw new Error("no ScriptDuration metric");
  return found.value;
}

/** Script milliseconds per move of `gesture`, which makes `MOVES` moves. */
async function perMove(
  page: Page,
  cdp: CDPSession,
  gesture: () => Promise<void>,
  moves: number = MOVES,
) {
  await frames(page);
  const before = await scriptSeconds(cdp);
  await gesture();
  await frames(page);
  const after = await scriptSeconds(cdp);
  return ((after - before) * 1000) / moves;
}

test.describe("budgets at 300 blocks", { tag: "@budget" }, () => {
  test.beforeEach(async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "script time is read through Chromium's protocol");
    await open(page, "grid-300");
    await setViewport(page, VIEW);
    await expect(page.getByTestId("block")).toHaveCount(300);
  });

  test("dragging a block costs at most 3 ms of script per pointer move", async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    const id = "g000000021";
    const start = await cardPoint(page, id);
    const ms = await perMove(page, cdp, () => drag(page, start, GRID_PITCH.x / 2, 120, MOVES));
    console.log(`drag: ${ms.toFixed(3)} ms of script per pointer move`);
    await expect(node(page, id)).toHaveCount(1);
    expect(ms).toBeLessThanOrEqual(3);
  });

  test("panning costs at most 1 ms of script per pointer move", async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    const start = await emptyPoint(page, -20, 40);
    const ms = await perMove(page, cdp, () => drag(page, start, 300, -120, MOVES));
    console.log(`pan: ${ms.toFixed(3)} ms of script per pointer move`);
    expect(ms).toBeLessThanOrEqual(1);
  });

  test("Ctrl+wheel zoom costs at most 1 ms of script per wheel event", async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    const at = await emptyPoint(page, -20, 40);
    await page.mouse.move(at.x, at.y);
    await page.keyboard.down("Control");
    const ms = await perMove(page, cdp, async () => {
      for (let n = 0; n < MOVES; n += 1) {
        await page.mouse.wheel(0, n < MOVES / 2 ? 40 : -40);
        await frames(page);
      }
    });
    await page.keyboard.up("Control");
    console.log(`zoom: ${ms.toFixed(3)} ms of script per wheel event`);
    expect(ms).toBeLessThanOrEqual(1);
  });

  // The measured gesture above is a zoom: one Ctrl+wheel event of -40 zooms
  // from 1 to 2 ** (40 × 0.002) (Svelte Flow's pinch zoom, Chromium's user
  // agent is not a Mac's).
  test("Ctrl+wheel zooms in the budget workspace", async ({ page }) => {
    const at = await emptyPoint(page, -20, 40);
    await page.mouse.move(at.x, at.y);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -40);
    await page.keyboard.up("Control");
    await expect.poll(async () => (await viewportOf(page)).zoom).toBe(2 ** (40 * 0.002));
  });

  test("a plain wheel pans in the budget workspace, at most 1 ms per event", async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    const at = await emptyPoint(page, -20, 40);
    await page.mouse.move(at.x, at.y);
    const ms = await perMove(page, cdp, async () => {
      for (let n = 0; n < MOVES; n += 1) {
        await page.mouse.wheel(0, n < MOVES / 2 ? 40 : -40);
        await frames(page);
      }
    });
    console.log(`wheel pan: ${ms.toFixed(3)} ms of script per wheel event`);
    expect(ms).toBeLessThanOrEqual(1);
  });

  test("a command costs at most 1 ms, a single-block redraw at most one frame", async ({
    page,
  }) => {
    const { command, redraw } = await page.evaluate(async () => {
      const store = window.__tilie.store();
      const settle = () => new Promise<void>((done) => queueMicrotask(done));
      /**
       * The shortest time of `run` plus `after`. Without `after` the time stops
       * when `run` returns; the flush it caused runs untimed before the next run.
       */
      const fastest = async (run: (n: number) => void, after?: () => Promise<void>) => {
        const times: number[] = [];
        for (let n = 0; n < 6; n += 1) {
          const start = performance.now();
          run(n);
          if (after !== undefined) await after();
          times.push(performance.now() - start);
          if (after === undefined)
            await new Promise<void>((done) => requestAnimationFrame(() => done()));
        }
        // The first run warms up; the shortest of the others is the code's cost.
        return Math.min(...times.slice(1));
      };
      const command = await fastest((n) => {
        store.dispatch({
          type: "set",
          changes: [{ target: { block: "g000000000" }, values: { x: (n + 1) * 8, y: 0 } }],
        });
      });
      const redraw = await fastest(
        (n) => {
          store.dispatch({
            type: "set",
            changes: [{ target: { block: "g000000001" }, values: { length: 400 + (n + 1) * 8 } }],
          });
        },
        async () => {
          // Svelte flushes its effects in a microtask; reading the node's box
          // then forces the style and layout of the new drawing.
          await settle();
          await settle();
          document
            .querySelector('.svelte-flow__node[data-id="g000000001"]')
            ?.getBoundingClientRect();
        },
      );
      return { command, redraw };
    });
    console.log(`command: ${command.toFixed(3)} ms; single-block redraw: ${redraw.toFixed(3)} ms`);
    expect(command).toBeLessThanOrEqual(1);
    expect(redraw).toBeLessThanOrEqual(16.7);
  });
});

/** The pointer moves of the coordinate flag's budget. */
const FLAG_MOVES = 200;
/** The breaks of the PiecewiseMap the flag reads. */
const BREAKS = 100_000;
/** One frame at 60 Hz, in milliseconds. */
const FRAME_MS = 16.7;

/**
 * Adds to `melody` (8 quarters) a PiecewiseMap from quarters to seconds:
 * `BREAKS` breaks `8k / (BREAKS − 1)` from 0 to 8, a LinearMap between each
 * two. The map is built inside the page and dispatched there, so the setup
 * does not spend the test's time handing 10^5 objects from the test process
 * to the page.
 */
function addPieces(page: Page): Promise<CommandError | null> {
  return page.evaluate(
    ({ block, breaks }) =>
      window.__tilie.store().dispatch({
        type: "add",
        into: { block, id: "melody" },
        map: {
          type: "PiecewiseMap",
          id: "pieces",
          name: "Pieces",
          source_unit: "quarters",
          target_unit: "seconds",
          breaks: Array.from({ length: breaks }, (_, k) => [8 * k, breaks - 1]),
          maps: Array.from({ length: breaks - 1 }, (_, k) => ({
            type: "LinearMap",
            id: `piece_${k}`,
            name: null,
            source_unit: "quarters",
            target_unit: "seconds",
            scalar: [k + 1, 7],
            offset: [-k, 3],
          })),
        },
      }),
    { block: SMALL.map, breaks: BREAKS },
  );
}

test.describe("the coordinate flag over a PiecewiseMap of 10^5 breaks", { tag: "@budget" }, () => {
  test.beforeEach(async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "script time is read through Chromium's protocol");
    await open(page, "small");
    await setViewport(page, { x: 40, y: 40, zoom: 1 });
    expect(await addPieces(page)).toBeNull();
    await page.getByRole("button", { name: "Show coordinates" }).click();
    await expect(page.getByTestId("coordinates")).toHaveAttribute("aria-pressed", "true");
  });

  test("a pointer move along the line costs at most one frame of script", async ({ page }) => {
    const line = node(page, SMALL.map).locator('.tilie-block svg line[data-id="melody"]');
    const box = await line.boundingBox();
    if (box === null) throw new Error("melody's line is not displayed");
    const y = box.y + box.height / 2;
    const at = (n: number) => box.x + 2 + ((box.width - 4) * n) / (FLAG_MOVES - 1);
    await page.mouse.move(at(0), y);
    const flag = page.getByTestId("coordinate-flag");
    await expect(flag.locator('[data-map="pieces"]')).toHaveCount(1);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    const ms = await perMove(
      page,
      cdp,
      async () => {
        for (let n = 0; n < FLAG_MOVES; n += 1) {
          await page.mouse.move(at(n), y);
          await frames(page);
        }
      },
      FLAG_MOVES,
    );
    console.log(`coordinate flag: ${ms.toFixed(3)} ms of script per pointer move`);
    await expect(flag.locator('[data-map="pieces"]')).toHaveCount(1);
    expect(ms).toBeLessThanOrEqual(FRAME_MS);
  });
});

/**
 * The `style` hiding (`display: "none"`) or showing again (`null`) the root
 * `root` of `block`, as Delete's "Hide instead" and the bundle's Timelines
 * list write it: its card, its line and each of its bands.
 */
function rootDisplay(block: string, root: string, display: "none" | null) {
  return {
    type: "style",
    select: {
      addresses: [
        { id: root, part: ["card"] },
        { id: root },
        ...FACETS.map((facet) => ({ id: root, facet })),
      ],
    },
    set: { display },
    blocks: [block],
  };
}

/** The virtual timelines of TimeToShare's fixture `flow/virtual_cards`, in its order. */
const VIRTUALS = ["allegro_by_hand", "allegro_default", "allegro_single"] as const;

/**
 * Import `flow/virtual_cards` twice, place the cards of its three virtual
 * timelines in both blocks, switch the second block's root card to
 * "Allegro, practice", hide that root and show it again; the blocks' IDs,
 * in import order.
 */
async function virtualCardsWorkspace(page: Page): Promise<string[]> {
  await withoutPickers(page);
  await page.goto("/");
  await page.waitForFunction(() => window.__tilie !== undefined);
  const text = manifestFixture("flow/virtual_cards");
  for (const imports of [1, 2]) {
    await pick(page, "Import manifest…", "virtual_cards.yaml", text);
    await expect.poll(() => journalLength(page)).toBe(imports);
  }
  const blocks = await page.evaluate(() => Object.keys(window.__tilie.store().view.blocks));
  expect(blocks).toHaveLength(2);
  for (const block of blocks) {
    const changes = VIRTUALS.map((id, k) => ({
      target: { block, id },
      values: { place: { x: 0, y: 300 + 150 * k } },
    }));
    expect(await dispatch(page, { type: "set", changes })).toBeNull();
  }
  const second = blocks[1] as string;
  expect(
    await dispatch(page, {
      type: "style",
      select: { addresses: [{ id: "allegro", part: ["card"] }] },
      set: { flow: "allegro_by_hand" },
      blocks: [second],
    }),
  ).toBeNull();
  expect(await dispatch(page, rootDisplay(second, "allegro", "none"))).toBeNull();
  expect(await dispatch(page, rootDisplay(second, "allegro", null))).toBeNull();
  await expect.poll(() => journalLength(page)).toBe(7);
  await setViewport(page, { x: 20, y: 20, zoom: 0.5 });
  return blocks;
}

/** The pointer moves over the drawn blocks: a grid of 12 × 5 points inside each node's box on screen. */
async function pointsOver(page: Page, blocks: readonly string[]) {
  const size = page.viewportSize();
  if (size === null) throw new Error("the page has no viewport size");
  const points: { x: number; y: number }[] = [];
  for (const block of blocks) {
    const box = await node(page, block).boundingBox();
    if (box === null) throw new Error(`block ${block} is not displayed`);
    for (let row = 0; row < 5; row += 1) {
      for (let column = 0; column < 12; column += 1) {
        const x = box.x + (box.width * (column + 0.5)) / 12;
        const y = box.y + (box.height * (row + 0.5)) / 5;
        if (x < size.width && y < size.height) points.push({ x, y });
      }
    }
  }
  return points;
}

test.describe("budgets on virtual cards imported twice", { tag: "@budget" }, () => {
  test.beforeEach(async ({ browserName }) => {
    test.skip(browserName !== "chromium", "script time is read through Chromium's protocol");
  });

  test("a pointer move over the blocks costs at most 1 ms of script", async ({ page }) => {
    const blocks = await virtualCardsWorkspace(page);
    const points = await pointsOver(page, blocks);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    const ms = await perMove(
      page,
      cdp,
      async () => {
        for (const point of points) {
          await page.mouse.move(point.x, point.y);
          await frames(page);
        }
      },
      points.length,
    );
    console.log(
      `virtual cards: ${ms.toFixed(3)} ms of script per pointer move (${points.length} moves)`,
    );
    // The moves reached the drawing: the label of a chunk draws its ribbon to the root's line.
    const first = blocks[0] as string;
    const label = await partCentre(page, first, {
      id: "allegro_default",
      facet: "regions",
      part: [0, "label"],
    });
    await page.mouse.move(label.x, label.y);
    await expect(node(page, first).locator("path.tilie-ribbon")).toHaveCount(1);
    expect(ms).toBeLessThanOrEqual(1);
  });

  test("Ctrl+wheel zoom costs at most 1 ms of script per wheel event", async ({ page }) => {
    const blocks = await virtualCardsWorkspace(page);
    const box = await node(page, blocks[0] as string).boundingBox();
    if (box === null) throw new Error("the first block is not displayed");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    await page.keyboard.down("Control");
    const ms = await perMove(page, cdp, async () => {
      for (let n = 0; n < MOVES; n += 1) {
        await page.mouse.wheel(0, n < MOVES / 2 ? -40 : 40);
        await frames(page);
      }
    });
    await page.keyboard.up("Control");
    console.log(`virtual cards: ${ms.toFixed(3)} ms of script per wheel event`);
    expect(ms).toBeLessThanOrEqual(1);
  });
});
