/**
 * A manifest is imported once: importing one a block holds already is
 * refused with a warning naming that block, which is selected where the
 * open editor keeps it, and every open editor stays open. A reload
 * keeps the server connection: the token handed over in the fragment is
 * kept in the tab's session storage. Derivation in `README.md`
 * ("import.spec.ts").
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { manifestFixture } from "./schema.ts";
import {
  editing,
  enter,
  importFixture,
  journalLength,
  pick,
  selection,
  viewportOf,
} from "./support.ts";

function blockCount(page: Page): Promise<number> {
  return page.evaluate(() => Object.keys(window.__tilie.store().view.blocks).length);
}

/** Import `text` as `name` with nothing selected; the warning it is refused with. */
async function refusedImport(page: Page, name: string, text: string): Promise<string> {
  await page.evaluate(() => window.__tilie.select([]));
  await pick(page, "Import manifest…", name, text);
  const message = page.getByTestId("message");
  await expect(message).toHaveCount(1);
  await expect(message).toHaveAttribute("data-level", "warning");
  const shown = (await message.locator("p").textContent()) ?? "";
  await message.getByRole("button", { name: "Dismiss" }).click();
  await expect(message).toHaveCount(0);
  return shown;
}

test("a manifest a block holds already is refused, its block selected", async ({ page }) => {
  const cards = manifestFixture("flow/virtual_cards");
  const block = await importFixture(page, "flow/virtual_cards");
  expect(await refusedImport(page, "virtual_cards.yaml", cards)).toBe(
    'virtual_cards.yaml was not imported: the workspace holds it already, in the block "Virtual cards", which is now selected.',
  );
  expect([await journalLength(page), await blockCount(page)]).toEqual([1, 1]);
  expect(await selection(page)).toEqual([{ block }]);

  await pick(page, "Import manifest…", "bare.yaml", manifestFixture("bare"));
  await expect.poll(() => journalLength(page)).toBe(2);

  const work = manifestFixture("statements/op106_work");
  await pick(page, "Import manifest…", "op106_work.yaml", work);
  await expect.poll(() => journalLength(page)).toBe(3);
  const [op106] = await selection(page);
  if (op106?.block === undefined) throw new Error("the imported block is not selected");
  const revised = work.replace(
    'name: "Beethoven, Piano Sonata No. 29, Op. 106"',
    'name: "Op. 106, revised"',
  );
  expect(revised).not.toBe(work);
  expect(await refusedImport(page, "op106_revised.yaml", revised)).toBe(
    'op106_revised.yaml was not imported: the workspace holds it already, in the block "Beethoven, Piano Sonata No. 29, Op. 106", which is now selected.',
  );
  expect([await journalLength(page), await blockCount(page)]).toEqual([3, 3]);
  expect(await selection(page)).toEqual([{ block: op106.block }]);
});

test("a refused import leaves the open editors open", async ({ page }) => {
  const cards = manifestFixture("flow/virtual_cards");
  const block = await importFixture(page, "flow/virtual_cards");
  const bundleEditor = [{ target: { block }, kind: "bundle" }];
  await enter(page, { block }, await viewportOf(page));
  expect(await refusedImport(page, "virtual_cards.yaml", cards)).toBe(
    'virtual_cards.yaml was not imported: the workspace holds it already, in the block "Virtual cards", which is now selected.',
  );
  expect([await editing(page), await journalLength(page), await blockCount(page)]).toEqual([
    bundleEditor,
    1,
    1,
  ]);
  expect(await selection(page)).toEqual([{ block }]);

  // A manifest that is added leaves the open editors first.
  const bare = manifestFixture("bare");
  await pick(page, "Import manifest…", "bare.yaml", bare);
  await expect.poll(() => journalLength(page)).toBe(2);
  expect([await editing(page), await blockCount(page)]).toEqual([[], 2]);

  // Held by a block the open editor does not edit: refused, nothing selected, the editor open.
  await enter(page, { block }, await viewportOf(page));
  expect(await refusedImport(page, "bare.yaml", bare)).toBe(
    'bare.yaml was not imported: the workspace holds it already, in the block "Anonymous bundle".',
  );
  expect([await editing(page), await journalLength(page), await blockCount(page)]).toEqual([
    bundleEditor,
    2,
    2,
  ]);
  expect(await selection(page)).toEqual([]);
});

const TOKEN = "e2e-token";
const HEALTH = { name: "tilie-server", version: "0.1.0", timetoalign: "1.2.0" };

/** Answer the page's health check with `HEALTH` only for the run's token, else 401; the headers received. */
async function serveHealth(page: Page): Promise<string[]> {
  const received: string[] = [];
  await page.route("**/api/health", (route) => {
    const authorization = route.request().headers().authorization ?? "";
    received.push(authorization);
    return authorization === `Bearer ${TOKEN}`
      ? route.fulfill({ json: HEALTH })
      : route.fulfill({ status: 401, json: { detail: "missing or wrong token" } });
  });
  return received;
}

/** The address bar's path, query and fragment. */
function address(page: Page): string {
  const url = new URL(page.url());
  return `${url.pathname}${url.search}${url.hash}`;
}

test("a reload keeps the server connection; another tab has none", async ({ page, context }) => {
  const received = await serveHealth(page);
  await page.goto(`/#token=${TOKEN}`);
  await page.waitForFunction(
    () => window.__tilie !== undefined && window.__tilie.health() !== null,
  );
  expect(await page.evaluate(() => window.__tilie.health())).toEqual(HEALTH);
  expect(address(page)).toBe("/");
  expect(
    await page.evaluate(() => [
      sessionStorage.getItem("tilie.token"),
      localStorage.getItem("tilie.token"),
    ]),
  ).toEqual([TOKEN, null]);

  await page.reload();
  await page.waitForFunction(
    () => window.__tilie !== undefined && window.__tilie.health() !== null,
  );
  expect(await page.evaluate(() => window.__tilie.health())).toEqual(HEALTH);
  await expect(page.locator(".offline")).toHaveCount(0);
  expect(address(page)).toBe("/");
  expect(received).toEqual([`Bearer ${TOKEN}`, `Bearer ${TOKEN}`]);

  const other = await context.newPage();
  const elsewhere = await serveHealth(other);
  await other.goto("/");
  await expect(other.locator(".offline")).toHaveCount(1);
  // The editor sends `Bearer ` with the empty token; the browser trims the header's value.
  expect(elsewhere).toEqual(["Bearer"]);
});
