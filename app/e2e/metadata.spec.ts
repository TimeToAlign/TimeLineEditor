/**
 * The Metadata tab on the LayerIt recording: its rectangles and drawers as
 * imported, confirming and rejecting a proposal, a pasted Wikidata URL
 * stated after its verb, "＋ vocabulary" from the first source's
 * cross-references, the user who states, and the keyboard alone. Every
 * request to Wikidata, lobid, YouTube or Wikimedia Commons is answered from
 * the editor's recorded lookups, any other aborted. Derivation in
 * `README.md` ("metadata.spec.ts").
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { loads, statementsFixture } from "./schema.ts";
import {
  chooseItem,
  downloaded,
  journalLength,
  pick,
  select,
  tab,
  withoutPickers,
} from "./support.ts";

const G = "tag:timetoalign.github.io,2026:tilie:user:Gerhardt";
const ORCID = "https://orcid.org/0000-0002-1825-0097";
const RECORDED = path.join(import.meta.dirname, "../packages/editor/tests/lookup");
const LOOKUP_HOSTS =
  /^https:\/\/(www\.wikidata\.org|lobid\.org|www\.youtube\.com|commons\.wikimedia\.org)\//u;

/** The recorded answers, by request URL. */
const INDEX: Readonly<Record<string, string>> = JSON.parse(
  readFileSync(path.join(RECORDED, "index.json"), "utf8"),
);

/** Answer the lookup hosts from the recordings; abort what is not recorded. */
async function replayLookups(page: Page): Promise<void> {
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
}

/** The GND's preferred name of Maria João Pires, as lobid's recorded record gives it. */
const GND_PIRES: string = JSON.parse(
  readFileSync(path.join(RECORDED, "gnd-record-124927521.json"), "utf8"),
).preferredName;

/** The block the import added. */
let block = "";

test.beforeEach(async ({ page }) => {
  await withoutPickers(page);
  await replayLookups(page);
  await page.clock.setFixedTime(new Date("2026-11-20T12:00:00Z"));
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

/** Select the timeline `id` (the bundle for `null`) and show the Metadata tab. */
async function showMetadata(page: Page, id: string | null): Promise<void> {
  await select(page, [id === null ? { block } : { block, id }]);
  const open = page.getByRole("button", { name: "Open inspector" });
  if (await open.isVisible()) await open.click();
  await tab(page, "Metadata").click();
}

const rectangles = (page: Page) => page.getByTestId("metadata-rectangle");

/** The drawer `name` ("proposed", "rejected", "higher"), opened. */
async function openDrawer(page: Page, name: string): Promise<Locator> {
  const drawer = page.getByTestId(`metadata-drawer-${name}`);
  if ((await drawer.getAttribute("open")) === null) await drawer.locator("summary").click();
  return drawer;
}
const headings = (page: Page) => page.getByTestId("metadata-heading").locator(".verb");
const rectangle = (page: Page, heading: string): Locator =>
  rectangles(page).filter({ has: page.locator(".verb", { hasText: new RegExp(`^${heading}$`) }) });

/** A composer field by its label. */
function field(page: Page, name: "Verb" | "Vocabulary" | "Value"): Locator {
  return page.getByTestId("metadata-composer").getByRole("combobox", { name, exact: true });
}

/** The exported manifest's timeline `id` (written `#id`). */
async function exported(page: Page, id: string): Promise<{ [key: string]: unknown }> {
  const download = downloaded(page.waitForEvent("download"));
  await chooseItem(page, "Export manifest…");
  const [, text] = await download;
  type Written = { [key: string]: unknown; children?: Written[] };
  const manifest = loads(text) as { timelines: Written[] };
  const find = (timelines: readonly Written[]): Written | undefined => {
    for (const timeline of timelines) {
      const found = timeline.id === `#${id}` ? timeline : find(timeline.children ?? []);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  const found = find(manifest.timelines);
  if (found === undefined) throw new Error(`no #${id}`);
  return found;
}

/** Paste `text` into `locator` as the clipboard would. */
async function paste(locator: Locator, text: string): Promise<void> {
  await locator.evaluate((element, pasted) => {
    const data = new DataTransfer();
    data.setData("text", pasted);
    element.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, text);
}

test("the LayerIt recording opens with its rectangles and drawers", async ({ page }) => {
  await expect(page.getByRole("alert")).toHaveCount(0);
  await showMetadata(page, "cpt_1");
  await expect(headings(page)).toHaveText(["is a", "performed by", "same as"]);
  const performed = rectangle(page, "performed by");
  await expect(performed.getByTestId("metadata-label")).toHaveText("Maria João Pires");
  await expect(performed.getByTestId("metadata-vocabulary").locator("li")).toHaveText([
    "rel:prf viaf:113931950 ↗",
    "wdt:P175 wd:Q235650 ↗",
  ]);
  for (const heading of ["is a", "performed by", "same as"]) {
    await expect(rectangle(page, heading).getByTestId("metadata-add-vocabulary")).toHaveCount(1);
  }
  await expect(page.locator("details summary")).toHaveText([
    "Stated higher up (2)",
    "Proposed (1)",
    "Rejected (0)",
  ]);
  await openDrawer(page, "proposed");
  const proposed = page.getByTestId("metadata-proposed-row");
  await expect(proposed.locator(".what")).toHaveText("is a recording of Clair de lune");
  await expect(proposed.getByRole("button")).toHaveText(["Confirm", "Reject"]);

  await showMetadata(page, "clt_6");
  await expect(page.locator("details summary").nth(2)).toHaveText("Rejected (1)");
  await expect(page.getByTestId("metadata-rejected-row")).toContainText("gnd:1156628156");

  await showMetadata(page, "dpt_1");
  await expect(page.locator("details summary").nth(1)).toHaveText("Proposed (1)");

  await showMetadata(page, null);
  await expect(
    rectangles(page).first().getByRole("button", { name: "State what it is" }),
  ).toBeVisible();
});

test("confirming a proposal states the pair and exports it confirmed", async ({ page }) => {
  await showMetadata(page, "cpt_1");
  const before = await journalLength(page);
  await openDrawer(page, "proposed");
  await page.getByTestId("metadata-proposed-row").getByRole("button", { name: "Confirm" }).click();
  await expect(headings(page)).toHaveText(["is a", "performed by", "same as", "is a recording of"]);
  expect(await journalLength(page)).toBe(before + 1);
  const cpt1 = await exported(page, "cpt_1");
  expect((cpt1.statements as { [key: string]: unknown })["wdt:P2550"]).toEqual([
    { id: "wd:Q29117946" },
  ]);
  expect((cpt1.provenance as unknown[])[3]).toEqual({
    basis: ["#clt_6", "#dpt_1"],
    date: "2026-11-20",
    method: "inferred",
    note: "from the encoding's work and the WAV's source; whether the video holds the whole movement is unchecked",
    property: "wdt:P2550",
    stated_by: [G],
    status: "confirmed",
    value: { id: "wd:Q29117946" },
  });
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("metadata-proposed-row")).toHaveCount(1);
  await expect(headings(page)).toHaveText(["is a", "performed by", "same as"]);
});

test("rejecting a proposal keeps it as a rejected annotation", async ({ page }) => {
  await showMetadata(page, "dpt_1");
  await openDrawer(page, "proposed");
  await page.getByTestId("metadata-proposed-row").getByRole("button", { name: "Reject" }).click();
  await expect(page.locator("details summary").nth(2)).toHaveText("Rejected (1)");
  const dpt1 = await exported(page, "dpt_1");
  expect((dpt1.statements as { [key: string]: unknown })["dcterms:source"]).toBe(undefined);
  expect(dpt1.provenance).toEqual([
    {
      date: "2026-11-20",
      method: "inferred",
      note: "assumed ripped from the video's sound and cut",
      property: "dcterms:source",
      stated_by: [G],
      status: "rejected",
      value: { id: "#cpt_1" },
    },
  ]);
});

test("a pasted Wikidata URL becomes a statement after choosing its verb", async ({ page }) => {
  await showMetadata(page, "cpt_2");
  await page.getByRole("button", { name: "＋ Add statement" }).click();
  await paste(field(page, "Value"), "https://www.wikidata.org/wiki/Q235650");
  await expect(field(page, "Vocabulary")).toHaveValue("Wikidata");
  await expect(field(page, "Verb")).toBeFocused();
  await expect(field(page, "Value")).toHaveValue("Maria João Pires");
  await page.keyboard.type("perf");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(headings(page)).toHaveText(["is a", "performed by"]);
  await expect(rectangle(page, "performed by").getByTestId("metadata-vocabulary")).toHaveText(
    "wdt:P175 wd:Q235650 ↗",
  );
  const cpt2 = await exported(page, "cpt_2");
  expect(cpt2.statements).toEqual({
    "wdt:P175": [{ id: "wd:Q235650", label: "Maria João Pires" }],
  });
  expect(cpt2.provenance).toEqual([
    {
      date: "2026-11-20",
      method: "manual",
      property: "wdt:P175",
      stated_by: [G],
      status: "confirmed",
      value: { id: "wd:Q235650" },
    },
  ]);
});

test("＋ vocabulary proposes the value from the first source's cross-references", async ({
  page,
}) => {
  await showMetadata(page, "cpt_1");
  await rectangle(page, "performed by").getByTestId("metadata-add-vocabulary").click();
  await field(page, "Vocabulary").fill("GND");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const value = field(page, "Value");
  await expect(value).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const option = page.getByRole("listbox", { name: "Value" }).getByRole("option").first();
  await expect(option).toContainText(GND_PIRES);
  // The options arrive after the lookup answers; the arrow may have opened an empty list.
  if ((await value.getAttribute("aria-activedescendant")) === null) {
    await page.keyboard.press("ArrowDown");
  }
  await expect(value).toHaveAttribute("aria-activedescendant", /-option-0$/u);
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    rectangle(page, "performed by").getByTestId("metadata-vocabulary").locator("li"),
  ).toHaveText(["rel:prf viaf:113931950 ↗", "rel:prf gnd:124927521 ↗", "wdt:P175 wd:Q235650 ↗"]);
  const cpt1 = await exported(page, "cpt_1");
  expect((cpt1.statements as { [key: string]: unknown })["rel:prf"]).toEqual([
    { id: "viaf:113931950" },
    {
      id: "gnd:124927521",
      label: GND_PIRES,
      "schema:sameAs": [{ id: "wd:Q235650" }],
    },
  ]);
  expect((cpt1.provenance as unknown[]).at(-1)).toEqual({
    basis: ["http://www.wikidata.org/entity/Q235650"],
    date: "2026-11-20",
    match: "exact",
    method: "reconciled",
    property: "rel:prf",
    service: "https://www.wikidata.org/w/api.php",
    stated_by: [G],
    status: "confirmed",
    value: { id: "gnd:124927521" },
  });
});

test("the user's name and ORCID iD stamp the journal and the statements", async ({ page }) => {
  await chooseItem(page, "Your name…");
  const dialog = page.getByRole("dialog", { name: "Your name" });
  await dialog.getByLabel("Name", { exact: true }).fill("Clara Wieck");
  await dialog.getByLabel("ORCID iD (optional)").fill(ORCID);
  await dialog.getByRole("button", { name: "Save" }).click();
  await showMetadata(page, "cpt_1");
  await expect(page.getByTestId("metadata-user")).toContainText(
    "You state as Clara Wieck (ORCID iD 0000-0002-1825-0097).",
  );
  await rectangle(page, "same as").getByRole("button", { name: "Remove" }).click();
  await expect(headings(page)).toHaveText(["is a", "performed by"]);
  expect(await page.evaluate(() => window.__tilie.store().journal.at(-1)?.author ?? null)).toBe(
    "Clara Wieck",
  );
  await openDrawer(page, "proposed");
  await page.getByTestId("metadata-proposed-row").getByRole("button", { name: "Confirm" }).click();
  await expect(headings(page)).toHaveText(["is a", "performed by", "is a recording of"]);
  const cpt1 = await exported(page, "cpt_1");
  expect((cpt1.provenance as { stated_by: unknown }[]).at(-1)?.stated_by).toEqual([ORCID]);
  await page.reload();
  await page.waitForFunction(() => window.__tilie !== undefined);
  expect(await page.evaluate(() => localStorage.getItem("tilie.user"))).toBe(
    '{"name":"Clara Wieck","orcid":"0000-0002-1825-0097"}',
  );
});

test("keyboard only", async ({ page }) => {
  await showMetadata(page, "cpt_2");
  const add = page.getByRole("button", { name: "＋ Add statement" });
  await add.focus();
  await page.keyboard.press("Enter");
  await expect(field(page, "Verb")).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(field(page, "Value")).toBeFocused();
  await paste(field(page, "Value"), "https://www.wikidata.org/wiki/Q235650");
  await expect(field(page, "Verb")).toBeFocused();
  await page.keyboard.type("perf");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("listbox", { name: "Verb" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox", { name: "Verb" })).toBeHidden();
  await expect(page.getByTestId("metadata-composer")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(field(page, "Verb")).toHaveValue("performed by");
  const addButton = page.getByRole("button", { name: "Add", exact: true });
  await expect(addButton).toBeEnabled();
  for (let stop = 0; stop < 6; stop += 1) {
    if (await addButton.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(addButton).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(headings(page)).toHaveText(["is a", "performed by"]);
});

test("a rectangle is rejected by its own button, never by an arrow key", async ({ page }) => {
  await showMetadata(page, "cpt_1");
  const before = await journalLength(page);
  const reject = rectangle(page, "performed by").getByRole("button", {
    name: "Reject performed by Maria João Pires",
    exact: true,
  });
  await expect(rectangle(page, "performed by").getByTestId("metadata-status")).toHaveText(
    "Status: confirmed",
  );
  await reject.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await expect(headings(page)).toHaveText(["is a", "performed by", "same as"]);
  expect(await journalLength(page)).toBe(before);
  await page.keyboard.press("Enter");
  await expect(headings(page)).toHaveText(["is a", "same as"]);
  await expect(rectangle(page, "same as")).toBeFocused();
  await expect(
    page.getByText("Rejected “performed by Maria João Pires”: it is listed under Rejected."),
  ).toBeVisible();
  await expect(page.locator("details summary").nth(2)).toHaveText("Rejected (2)");
  expect(await journalLength(page)).toBe(before + 1);
  const cpt1 = await exported(page, "cpt_1");
  const statements = cpt1.statements as { [key: string]: unknown };
  expect([statements["rel:prf"], statements["wdt:P175"]]).toEqual([undefined, undefined]);
  type Entry = { property: string; status: string; stated_by?: string[]; date?: string };
  expect(
    (cpt1.provenance as Entry[])
      .filter((entry) => entry.status === "rejected")
      .map((entry) => [entry.property, entry.stated_by, entry.date])
      .sort(),
  ).toEqual([
    ["rel:prf", [G], "2026-11-20"],
    ["wdt:P175", [G], "2026-11-20"],
  ]);
});
