/**
 * Type profiles as application settings: a profile file imported in the
 * "Type profiles" dialogue orders the composer's verbs once its "is a" is
 * stated, is exported back byte for byte, and outlives a reload. Every
 * request to Wikidata, lobid, YouTube or Wikimedia Commons is answered from
 * the editor's recorded lookups, any other aborted. Derivation in
 * `README.md` ("profiles.spec.ts").
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { statementsFixture } from "./schema.ts";
import { chooseItem, downloaded, pick, select, tab, withoutPickers } from "./support.ts";

const RECORDED = path.join(import.meta.dirname, "../packages/editor/tests/lookup");
const LOOKUP_HOSTS =
  /^https:\/\/(www\.wikidata\.org|lobid\.org|www\.youtube\.com|commons\.wikimedia\.org)\//u;
const INDEX: Readonly<Record<string, string>> = JSON.parse(
  readFileSync(path.join(RECORDED, "index.json"), "utf8"),
);

/** The profile file, in canonical YAML, written by hand. */
const PROFILES = [
  "profiles:",
  "  -",
  "    id: lecture_recording",
  "    is_a:",
  "      fallback:",
  "        -",
  "          pattern:",
  '            type: ["schema:AudioObject"]',
  '    label: "lecture recording"',
  "    lookup: [wikidata]",
  "    verbs: [performed_by, recorded_at_on]",
  "services: []",
  "",
].join("\n");

let block = "";

test.beforeEach(async ({ page }) => {
  await withoutPickers(page);
  await page.route(LOOKUP_HOSTS, async (route) => {
    const file = INDEX[route.request().url()];
    if (route.request().method() !== "GET" || file === undefined) {
      await route.abort();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: readFileSync(path.join(RECORDED, file), "utf8"),
    });
  });
  await page.goto("/");
  await page.waitForFunction(() => window.__tilie !== undefined);
  await pick(
    page,
    "Import manifest…",
    "layerit_recording.yaml",
    statementsFixture("layerit_recording"),
  );
  await expect
    .poll(() => page.evaluate(() => Object.keys(window.__tilie.store().view.blocks).length))
    .toBe(1);
  block = await page.evaluate(() => Object.keys(window.__tilie.store().view.blocks)[0] ?? "");
});

/** The open "Type profiles" dialogue. */
async function profilesDialog(page: Page): Promise<Locator> {
  await chooseItem(page, "Type profiles…");
  const dialog = page.getByRole("dialog", { name: "Type profiles" });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** A composer field by its label. */
function field(page: Page, name: "Verb" | "Vocabulary" | "Value"): Locator {
  return page.getByTestId("metadata-composer").getByRole("combobox", { name, exact: true });
}

/** Type `text` into a composer field and pick the first option. */
async function choose(page: Page, name: "Verb" | "Vocabulary" | "Value", text: string) {
  await field(page, name).fill(text);
  await field(page, name).press("ArrowDown");
  await field(page, name).press("Enter");
}

test("an imported profile orders the verbs, exports byte for byte and outlives a reload", async ({
  page,
}) => {
  const imported = await profilesDialog(page);
  const chooser = page.waitForEvent("filechooser");
  await imported.getByRole("button", { name: "Import YAML…" }).click();
  await (await chooser).setFiles({
    name: "lecture.yaml",
    mimeType: "application/yaml",
    buffer: Buffer.from(PROFILES),
  });
  await expect(imported.getByRole("textbox", { name: "ID" }).first()).toHaveValue(
    "lecture_recording",
  );
  await imported.getByRole("button", { name: "Save" }).click();
  await expect(imported).toBeHidden();

  await select(page, [{ block, id: "cpt_2" }]);
  const open = page.getByRole("button", { name: "Open inspector" });
  if (await open.isVisible()) await open.click();
  await tab(page, "Metadata").click();
  await page.getByRole("button", { name: "State what it is" }).click();
  await choose(page, "Vocabulary", "Other");
  await expect(field(page, "Vocabulary")).toHaveValue("Other vocabularies");
  await choose(page, "Value", "lecture");
  await expect(field(page, "Value")).toHaveValue("lecture recording");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const isA = page.getByTestId("metadata-rectangle").first();
  await expect(isA.getByTestId("metadata-vocabulary").locator("li")).toHaveText([
    "type schema:AudioObject ↗",
  ]);

  await page.getByRole("button", { name: "＋ Add statement" }).click();
  await expect(field(page, "Verb")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const options = page.getByRole("listbox", { name: "Verb" }).getByRole("option");
  await expect(options.nth(2)).toBeVisible();
  expect((await options.allTextContents()).slice(0, 3).map((text) => text.trim())).toEqual([
    "is a",
    "performed by",
    "recorded at, recorded on",
  ]);
  await page.keyboard.press("Escape");
  await choose(page, "Verb", "performed");
  await expect(field(page, "Verb")).toHaveValue("performed by");
  await field(page, "Vocabulary").focus();
  await page.keyboard.press("ArrowDown");
  const vocabularies = page.getByRole("listbox", { name: "Vocabulary" }).getByRole("option");
  await expect(vocabularies.first()).toBeVisible();
  expect((await vocabularies.allTextContents()).map((text) => text.trim())).toEqual([
    "Wikidata",
    "MusicBrainz",
    "GND",
    "MeLODy / LRMoo",
    "Other vocabularies",
    "An element of this manifest",
  ]);
  await page.keyboard.press("Escape");
  await page.getByTestId("metadata-composer").getByRole("button", { name: "Cancel" }).click();

  const exporting = await profilesDialog(page);
  const download = downloaded(page.waitForEvent("download"));
  await exporting.getByRole("button", { name: "Export YAML…" }).click();
  const [name, text] = await download;
  expect(name).toBe("profiles.yaml");
  expect(text).toBe(PROFILES);
  await exporting.getByRole("button", { name: "Cancel" }).click();

  await page.reload();
  await page.waitForFunction(() => window.__tilie !== undefined);
  expect(await page.evaluate(() => localStorage.getItem("tilie.profiles"))).toBe(PROFILES);
  const reloaded = await profilesDialog(page);
  await expect(
    reloaded.getByRole("button", { name: "lecture recording lecture_recording" }),
  ).toBeVisible();
});
