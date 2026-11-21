/**
 * What the Metadata specs share: the LayerIt recording imported into a fresh
 * page with the clock fixed at 2026-11-20T12:00:00Z, every request to
 * Wikidata, lobid, YouTube or Wikimedia Commons answered from the editor's
 * recorded lookups (`packages/editor/tests/lookup/index.json`, by URL) and
 * aborted when it is not recorded; the tab, its tiles, the details of a
 * pair, its candidate lists and composer fields; and a timeline of the
 * exported manifest, read with `loads`, so its IDs are written `#id`.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { loads, statementsFixture } from "./schema.ts";
import { chooseItem, downloaded, pick, select, tab, withoutPickers } from "./support.ts";

/** The folder of the recorded answers. */
export const RECORDED = path.join(import.meta.dirname, "../packages/editor/tests/lookup");

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

/** Open a fresh page with the lookups replayed and the clock fixed, import the LayerIt recording; its block. */
export async function importLayerIt(page: Page): Promise<string> {
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
  return page.evaluate(() => Object.keys(window.__tilie.store().view.blocks)[0] ?? "");
}

/** Select the timeline `id` of `block` (the bundle for `null`) and show the Metadata tab. */
export async function showMetadata(page: Page, block: string, id: string | null): Promise<void> {
  await select(page, [id === null ? { block } : { block, id }]);
  const open = page.getByRole("button", { name: "Open inspector" });
  if (await open.isVisible()) await open.click();
  await tab(page, "Metadata").click();
}

/** The candidate list `name` ("candidates", or "dismissed": those the user believes false), opened. */
export async function openList(page: Page, name: "candidates" | "dismissed"): Promise<Locator> {
  const list = page.getByTestId(`metadata-${name}`);
  if ((await list.getAttribute("open")) === null) await list.locator("summary").click();
  return list;
}

/** The tiles of the tab. */
export const tiles = (page: Page): Locator => page.getByTestId("metadata-rectangle");

/** The tiles' headings: the first tile's sentence, every other one's verb and label. */
export const headings = (page: Page): Locator => page.getByTestId("metadata-heading");

/** The tile whose heading begins with `heading`. */
export const tile = (page: Page, heading: string): Locator =>
  tiles(page).filter({
    has: page.getByTestId("metadata-heading").filter({ hasText: new RegExp(`^\\s*${heading}`) }),
  });

/** Expand `tile` with its expand button, once. */
export async function expand(tile: Locator): Promise<void> {
  const toggle = tile.getByTestId("metadata-expand");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}

/** Open the details of the pair or candidate `name` ("rel:prf viaf:113931950", "is a recording of Clair de lune"). */
export async function details(page: Page, name: string): Promise<Locator> {
  const button = page.getByRole("button", { name: `Details of ${name}`, exact: true });
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
  return page.locator(`[id="${await button.getAttribute("aria-controls")}"]`);
}

/** A composer field by its label. */
export function field(page: Page, name: "Verb" | "Vocabulary" | "Value"): Locator {
  return page.getByTestId("metadata-composer").getByRole("combobox", { name, exact: true });
}

/** The exported manifest's timeline `id` (written `#id`). */
export async function exported(page: Page, id: string): Promise<{ [key: string]: unknown }> {
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
