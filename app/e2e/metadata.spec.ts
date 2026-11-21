/**
 * The Metadata tab on the LayerIt recording: its tiles and candidates as
 * imported, collapsed to their sentences; stating a candidate and
 * believing one false; a pasted Wikidata URL stated after its verb,
 * "＋ Add vocabulary" from the first source's cross-references, the user
 * who states and believes, the keyboard alone, and a stated pair believed
 * false by its own button, never by an arrow key, and left stated. Every
 * request to Wikidata, lobid, YouTube or Wikimedia Commons is answered from
 * the editor's recorded lookups, any other aborted. Derivation in
 * `README.md` ("metadata.spec.ts").
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
  details,
  expand,
  exported,
  field,
  headings,
  importLayerIt,
  openList,
  pairs,
  RECORDED,
  showMetadata as show,
  tile,
  tiles,
} from "./metadata.ts";
import { chooseItem, journalLength } from "./support.ts";

const G = "tag:timetoalign.github.io,2026:tilie:user:Gerhardt";
const T = "https://example.org/agents/tilie";
const P = "https://example.org/people/editor";
const TILIE = "https://github.com/TimeToAlign/TimeLineEditor";
const ORCID = "https://orcid.org/0000-0002-1825-0097";
const CPT_1_SENTENCE =
  "C.Debussy - Clair de Lune, Maria João Pires live at Jardin Musical is a video.";
/** The GND's preferred name of Maria João Pires, as lobid's recorded record gives it. */
const GND_PIRES: string = JSON.parse(
  readFileSync(path.join(RECORDED, "gnd-record-124927521.json"), "utf8"),
).preferredName;

/** The block the import added. */
let block = "";

test.beforeEach(async ({ page }) => {
  block = await importLayerIt(page);
});

/** Select the timeline `id` (the bundle for `null`) and show the Metadata tab. */
const showMetadata = (page: Page, id: string | null) => show(page, block, id);

/** The two candidate lists' summaries. */
const summaries = (page: Page) => page.locator("details summary");

/**
 * Paste `text` into `locator` as the clipboard would. Firefox ignores the
 * standard `clipboardData` member of the event's initialiser and fills the
 * event's data from its own `dataType` and `data` members instead, which
 * the other engines ignore; the initialiser states both.
 */
async function paste(locator: Locator, text: string): Promise<void> {
  await locator.evaluate((element, pasted) => {
    const data = new DataTransfer();
    data.setData("text/plain", pasted);
    const init: ClipboardEventInit & { dataType: string; data: string } = {
      clipboardData: data,
      dataType: "text/plain",
      data: pasted,
      bubbles: true,
      cancelable: true,
    };
    element.dispatchEvent(new ClipboardEvent("paste", init));
  }, text);
}

test("the LayerIt recording opens with its tiles collapsed and its candidates", async ({
  page,
}) => {
  await expect(page.getByRole("alert")).toHaveCount(0);
  await showMetadata(page, "cpt_1");
  await expect(headings(page)).toHaveText([
    CPT_1_SENTENCE,
    "performed by Maria João Pires",
    "same as",
  ]);
  await expect(tiles(page).getByTestId("metadata-vocabulary")).toHaveCount(3);
  for (const list of await tiles(page).getByTestId("metadata-vocabulary").all()) {
    await expect(list).toBeHidden();
  }
  const performed = tile(page, "performed by");
  await expand(performed);
  await expect(performed.getByTestId("metadata-label")).toHaveText("Maria João Pires");
  await expect(pairs(performed)).toHaveText(["rel:prf viaf:113931950 ↗", "wdt:P175 wd:Q235650 ↗"]);
  await expect(
    performed.getByRole("button", { name: "Details of wdt:P175 wd:Q235650", exact: true }),
  ).toHaveText("Details");
  for (const heading of ["C.Debussy", "performed by", "same as"]) {
    await expect(tile(page, heading).getByTestId("metadata-add-vocabulary")).toHaveCount(1);
  }
  await expect(page.getByText("Status")).toHaveCount(0);
  await expect(summaries(page)).toHaveText(["Candidates (1)", "Believed false by you (0)"]);
  await openList(page, "candidates");
  await expect(page.getByTestId("metadata-candidate-row").locator(".what")).toHaveText(
    "is a recording of Clair de lune",
  );

  await showMetadata(page, "clt_6");
  await expect(summaries(page)).toHaveText(["Candidates (1)", "Believed false by you (0)"]);
  await expect(page.getByTestId("metadata-candidate-row")).toContainText("gnd:1156628156");
  const believed = await details(page, "is a version or edition of gnd:1156628156");
  await expect(believed.getByTestId("metadata-beliefs")).toHaveText(
    `${P} believes it false (2026-11-18)`,
  );

  await showMetadata(page, "dpt_1");
  await expect(summaries(page).nth(0)).toHaveText("Candidates (1)");

  await showMetadata(page, null);
  await expect(headings(page).first()).toHaveText(
    "Nothing states yet what LayerIt, Clair de lune mm. 1–6 (Pires) is.",
  );
  await expect(tiles(page).first().getByRole("button", { name: "State what it is" })).toBeVisible();
});

test("believing a candidate true states it with the belief, kept as made", async ({ page }) => {
  await showMetadata(page, "cpt_1");
  const before = await journalLength(page);
  await openList(page, "candidates");
  const region = await details(page, "is a recording of Clair de lune");
  await region.getByRole("button", { name: "True", exact: true }).click();
  await expect(headings(page)).toHaveText([
    CPT_1_SENTENCE,
    "performed by Maria João Pires",
    "same as",
    "is a recording of",
  ]);
  expect(await journalLength(page)).toBe(before + 1);
  const cpt1 = await exported(page, "cpt_1");
  expect((cpt1.statements as { [key: string]: unknown })["wdt:P2550"]).toEqual([
    { id: "wd:Q29117946" },
  ]);
  expect((cpt1.provenance as unknown[])[3]).toEqual({
    basis: ["#clt_6", "#dpt_1"],
    beliefs: [{ actor: G, belief: "true", date: "2026-11-20" }],
    date: "2026-11-18",
    method: "inferred",
    note: "from the encoding's work and the WAV's source; whether the video holds the whole movement is unchecked",
    property: "wdt:P2550",
    stated_by: [T],
    value: { id: "wd:Q29117946" },
  });
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("metadata-candidate-row")).toHaveCount(1);
  await expect(headings(page)).toHaveText([
    CPT_1_SENTENCE,
    "performed by Maria João Pires",
    "same as",
  ]);
});

test("believing a candidate false sets it apart, its entry kept", async ({ page }) => {
  await showMetadata(page, "dpt_1");
  await openList(page, "candidates");
  const region = await details(
    page,
    "is derived from, is based on C.Debussy - Clair de Lune, Maria João Pires live at Jardin Musical",
  );
  await region.getByRole("button", { name: "False", exact: true }).click();
  await expect(summaries(page)).toHaveText(["Candidates (0)", "Believed false by you (1)"]);
  const dpt1 = await exported(page, "dpt_1");
  expect((dpt1.statements as { [key: string]: unknown })["dcterms:source"]).toBe(undefined);
  expect(dpt1.provenance).toEqual([
    {
      beliefs: [{ actor: G, belief: "false", date: "2026-11-20" }],
      date: "2026-11-18",
      method: "inferred",
      note: "assumed ripped from the video's sound and cut",
      property: "dcterms:source",
      stated_by: [P],
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
  await expect(headings(page)).toHaveText([
    "Nothing states yet what cpt_2 is.",
    "performed by Maria João Pires",
  ]);
  await expand(tile(page, "performed by"));
  await expect(pairs(tile(page, "performed by"))).toHaveText(["wdt:P175 wd:Q235650 ↗"]);
  const cpt2 = await exported(page, "cpt_2");
  expect(cpt2.statements).toEqual({
    "wdt:P175": [{ id: "wd:Q235650", label: "Maria João Pires" }],
  });
  expect(cpt2.provenance).toEqual([
    {
      beliefs: [{ actor: G, belief: "true", date: "2026-11-20" }],
      date: "2026-11-20",
      method: "manual",
      property: "wdt:P175",
      stated_by: [G],
      value: { id: "wd:Q235650" },
    },
  ]);
});

test("＋ Add vocabulary offers the value from the first source's cross-references", async ({
  page,
}) => {
  await showMetadata(page, "cpt_1");
  await expand(tile(page, "performed by"));
  await tile(page, "performed by").getByTestId("metadata-add-vocabulary").click();
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
  await expect(pairs(tile(page, "performed by"))).toHaveText([
    "rel:prf viaf:113931950 ↗",
    "rel:prf gnd:124927521 ↗",
    "wdt:P175 wd:Q235650 ↗",
  ]);
  const cpt1 = await exported(page, "cpt_1");
  expect((cpt1.statements as { [key: string]: unknown })["rel:prf"]).toEqual([
    { id: "viaf:113931950" },
    {
      id: "gnd:124927521",
      label: GND_PIRES,
      provenance: [
        {
          basis: ["http://www.wikidata.org/entity/Q235650"],
          date: "2026-11-20",
          method: "inferred",
          note: "written by “＋ Add vocabulary” to keep the value with the thing it was chosen for",
          property: "schema:sameAs",
          stated_by: [TILIE],
          value: { id: "wd:Q235650" },
        },
      ],
      "schema:sameAs": [{ id: "wd:Q235650" }],
    },
  ]);
  expect((cpt1.provenance as unknown[]).at(-1)).toEqual({
    basis: ["http://www.wikidata.org/entity/Q235650"],
    beliefs: [{ actor: G, belief: "true", date: "2026-11-20" }],
    date: "2026-11-20",
    match: "exact",
    method: "reconciled",
    property: "rel:prf",
    service: "https://www.wikidata.org/w/api.php",
    stated_by: [G],
    value: { id: "gnd:124927521" },
  });
});

test("the user's name and ORCID iD stamp the journal and the beliefs", async ({ page }) => {
  await chooseItem(page, "Your name…");
  const dialog = page.getByRole("dialog", { name: "Your name" });
  await dialog.getByLabel("Name", { exact: true }).fill("Clara Wieck");
  await dialog.getByLabel("ORCID iD (optional)").fill(ORCID);
  await dialog.getByRole("button", { name: "Save" }).click();
  await showMetadata(page, "cpt_1");
  await expect(page.getByTestId("metadata-user")).toContainText(
    "You state as Clara Wieck (ORCID iD 0000-0002-1825-0097).",
  );
  await expand(tile(page, "same as"));
  const same = await details(page, "schema:sameAs https://www.youtube.com/watch?v=Ch2mrPm1JnM");
  await same.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(headings(page)).toHaveText([CPT_1_SENTENCE, "performed by Maria João Pires"]);
  expect(await page.evaluate(() => window.__tilie.store().journal.at(-1)?.author ?? null)).toBe(
    "Clara Wieck",
  );
  await openList(page, "candidates");
  const candidate = await details(page, "is a recording of Clair de lune");
  await candidate.getByRole("button", { name: "True", exact: true }).click();
  await expect(headings(page)).toHaveText([
    CPT_1_SENTENCE,
    "performed by Maria João Pires",
    "is a recording of",
  ]);
  const cpt1 = await exported(page, "cpt_1");
  expect((cpt1.provenance as { beliefs: unknown }[]).at(-1)?.beliefs).toEqual([
    { actor: ORCID, belief: "true", date: "2026-11-20" },
  ]);
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
  await expect(headings(page)).toHaveText([
    "Nothing states yet what cpt_2 is.",
    "performed by Maria João Pires",
  ]);
  const toggle = tile(page, "performed by").getByTestId("metadata-expand");
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
});

test("a stated pair is believed false by its own button, never by an arrow key, and stays", async ({
  page,
}) => {
  await showMetadata(page, "cpt_1");
  const before = await journalLength(page);
  await expand(tile(page, "performed by"));
  const region = await details(page, "wdt:P175 wd:Q235650");
  const believeFalse = region.getByRole("button", { name: "False", exact: true });
  await believeFalse.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  expect(await journalLength(page)).toBe(before);
  await expect(believeFalse).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Enter");
  await expect(believeFalse).toHaveAttribute("aria-pressed", "true");
  await expect(headings(page)).toHaveText([
    CPT_1_SENTENCE,
    "performed by Maria João Pires",
    "same as",
  ]);
  expect(await journalLength(page)).toBe(before + 1);
  const cpt1 = await exported(page, "cpt_1");
  const statements = cpt1.statements as { [key: string]: unknown };
  expect(statements["wdt:P175"]).toEqual([
    {
      id: "wd:Q235650",
      label: "Maria João Pires",
      "schema:sameAs": [{ id: "viaf:113931950" }, { id: "gnd:124927521" }],
    },
  ]);
  expect((cpt1.provenance as { beliefs?: unknown }[])[1]?.beliefs).toEqual([
    { actor: P, belief: "true", date: "2026-11-18" },
    { actor: G, belief: "false", date: "2026-11-20" },
  ]);
});
