/**
 * Picking a statement's element on the canvas, and proposing matches in
 * bulk for names stated without an identifier, on the LayerIt recording.
 * Derivation in `README.md` ("metadata-pick.spec.ts").
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { details, exported, field, importLayerIt, openList, showMetadata } from "./metadata.ts";
import { arranger, dispatch, framePoint, journalLength, selection } from "./support.ts";

const G = "tag:timetoalign.github.io,2026:tilie:user:Gerhardt";
const TILIE = "https://github.com/TimeToAlign/TimeLineEditor";

/** The block the import added. */
let block = "";

test.beforeEach(async ({ page }) => {
  block = await importLayerIt(page);
});

/** Type `text` into the composer's field `name` and take its first option. */
async function choose(page: Page, name: "Verb" | "Vocabulary", text: string): Promise<void> {
  await field(page, name).fill(text);
  await field(page, name).press("ArrowDown");
  await field(page, name).press("Enter");
}

/** On `cpt_2`, the composer at "derived from" in an element of the manifest. */
async function composeElement(page: Page): Promise<void> {
  await showMetadata(page, block, "cpt_2");
  await page.getByRole("button", { name: "＋ Add statement" }).click();
  await choose(page, "Verb", "derived from");
  await choose(page, "Vocabulary", "element");
}

const pickButton = (page: Page) => page.getByRole("button", { name: "Pick on the canvas" });

/** Press on `clt_6`'s card. */
async function pressCard(page: Page): Promise<void> {
  const { x, y } = await framePoint(page, block, { id: "clt_6", part: ["card"] });
  await page.mouse.click(x, y);
}

test("a picked element becomes the value", async ({ page }) => {
  await composeElement(page);
  await pickButton(page).click();
  await expect(pickButton(page)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("metadata-composer").locator("p.prompt[role=status]")).toHaveText(
    "Pick a timeline or a region on the canvas; Escape cancels.",
  );
  await expect(arranger(page)).toHaveAttribute("data-picking", "");
  const before = await journalLength(page);
  await pressCard(page);
  await expect(field(page, "Value")).toHaveValue("Clair de lune, mm. 1–6 (MEI) (timeline)");
  expect(await selection(page)).toEqual([{ block, id: "cpt_2" }]);
  expect(await journalLength(page)).toBe(before);
  await page.getByTestId("metadata-composer").getByRole("button", { name: "Add" }).click();
  expect((await exported(page, "cpt_2")).statements).toEqual({
    "dcterms:source": [{ id: "#clt_6" }],
  });
});

test("Escape cancels picking", async ({ page }) => {
  await composeElement(page);
  await pickButton(page).click();
  await expect(arranger(page)).toHaveAttribute("data-picking", "");
  await page.keyboard.press("Escape");
  await expect(pickButton(page)).toHaveAttribute("aria-pressed", "false");
  await expect(arranger(page)).not.toHaveAttribute("data-picking");
  await expect(page.getByTestId("metadata-composer")).toBeVisible();
  await expect(field(page, "Value")).toHaveValue("");
  await pressCard(page);
  await expect.poll(() => selection(page)).toEqual([{ block, id: "clt_6", part: ["card"] }]);
});

/** The status line of the arranger. */
const hint = (page: Page) => page.getByTestId("hint");

/** A screen point of the pane that no block, toolbar or message covers. */
async function panePoint(page: Page): Promise<{ x: number; y: number }> {
  const box = await arranger(page).boundingBox();
  if (box === null) throw new Error("the arranger is not shown");
  const found = await page.evaluate(({ x, y, width, height }) => {
    for (let dy = 20; dy < height - 20; dy += 20) {
      for (let dx = 20; dx < width - 20; dx += 20) {
        const at = document.elementFromPoint(x + dx, y + dy);
        if (at?.classList.contains("svelte-flow__pane")) return { x: x + dx, y: y + dy };
      }
    }
    return null;
  }, box);
  if (found === null) throw new Error("no free point of the pane");
  return found;
}

test("picking holds the canvas: the pane and the keys select nothing, a key picks", async ({
  page,
}) => {
  await composeElement(page);
  await pickButton(page).click();
  await expect(arranger(page)).toHaveAttribute("data-picking", "");
  const before = await journalLength(page);

  const { x, y } = await panePoint(page);
  await page.mouse.click(x, y);
  await expect(hint(page)).toHaveText("Pick a timeline or a region; Escape cancels.");
  expect(await selection(page)).toEqual([{ block, id: "cpt_2" }]);
  await expect(arranger(page)).toHaveAttribute("data-picking", "");
  await expect(page.getByTestId("metadata-composer")).toBeVisible();

  const node = page.locator(`.svelte-flow__node[data-id="${block}"]`);
  await node.focus();
  for (const key of ["Enter", " "]) {
    await page.keyboard.press(key === " " ? "Space" : key);
    await expect(hint(page)).toHaveText("Pick a timeline or a region; Escape cancels.");
    expect(await selection(page)).toEqual([{ block, id: "cpt_2" }]);
    await expect(arranger(page)).toHaveAttribute("data-picking", "");
  }

  const card = node.locator('[data-id="clt_6"][data-part="card"]').last();
  await card.dispatchEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  await expect(field(page, "Value")).toHaveValue("Clair de lune, mm. 1–6 (MEI) (timeline)");
  await expect(arranger(page)).not.toHaveAttribute("data-picking");
  expect(await selection(page)).toEqual([{ block, id: "cpt_2" }]);
  expect(await journalLength(page)).toBe(before);
});

test("names without an identifier get candidates, and one believed true replaces its name", async ({
  page,
}) => {
  expect(
    await dispatch(page, {
      type: "set",
      changes: [
        {
          target: { block, id: "cpt_2" },
          values: { statements: { "rel:prf": [{ label: "Maria João Pires" }] } },
        },
      ],
    }),
  ).toBeNull();
  await showMetadata(page, block, "cpt_2");
  const list = await openList(page, "candidates");
  await expect(list.locator(".count")).toHaveText("1 name without an identifier here and below");
  const before = await journalLength(page);
  await list.getByRole("button", { name: "Propose matches for unreconciled names" }).click();
  const rows = page.getByTestId("metadata-candidate-row");
  await expect(rows).toHaveCount(1);
  expect(await journalLength(page)).toBe(before + 1);
  await expect(page.getByText("Proposed 1 match: they are listed under Candidates.")).toBeVisible();
  await expect(page.getByText(/^(Wikidata|GND) could not be searched/u)).toHaveCount(0);
  await expect(rows.locator(".what")).toHaveText("performed by Maria João Pires");
  const region = await details(page, "performed by Maria João Pires");
  await expect(region.locator("dt")).toHaveText(["stated by", "method", "service", "note", "date"]);
  await expect(region.locator("dd")).toHaveText([
    "TiLiE",
    "reconciled",
    "https://www.wikidata.org/w/api.php",
    "found for the name “Maria João Pires”",
    "2026-11-20",
  ]);
  await expect(region.getByTestId("metadata-beliefs")).toHaveText("No one has stated a belief.");
  await region.getByRole("button", { name: "True", exact: true }).click();
  await expect(rows).toHaveCount(0);
  const cpt2 = await exported(page, "cpt_2");
  expect(cpt2.statements).toEqual({
    "rel:prf": [{ id: "wd:Q235650", label: "Maria João Pires" }],
  });
  expect(cpt2.provenance).toEqual([
    {
      beliefs: [{ actor: G, belief: "true", date: "2026-11-20" }],
      date: "2026-11-20",
      method: "reconciled",
      note: "found for the name “Maria João Pires”",
      property: "rel:prf",
      service: "https://www.wikidata.org/w/api.php",
      stated_by: [TILIE],
      value: { id: "wd:Q235650" },
    },
  ]);
});
