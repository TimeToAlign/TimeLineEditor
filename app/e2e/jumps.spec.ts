/**
 * Adding jumps with what they need through the Flow control tab, in the
 * real app, on `flow/virtual_cards` (root `allegro`). The expected values
 * are derived in `README.md` ("jumps.spec.ts"): a dal segno al fine with a
 * new segno and a new Fine, then a first and a second ending, each kind's
 * elements read back from the manifest, selected, and drawn in `allegro`'s
 * flow control band, each kind one undo step.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
  arranger,
  bandPoint,
  bandsOf,
  byKey,
  drawer,
  editing,
  entriesLength,
  importFixture,
  selection,
  settledDrawing,
  setViewport,
} from "./support.ts";

const VIEW = { x: 40, y: 40, zoom: 1 };

/** A flow-control element as the manifest's complete form writes it. */
interface Stored {
  readonly id: string;
  readonly [member: string]: unknown;
}

/** `allegro`'s flow-control elements, in the manifest's order. */
function allegroFlow(page: Page, block: string): Promise<Stored[]> {
  return page.evaluate((id) => {
    const manifest = window.__tilie.store().view.blocks[id]?.manifest;
    const allegro = manifest?.timelines.find((item) => item.id === "allegro");
    return JSON.parse(JSON.stringify(allegro?.flow_control ?? [])) as Stored[];
  }, block);
}

/** The number of elements `allegro`'s flow control band draws. */
async function drawnElements(page: Page, block: string): Promise<number | undefined> {
  const bands = await bandsOf(page, block, "allegro");
  return bands.find((band) => band.facet === "flow_control")?.elements;
}

/** A flow-control element in its complete form. */
function element(id: string, role: string, coordinate: unknown, members: object = {}) {
  return { id, role, coordinate, name: null, label: null, meta: {}, ...members };
}

/** A destination of a jump in its complete form. */
function destination(members: object) {
  return { determined: true, reset: true, label: null, ...members };
}

/** `elements` ordered by their IDs. */
function byId<T extends { readonly id: string }>(elements: readonly T[]): T[] {
  return [...elements].sort((left, right) => (left.id < right.id ? -1 : 1));
}

/** The elements of `after` that `before` does not hold, in the manifest's order. */
function newOf(before: readonly Stored[], after: readonly Stored[]): Stored[] {
  return after.filter((item) => !before.some((known) => known.id === item.id));
}

test("the Flow control tab adds a dal segno al fine with its segno and Fine, and a volta set", async ({
  page,
}) => {
  const block = await importFixture(page, "flow/virtual_cards");
  await setViewport(page, VIEW);
  await settledDrawing(page, block);
  const inBand = await bandPoint(page, block, { id: "allegro", facet: "flow_control" }, 2);
  await page.mouse.dblclick(inBand.x, inBand.y);
  await expect
    .poll(() => editing(page))
    .toEqual([{ target: { block, id: "allegro" }, kind: "flow" }]);
  expect(await drawnElements(page, block)).toBe(3);

  const add = drawer(page).getByTestId("flow-control-add");
  const submit = add.getByRole("button", { name: "Add", exact: true });
  const choice = (name: string) => add.getByRole("combobox", { name, exact: true });
  // A position's field is named by its label and the unit of its axis.
  const field = (name: string) => add.getByRole("textbox", { name: `${name} ♩`, exact: true });

  const original = await allegroFlow(page, block);
  const entries = await entriesLength(page);
  await choice("Element").selectOption({ label: "Dal segno al fine" });
  await expect(choice("Segno")).toHaveValue("new");
  await expect(choice("Fine")).toHaveValue("new");
  await field("Position").fill("1100");
  await field("New segno at").fill("600");
  await field("New Fine at").fill("1000");
  await submit.click();
  await expect.poll(() => entriesLength(page)).toBe(entries + 1);
  const withSegno = await allegroFlow(page, block);
  const [segno, fine, jump] = newOf(original, withSegno);
  expect(newOf(original, withSegno)).toHaveLength(3);
  const ids = { segno: segno?.id ?? "", fine: fine?.id ?? "", jump: jump?.id ?? "" };
  expect([segno, fine, jump]).toEqual([
    element(ids.segno, "jump_target", [600, 1], { manifestation: "segno" }),
    element(ids.fine, "break", [1000, 1], {
      manifestation: "fine",
      ends: { after: { jump: ids.jump } },
    }),
    element(ids.jump, "jump", [1100, 1], {
      targets: [
        destination({
          to: ids.segno,
          manifestation: "dal_segno_al_fine",
          repeat_count: 1,
          reset: false,
        }),
      ],
    }),
  ]);
  await expect
    .poll(async () => byKey(await selection(page)))
    .toEqual(byKey([ids.segno, ids.fine, ids.jump].map((id) => ({ block, id }))));
  await expect.poll(() => drawnElements(page, block)).toBe(6);

  await choice("Element").selectOption({ label: "First and second ending" });
  await expect(choice("Back to")).toHaveValue("none");
  await field("First ending at").fill("1200");
  await field("Second ending at").fill("1300");
  await submit.click();
  await expect.poll(() => entriesLength(page)).toBe(entries + 2);
  const added = newOf(withSegno, await allegroFlow(page, block));
  expect(added).toHaveLength(4);
  const fork = added.find(
    (item) => item.role === "jump" && JSON.stringify(item.coordinate) === "[1200,1]",
  );
  const second = added.find((item) => item.role === "jump_target");
  const gap = added.find((item) => item.role === "break");
  const end = added.find((item) => item.role === "jump" && item !== fork);
  const volta = {
    fork: fork?.id ?? "",
    second: second?.id ?? "",
    gap: gap?.id ?? "",
    end: end?.id ?? "",
  };
  expect(byId(added)).toEqual(
    byId([
      element(volta.fork, "jump", [1200, 1], {
        targets: [
          destination({ by: [0, 1], manifestation: "volta", passes: [1] }),
          destination({ to: volta.second, manifestation: "volta", passes: [2] }),
        ],
      }),
      element(volta.second, "jump_target", [1300, 1], { manifestation: "volta" }),
      element(volta.gap, "break", [1300, 1], { manifestation: "volta" }),
      element(volta.end, "jump", [1300, 1], {
        targets: [destination({ manifestation: "repeat_end", repeat_count: 1 })],
      }),
    ]),
  );
  await expect
    .poll(async () => byKey(await selection(page)))
    .toEqual(byKey(Object.values(volta).map((id) => ({ block, id }))));
  await expect.poll(() => drawnElements(page, block)).toBe(9);

  // One undo takes the whole volta set back, a second the dal segno al fine with its segno and Fine.
  await arranger(page).focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => entriesLength(page)).toBe(entries + 1);
  expect(await allegroFlow(page, block)).toEqual(withSegno);
  await expect.poll(() => drawnElements(page, block)).toBe(6);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => entriesLength(page)).toBe(entries);
  expect(await allegroFlow(page, block)).toEqual(original);
  await expect.poll(() => drawnElements(page, block)).toBe(3);
});
