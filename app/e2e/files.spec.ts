/**
 * Files through the File menu and the page's keys, on the fallback path
 * every engine offers (the file chooser and the download), and the About
 * pane. Derivation in `README.md` ("files.spec.ts").
 */

import { expect, test } from "@playwright/test";
import { manifestFixture } from "./schema.ts";
import {
  arranger,
  chooseItem,
  downloaded,
  dragBlock,
  fixtureText,
  frames,
  journalLength,
  OPENED_JOURNAL,
  pick,
  placement,
  selection,
  setViewport,
  viewportOf,
  withoutPickers,
} from "./support.ts";

test.beforeEach(async ({ page }) => {
  await withoutPickers(page);
  await page.goto("/");
  await page.waitForFunction(() => window.__tilie !== undefined);
});

test("a workspace survives save, reopen and save byte for byte", async ({ page }) => {
  await chooseItem(page, "New workspace");
  expect(await journalLength(page)).toBe(0);
  const size = await arranger(page).evaluate((element) => [
    element.clientWidth,
    element.clientHeight,
  ]);
  expect(size).toEqual([1280, 768]);
  await setViewport(page, { x: 100, y: 50, zoom: 1 });

  const bare = manifestFixture("bare");
  await pick(page, "Import manifest…", "bare.json", bare);
  await expect.poll(() => journalLength(page)).toBe(1);
  const [selected] = await selection(page);
  if (selected?.block === undefined || selected.id !== undefined) {
    throw new Error("the imported block is not selected");
  }
  const id = selected.block;
  expect(await placement(page, id)).toMatchObject({ x: 544, y: 336, scale: 1, length: 400 });
  // An import never moves the view.
  await frames(page);
  expect(await viewportOf(page)).toEqual({ x: 100, y: 50, zoom: 1 });

  await dragBlock(page, id, 40, 24);
  await expect.poll(() => journalLength(page)).toBe(2);
  expect(await placement(page, id)).toMatchObject({ x: 584, y: 360 });

  await page.locator('[data-testid="mode-stretch"]').click();
  const grip = await page.locator('[data-testid="handle-right"]').boundingBox();
  if (grip === null) throw new Error("handle right is not displayed");
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 20, grip.y + grip.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => journalLength(page)).toBe(3);
  expect(await placement(page, id)).toMatchObject({ x: 584, y: 360, length: 420, spacing: 8 });

  await expect(page.getByTestId("file-name")).toHaveText("• untitled.tle.json");
  const first = downloaded(page.waitForEvent("download"));
  await page.keyboard.press("ControlOrMeta+s");
  const [firstName, firstText] = await first;
  expect(firstName).toBe("untitled.tle.json");
  expect(firstText).toBe(await page.evaluate(() => window.__tilie.text()));
  await expect(page.getByTestId("file-name")).toHaveText("untitled.tle.json");

  expect(await selection(page)).toEqual([{ block: id }]);
  await pick(page, "Open…", "untitled.tle.json", firstText);
  // Opening a file clears the selection, which addressed the previous workspace.
  await expect.poll(() => selection(page)).toEqual([]);
  expect(await journalLength(page)).toBe(3);
  expect(await page.evaluate(() => window.__tilie.text())).toBe(firstText);

  const second = downloaded(page.waitForEvent("download"));
  await page.keyboard.press("ControlOrMeta+s");
  expect(await second).toEqual(["untitled.tle.json", firstText]);
});

test("an opened workspace is fitted; an import into it leaves the view", async ({ page }) => {
  await page.evaluate((text) => window.__tilie.load(text), fixtureText("small"));
  await expect.poll(() => journalLength(page)).toBe(OPENED_JOURNAL.small);
  // Svelte Flow fits once the nodes are measured: every block then lies inside the pane.
  const inside = () =>
    page.evaluate(() => {
      const pane = document.querySelector(".svelte-flow")?.getBoundingClientRect();
      const nodes = [...document.querySelectorAll(".svelte-flow__node")];
      if (pane === undefined || nodes.length !== 5) return false;
      return nodes.every((node) => {
        const box = node.getBoundingClientRect();
        return (
          box.left >= pane.left &&
          box.top >= pane.top &&
          box.right <= pane.right &&
          box.bottom <= pane.bottom
        );
      });
    });
  await expect.poll(inside).toBe(true);
  await frames(page);
  const fitted = await viewportOf(page);

  const bare = manifestFixture("bare");
  await pick(page, "Import manifest…", "bare.json", bare);
  await expect.poll(() => journalLength(page)).toBe(OPENED_JOURNAL.small + 1);
  await frames(page);
  expect(await viewportOf(page)).toEqual(fitted);
});

test("a refused workspace file is shown and leaves the open workspace", async ({ page }) => {
  await pick(page, "Open…", "broken.tle.json", "{");
  const message = page.getByTestId("message");
  await expect(message).toHaveCount(1);
  await expect(message).toContainText("broken.tle.json is not a workspace file");
  await expect(message.locator("li code").first()).toHaveText("invalid_json");
  expect(await journalLength(page)).toBe(0);
  await message.getByRole("button", { name: "Dismiss" }).click();
  await expect(message).toHaveCount(0);
});

test("the About pane names the editor, the packages and the offline server", async ({ page }) => {
  await page.getByRole("button", { name: "About" }).click();
  const dialog = page.getByRole("dialog", { name: "About TimeLineEditor" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("about-packages").locator("li")).toHaveText([
    "@timetoalign/tilie-core",
    "@timetoalign/tilie-layout",
    "@timetoalign/tilie-writers",
    "@timetoalign/tilie-arranger",
    "@timetoalign/tilie-client",
  ]);
  await expect(dialog.getByTestId("about-server")).toContainText(
    "offline: The server did not answer the health check (",
  );
  const href = await dialog
    .getByRole("link", { name: "THIRD_PARTY_NOTICES.txt" })
    .getAttribute("href");
  const notices = await page.request.get(new URL(href ?? "", page.url()).href);
  expect(notices.status()).toBe(200);
  expect((await notices.text()).startsWith("TimeLineEditor: third-party notices\n")).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
