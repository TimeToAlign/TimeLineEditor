/**
 * Open… with a manifest, Save into the file a workspace was opened from, a
 * renamed workspace's Save, and opening and saving through the server's
 * files: Save as… and Save by path, and the accessibility of the file
 * dialog and of the workspace's title. Derivation in `README.md`
 * ("open-save.spec.ts").
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { createStore, emptyWorkspace, writeWorkspace } from "../packages/core/src/index.ts";
import { manifestFixture, packageDir, SCHEMA_VERSION } from "./schema.ts";
import {
  chooseItem,
  dispatch,
  downloaded,
  journalLength,
  pick,
  withoutPickers,
} from "./support.ts";

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

/** The workspace's rules: one rule, a change that is no rename. */
const STYLED = { rules: [{ select: { element: "timeline" }, set: { stroke: "#0000FF" } }] };

/**
 * A new page whose pickers are in-page, the workspace opened from the
 * opened file and given rules of its own (one command), so it holds
 * unsaved changes.
 */
async function openFromHandle(page: Page, permission: PermissionState): Promise<void> {
  await withPickers(page, EMPTY, permission);
  await page.goto("/");
  await page.waitForFunction(() => window.__tilie !== undefined);
  await chooseItem(page, "Open…");
  await expect(page).toHaveTitle("w.tle.json – TimeLineEditor");
  const refusal = await page.evaluate(
    (graphical) =>
      window.__tilie
        .store()
        .dispatch({ type: "set", changes: [{ target: {}, values: { graphical } }] }),
    STYLED,
  );
  expect(refusal).toBe(null);
  await expect(page).toHaveTitle("• w.tle.json – TimeLineEditor");
}

test.describe("Save into the opened file", () => {
  test("Ctrl+S writes into the file it was opened from", async ({ page }) => {
    await openFromHandle(page, "granted");
    const text = await page.evaluate(() => window.__tilie.text());
    await page.keyboard.press("ControlOrMeta+s");
    await expect.poll(() => recorded(page)).toEqual([[text], 0, []]);
    await expect(page).toHaveTitle("w.tle.json – TimeLineEditor");
  });

  test("Ctrl+S picks a file where the browser refuses writing", async ({ page }) => {
    await openFromHandle(page, "denied");
    const text = await page.evaluate(() => window.__tilie.text());
    await page.keyboard.press("ControlOrMeta+s");
    await expect.poll(() => recorded(page)).toEqual([[], 1, [text]]);
    await expect(page).toHaveTitle("other.tle.json – TimeLineEditor");
  });

  test("Ctrl+S after a rename in the header picks a file", async ({ page }) => {
    await openFromHandle(page, "granted");
    await page.getByTestId("file-name").click();
    const field = page.getByRole("textbox", { name: "Workspace name" });
    await expect(field).toBeFocused();
    await field.fill("Variations");
    await field.press("Enter");
    await expect(page.getByTestId("file-name")).toHaveText("• Variations");
    await page.keyboard.press("ControlOrMeta+s");
    await expect
      .poll(() => recorded(page))
      .toEqual([[], 1, [await page.evaluate(() => window.__tilie.text())]]);
    await expect(page).toHaveTitle("other.tle.json – TimeLineEditor");
  });
});

/** The table fixture's manifest named LayerIt, naming its table as the story's steps do. */
const TABLES = path.join(packageDir, "fixtures", "tables", SCHEMA_VERSION);
const PARQUET = readFileSync(path.join(TABLES, "match_claims.parquet"));
const ANSWER = readFileSync(
  path.join(import.meta.dirname, "../packages/client/tests/data/match-claims.answer.bin"),
);
const STEP = manifestFixtureText().replace(
  "url: match_claims.parquet",
  "url: step1.match_claims.parquet",
);

function manifestFixtureText(): string {
  return readFileSync(
    path.join(packageDir, "fixtures", "tables", SCHEMA_VERSION, "manifest.yaml"),
    "utf8",
  ).replace(/^timelines:/m, "name: LayerIt\ntimelines:");
}

/**
 * A server answering its health and serving files from memory: the folder
 * `story` holding `step1.yaml`, the folder `work`; every write recorded.
 */
async function withServerFiles(
  page: Page,
): Promise<{ writes: [string, string][]; reads: string[]; tables: number[] }> {
  const files = new Map<string, string | Buffer>([
    ["story/step1.yaml", STEP],
    ["story/step1.match_claims.parquet", PARQUET],
  ]);
  const reads: string[] = [];
  const tables: number[] = [];
  await page.route("**/api/match-claims", (route) => {
    tables.push(route.request().postDataBuffer()?.length ?? 0);
    return route.fulfill({ body: ANSWER, contentType: "application/octet-stream" });
  });
  const folders: { [path: string]: string[] } = { "": ["story", "work"], story: [], work: [] };
  const writes: [string, string][] = [];
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { name: "tilie-server", version: "0.1.0", timetoalign: "1.2.0" } }),
  );
  await page.route("**/api/folders?*", (route) => {
    const at = new URL(route.request().url()).searchParams.get("path") ?? "";
    const names = folders[at];
    if (names === undefined) {
      return route.fulfill({ status: 404, json: { detail: "no such folder" } });
    }
    const prefix = at === "" ? "" : `${at}/`;
    const held = [...files.keys()].filter(
      (file) => file.startsWith(prefix) && !file.slice(prefix.length).includes("/"),
    );
    const entries = [
      ...names.map((name) => ({ name, kind: "folder" })),
      ...held.map((file) => ({ name: file.slice(prefix.length), kind: "file" })),
    ];
    return route.fulfill({ json: { path: at, entries } });
  });
  await page.route("**/api/files?*", (route) => {
    const at = new URL(route.request().url()).searchParams.get("path") ?? "";
    if (route.request().method() === "PUT") {
      const text = route.request().postData() ?? "";
      writes.push([at, text]);
      files.set(at, text);
      return route.fulfill({ json: { path: at, size: Buffer.byteLength(text) } });
    }
    reads.push(at);
    const found = files.get(at);
    return found === undefined
      ? route.fulfill({ status: 404, json: { detail: "no such file" } })
      : route.fulfill({ body: found, contentType: "application/octet-stream" });
  });
  return { writes, reads, tables };
}

test.describe("Through the server's files", () => {
  test("imports and saves by path, keeping where the manifest lies, and a rename saves as", async ({
    page,
  }) => {
    const { writes } = await withServerFiles(page);
    await page.goto("/");
    await page.waitForFunction(() => window.__tilie?.health() !== null);

    await chooseItem(page, "Import manifest…");
    const open = page.getByRole("dialog", { name: "Open" });
    const list = open.getByRole("listbox", { name: "Contents of the root folder" });
    await expect(list).toBeFocused();
    await expect(list.getByRole("option")).toHaveText(["story/", "work/"]);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    const story = open.getByRole("listbox", { name: "Contents of story" });
    await expect(story.getByRole("option")).toHaveText(["step1.yaml"]);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect.poll(() => blockCount(page)).toBe(1);
    const [block] = await page.evaluate(() => Object.keys(window.__tilie.store().view.blocks));

    await page.keyboard.press("ControlOrMeta+s");
    const save = page.getByRole("dialog", { name: "Save as" });
    await expect(save.getByRole("textbox", { name: "File name" })).toHaveValue("untitled.tle.json");
    await save.getByRole("button", { name: "Root" }).click();
    await save.getByRole("option", { name: "work/" }).dblclick();
    await expect(save.getByRole("listbox", { name: "Contents of work" })).toBeVisible();
    await save.getByRole("textbox", { name: "File name" }).fill("layerit");
    await save.getByRole("button", { name: "Save" }).click();
    await expect.poll(() => writes.map(([at]) => at)).toEqual(["work/layerit.tle.json"]);
    const [[, text] = ["", ""]] = writes;
    expect(JSON.parse(text).settings.manifests[block ?? ""].location).toBe("../story/step1.yaml");
    await expect(page).toHaveTitle("layerit.tle.json – TimeLineEditor");

    await page.getByTestId("file-name").click();
    await page.getByRole("textbox", { name: "Workspace name" }).fill("LayerIt");
    await page.keyboard.press("ControlOrMeta+s");
    const again = page.getByRole("dialog", { name: "Save as" });
    await expect(again.getByRole("textbox", { name: "File name" })).toHaveValue("LayerIt.tle.json");
    await again.getByRole("button", { name: "Cancel" }).click();
    expect(writes.length).toBe(1);
  });

  test("loads the table beside a saved workspace's manifest on Show matches, asking nothing", async ({
    page,
  }) => {
    const { writes, reads, tables } = await withServerFiles(page);
    await page.goto("/");
    await page.waitForFunction(() => window.__tilie?.health() !== null);
    await chooseItem(page, "Import manifest…");
    const open = page.getByRole("dialog", { name: "Open" });
    await open.getByRole("option", { name: "story/" }).dblclick();
    await open.getByRole("option", { name: "step1.yaml" }).dblclick();
    await expect.poll(() => blockCount(page)).toBe(1);
    await page.keyboard.press("ControlOrMeta+s");
    const save = page.getByRole("dialog", { name: "Save as" });
    await save.getByRole("textbox", { name: "File name" }).fill("layerit");
    await save.getByRole("button", { name: "Save" }).click();
    await expect.poll(() => writes.length).toBe(1);

    await page.reload();
    await page.waitForFunction(() => window.__tilie?.health() !== null);
    await chooseItem(page, "Open…");
    const reopen = page.getByRole("dialog", { name: "Open" });
    await reopen.getByRole("option", { name: "story/" }).dblclick();
    await reopen.getByRole("option", { name: "layerit.tle.json" }).dblclick();
    await expect(page).toHaveTitle("layerit.tle.json – TimeLineEditor");
    reads.length = 0;
    await page.getByTestId("matches").click();
    await expect.poll(() => tables.length).toBe(1);
    expect(reads).toEqual(["story/step1.match_claims.parquet"]);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("Save as… writes the chosen path, the title following; Save writes there again without asking", async ({
    page,
  }) => {
    const { writes } = await withServerFiles(page);
    await page.goto("/");
    await page.waitForFunction(() => window.__tilie?.health() !== null);
    await chooseItem(page, "Import manifest…");
    const open = page.getByRole("dialog", { name: "Open" });
    await open.getByRole("option", { name: "story/" }).dblclick();
    await open.getByRole("option", { name: "step1.yaml" }).dblclick();
    await expect.poll(() => blockCount(page)).toBe(1);
    const [block = ""] = await page.evaluate(() => Object.keys(window.__tilie.store().view.blocks));
    const text = () => page.evaluate(() => window.__tilie.text());
    const style = async (stroke: string) => {
      const rules = [{ select: { element: "timeline" }, set: { stroke } }];
      expect(
        await dispatch(page, {
          type: "set",
          changes: [{ target: {}, values: { graphical: { rules } } }],
        }),
      ).toBeNull();
    };
    const save = page.getByRole("dialog", { name: "Save as" });
    const fileName = save.getByRole("textbox", { name: "File name" });
    const saveItem = async () => {
      await page.getByRole("button", { name: "File" }).click();
      await page.getByRole("menuitem", { name: /^Save(?! as)/u }).click();
    };

    // Save as…: the dialog starts in the folder of the last file chosen.
    await chooseItem(page, "Save as…");
    await expect(save.getByRole("listbox", { name: "Contents of story" })).toBeVisible();
    await expect(fileName).toHaveValue("untitled.tle.json");
    await fileName.fill("first");
    await save.getByRole("button", { name: "Save" }).click();
    await expect.poll(() => writes.map(([at]) => at)).toEqual(["story/first.tle.json"]);
    expect(writes[0]?.[1]).toBe(await text());
    expect(JSON.parse(writes[0]?.[1] ?? "").settings.manifests[block].location).toBe("step1.yaml");
    await expect(page).toHaveTitle("first.tle.json – TimeLineEditor");

    // Save writes the same path again, asking nothing.
    await style("#0000FF");
    await expect(page).toHaveTitle("• first.tle.json – TimeLineEditor");
    await saveItem();
    await expect.poll(() => writes.length).toBe(2);
    expect(writes[1]).toEqual(["story/first.tle.json", await text()]);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveTitle("first.tle.json – TimeLineEditor");

    // Save as… onto the same file asks once whether to replace it; Save then asks nothing.
    await style("#FF0000");
    await chooseItem(page, "Save as…");
    await expect(fileName).toHaveValue("first.tle.json");
    await save.getByRole("button", { name: "Save" }).click();
    const replace = page.getByRole("dialog", { name: "Replace first.tle.json?" });
    await replace.getByRole("button", { name: "Replace" }).click();
    await expect.poll(() => writes.length).toBe(3);
    expect(writes[2]).toEqual(["story/first.tle.json", await text()]);
    await style("#00FF00");
    await saveItem();
    await expect.poll(() => writes.length).toBe(4);
    expect(writes[3]).toEqual(["story/first.tle.json", await text()]);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Renamed, Save opens Save as under the new name; saved, the title follows.
    await page.getByTestId("file-name").click();
    const field = page.getByRole("textbox", { name: "Workspace name" });
    await field.fill("Second");
    await field.press("Enter");
    await expect(page).toHaveTitle("• first.tle.json – TimeLineEditor");
    await saveItem();
    await expect(fileName).toHaveValue("Second.tle.json");
    expect(writes.length).toBe(4);
    await save.getByRole("button", { name: "Save" }).click();
    await expect.poll(() => writes.length).toBe(5);
    expect(writes[4]).toEqual(["story/Second.tle.json", await text()]);
    await expect(page).toHaveTitle("Second.tle.json – TimeLineEditor");
  });

  test("axe-core reports no violation in the file dialog opening a file", async ({ page }) => {
    await openServerPage(page);
    await chooseItem(page, "Import manifest…");
    const open = page.getByRole("dialog", { name: "Open" });
    await expect(open.getByRole("listbox", { name: "Contents of the root folder" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(open.getByRole("option", { name: "story/" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await violations(page)).toEqual([]);
    await page.keyboard.press("Enter");
    await expect(open.getByRole("option", { name: "step1.yaml" })).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test("axe-core reports no violation in the file dialog saving, with a refused name", async ({
    page,
  }) => {
    await openServerPage(page);
    await chooseItem(page, "Save as…");
    const save = page.getByRole("dialog", { name: "Save as" });
    await expect(save.getByRole("option", { name: "work/" })).toBeVisible();
    await save.getByRole("textbox", { name: "File name" }).fill("a/b");
    await save.getByRole("button", { name: "Save" }).click();
    await expect(save.getByText("A file name holds no /.")).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test("shows its note in the place of the empty list, and axe-core reports no violation there", async ({
    page,
  }) => {
    await openServerPage(page);
    await chooseItem(page, "Save as…");
    const save = page.getByRole("dialog", { name: "Save as" });
    await save.getByRole("option", { name: "story/" }).dblclick();
    const list = save.getByRole("listbox", { name: "Contents of story" });
    await expect(list).toBeVisible();
    await expect(save.getByRole("option")).toHaveCount(0);
    const note = save.getByRole("status");
    await expect(note).toHaveText("Nothing to show here.");
    const [listBox, noteBox] = await Promise.all([list.boundingBox(), note.boundingBox()]);
    if (listBox === null || noteBox === null) throw new Error("the list or its note is not drawn");
    // Where the first entry would stand: 1 px inside the list's border, its own box within the list's.
    expect([
      noteBox.x - listBox.x,
      noteBox.y - listBox.y,
      noteBox.x + noteBox.width <= listBox.x + listBox.width,
      noteBox.y + noteBox.height <= listBox.y + listBox.height,
    ]).toEqual([1, 1, true, true]);
    expect(await violations(page)).toEqual([]);
  });

  test("axe-core reports no violation in the Replace question", async ({ page }) => {
    await openServerPage(page);
    await chooseItem(page, "Save as…");
    const save = page.getByRole("dialog", { name: "Save as" });
    await save.getByRole("textbox", { name: "File name" }).fill("first");
    await save.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveTitle("first.tle.json – TimeLineEditor");
    await chooseItem(page, "Save as…");
    await save.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog", { name: "Replace first.tle.json?" })).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test("axe-core reports no violation in the tables dialog asking where a missing table lies", async ({
    page,
  }) => {
    await withServerFiles(page);
    await page.route("**/api/files?*", (route) =>
      new URL(route.request().url()).searchParams.get("path") === "story/step1.match_claims.parquet"
        ? route.fulfill({ status: 404, json: { detail: "no such file" } })
        : route.fallback(),
    );
    await page.goto("/");
    await page.waitForFunction(() => window.__tilie?.health() !== null);
    await chooseItem(page, "Import manifest…");
    const open = page.getByRole("dialog", { name: "Open" });
    await open.getByRole("option", { name: "story/" }).dblclick();
    await open.getByRole("option", { name: "step1.yaml" }).dblclick();
    await expect.poll(() => blockCount(page)).toBe(1);
    await page.getByTestId("matches").click();
    const dialog = page.getByRole("dialog", {
      name: /^step1\.match_claims\.parquet is not beside/u,
    });
    await expect(dialog.getByRole("button", { name: "Locate…" })).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test("axe-core reports no violation on the workspace's title, renamed and refusing a name", async ({
    page,
  }) => {
    await openServerPage(page);
    await chooseItem(page, "Save as…");
    const save = page.getByRole("dialog", { name: "Save as" });
    await save.getByRole("textbox", { name: "File name" }).fill("first");
    await save.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveTitle("first.tle.json – TimeLineEditor");
    await page.getByTestId("file-name").click();
    const field = page.getByRole("textbox", { name: "Workspace name" });
    await field.fill("Second");
    await field.press("Enter");
    await expect(page.getByTestId("file-name")).toHaveText("• Second");
    await expect(page.getByText("— first.tle.json", { exact: true })).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page.getByTestId("file-name").click();
    await field.fill("");
    await field.press("Enter");
    await expect(field).toHaveAttribute("aria-invalid", "true");
    expect(await violations(page)).toEqual([]);
  });
});

/** A new page whose server answers its health and serves `withServerFiles`' files. */
async function openServerPage(page: Page): Promise<void> {
  await withServerFiles(page);
  await page.goto("/");
  await page.waitForFunction(() => window.__tilie?.health() !== null);
}

/** axe-core's violations on the whole page. */
async function violations(page: Page): Promise<unknown[]> {
  return (await new AxeBuilder({ page }).analyze()).violations;
}
