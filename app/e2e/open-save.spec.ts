/**
 * Open… with a manifest, and Save into the file a workspace was opened
 * from. Derivation in `README.md` ("open-save.spec.ts").
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { createStore, emptyWorkspace, writeWorkspace } from "../packages/core/src/index.ts";
import { manifestFixture } from "./schema.ts";
import { chooseItem, downloaded, journalLength, pick, withoutPickers } from "./support.ts";

const QUESTION = "Add bare.yaml to the open workspace, or open it in a new, empty workspace?";

function blockCount(page: Page): Promise<number> {
  return page.evaluate(() => Object.keys(window.__tilie.store().view.blocks).length);
}

test.describe("Open… with a manifest, without pickers", () => {
  test.beforeEach(async ({ page }) => {
    await withoutPickers(page);
    await page.goto("/");
    await page.waitForFunction(() => window.__tilie !== undefined);
  });

  test("imports into an empty workspace, then asks to add or to open anew", async ({ page }) => {
    const bare = manifestFixture("bare");
    await pick(page, "Open…", "bare.yaml", bare);
    await expect.poll(() => blockCount(page)).toBe(1);
    expect(await journalLength(page)).toBe(1);

    await pick(page, "Open…", "bare.yaml", bare);
    const dialog = page.getByRole("dialog", { name: QUESTION });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Add" }).click();
    await expect.poll(() => blockCount(page)).toBe(2);

    const unsaved = await page.evaluate(() => window.__tilie.text());
    const download = downloaded(page.waitForEvent("download"));
    await pick(page, "Open…", "bare.yaml", bare);
    await dialog.getByRole("button", { name: "New workspace" }).click();
    expect(await download).toEqual(["untitled.tle.json", unsaved]);
    await expect.poll(() => blockCount(page)).toBe(1);
    expect(await journalLength(page)).toBe(1);
  });
});

/**
 * Pickers in the page: the open picker hands over one in-page file handle
 * holding `text` (its writes recorded in `window.writes`), whose write
 * permission is `permission`; the save picker records its calls in
 * `window.saves` and hands over a handle recording into `window.picked`.
 */
async function withPickers(page: Page, text: string, permission: PermissionState): Promise<void> {
  await page.addInitScript(
    ([held, state]) => {
      const record = window as unknown as {
        writes: string[];
        picked: string[];
        saves: number;
      };
      record.writes = [];
      record.picked = [];
      record.saves = 0;
      const handle = (name: string, writes: string[], content: string) => ({
        kind: "file",
        name,
        getFile: async () => new File([content], name),
        queryPermission: async () => state,
        requestPermission: async () => state,
        createWritable: async () => ({
          write: async (data: string) => {
            writes.push(data);
          },
          close: async () => undefined,
        }),
      });
      Object.assign(window, {
        showOpenFilePicker: async () => [handle("w.tle.json", record.writes, held)],
        showSaveFilePicker: async () => {
          record.saves += 1;
          return { ...handle("other.tle.json", record.picked, ""), queryPermission: undefined };
        },
      });
    },
    [text, permission] as const,
  );
}

/** What the in-page pickers recorded: writes into the opened file, save picker calls, writes into the picked one. */
function recorded(page: Page): Promise<[string[], number, string[]]> {
  return page.evaluate(() => {
    const record = window as unknown as { writes: string[]; picked: string[]; saves: number };
    return [record.writes, record.saves, record.picked];
  });
}

/** The text of a new, empty workspace, the opened file's. */
const EMPTY = writeWorkspace(createStore(emptyWorkspace()).snapshot());

/**
 * A new page whose pickers are in-page, the workspace opened from the
 * opened file and renamed (one command), so it holds unsaved changes.
 */
async function openFromHandle(page: Page, permission: PermissionState): Promise<void> {
  await withPickers(page, EMPTY, permission);
  await page.goto("/");
  await page.waitForFunction(() => window.__tilie !== undefined);
  await chooseItem(page, "Open…");
  await expect(page.getByTestId("file-name")).toHaveText("w.tle.json");
  const refusal = await page.evaluate(() =>
    window.__tilie
      .store()
      .dispatch({ type: "set", changes: [{ target: {}, values: { name: "Eroica" } }] }),
  );
  expect(refusal).toBe(null);
  await expect(page.getByTestId("file-name")).toHaveText("• w.tle.json");
}

test.describe("Save into the opened file", () => {
  test("Ctrl+S writes into the file it was opened from", async ({ page }) => {
    await openFromHandle(page, "granted");
    const text = await page.evaluate(() => window.__tilie.text());
    await page.keyboard.press("ControlOrMeta+s");
    await expect.poll(() => recorded(page)).toEqual([[text], 0, []]);
    await expect(page.getByTestId("file-name")).toHaveText("w.tle.json");
  });

  test("Ctrl+S picks a file where the browser refuses writing", async ({ page }) => {
    await openFromHandle(page, "denied");
    const text = await page.evaluate(() => window.__tilie.text());
    await page.keyboard.press("ControlOrMeta+s");
    await expect.poll(() => recorded(page)).toEqual([[], 1, [text]]);
    await expect(page.getByTestId("file-name")).toHaveText("other.tle.json");
  });
});
