/**
 * Screenshots of `small` (each block's node and the whole canvas) and of the
 * canvas with `groups` at a fixed viewport, compared with zero differing pixels. They run only in the pinned
 * Playwright container, where their baselines are made.
 * Derivation in `README.md` ("visual.spec.ts").
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
  DRAWING_FACE,
  frames,
  node,
  open,
  pane,
  SMALL_ORDER,
  setViewport,
  textsNotInFace,
} from "./support.ts";

test.use({ viewport: { width: 1600, height: 1000 } });

/** The face the canvas declares for drawn text: the bundled DejaVu Sans. */
const FACE = `12px "${DRAWING_FACE}"`;

/**
 * Wait until the drawing font is loaded and laid out: `document.fonts.load`
 * starts the load if no text has asked for the face yet (a bare
 * `document.fonts.ready` resolves early then), `check` confirms the face is
 * usable, and two frames let the text be laid out and painted with it.
 */
async function fontsSettled(page: Page): Promise<void> {
  await page.evaluate(async (face) => {
    await document.fonts.load(face, "Flow control ♩");
    await document.fonts.ready;
    if (!document.fonts.check(face, "Flow control ♩")) throw new Error(`${face} is not loaded`);
  }, FACE);
  await frames(page);
}

const SHOT = { maxDiffPixels: 0, animations: "disabled", caret: "hide" } as const;

test.describe("screenshots of small", { tag: "@visual" }, () => {
  test.beforeEach(async ({ page, browserName }) => {
    await open(page, "small");
    await setViewport(page, { x: 40, y: 40, zoom: 1 });
    await fontsSettled(page);
    expect(await textsNotInFace(page, browserName)).toEqual([]);
  });

  for (const id of SMALL_ORDER) {
    test(`block ${id}`, async ({ page }) => {
      await expect(node(page, id)).toHaveScreenshot(`${id}.png`, SHOT);
    });
  }

  test("the whole canvas", async ({ page }) => {
    await expect(pane(page)).toHaveScreenshot("canvas.png", SHOT);
  });
});

test.describe("screenshot of groups", { tag: "@visual" }, () => {
  test("groups", async ({ page, browserName }) => {
    await open(page, "groups");
    await setViewport(page, { x: 40, y: 40, zoom: 1 });
    await fontsSettled(page);
    expect(await textsNotInFace(page, browserName)).toEqual([]);
    await expect(pane(page)).toHaveScreenshot("groups.png", SHOT);
  });
});
