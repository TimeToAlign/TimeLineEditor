import { type ElementAddress, type Manifest, sameAddress } from "@timetoalign/tilie-core";
import { fontMetrics as metrics } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { placedAt } from "../src/canvas.ts";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  type DrawnElement,
  draw,
  manifestLayer,
  type Placement,
} from "../src/index.ts";
import { at, BLOCK, boxAt, edit, element, loadFile } from "./support.ts";

const MARGIN = 12;

function drawn(manifest: Manifest, changes: Partial<Placement> = {}): Drawing {
  return draw(
    manifest,
    { ...DEFAULT_PLACEMENT, ...changes },
    [DEFAULT_LAYER, manifestLayer(manifest)],
    metrics,
  );
}

/** `bare` as the one member of a group `g`, built through `add group`. */
const grouped = edit("bare", {
  type: "add",
  into: { block: BLOCK },
  group: { id: "g", members: ["bare"] },
});

/** The elements of a drawing that `range` of the box at `address` holds, its own rectangle first. */
function inside(drawing: Drawing, address: ElementAddress, index = 0): DrawnElement[] {
  const box = drawing.boxes.filter((item) => sameAddress(item.address, address))[index];
  if (box === undefined) throw new Error(`no box ${JSON.stringify(address)}`);
  return drawing.elements.slice(box.range.start, box.range.end);
}

/** `elements` moved down by `dy`. */
const moved = (elements: readonly DrawnElement[], dy: number) =>
  elements.map((item) => placedAt(item, 0, dy));

/** The rectangle of the frame or card element at `address`. */
function rect(drawing: Drawing, address: ElementAddress) {
  const found = element(drawing, address);
  if (found.type !== "frame" && found.type !== "card") throw new Error(`${found.type} is no rect`);
  return { x: found.x, y: found.y, width: found.width, height: found.height };
}

/** The rectangle `before` 24 higher. */
const taller = (before: ReturnType<typeof rect>) => ({
  ...before,
  height: before.height + 2 * MARGIN,
});

describe("a block's margin", () => {
  const manifest = loadFile("bare");
  const before = drawn(manifest);
  const after = drawn(manifest, { margin: MARGIN });

  it("makes a block of one item exactly twice the margin higher, as wide", () => {
    expect([before.width, before.height]).toEqual([476.5771484375, 67.37890625]);
    expect([after.width, after.height]).toEqual([476.5771484375, 91.37890625]);
    expect(after.origin).toEqual({ x: 0, y: 0 });
    expect(boxAt(after, {}).contentCount).toBe(1);
  });

  it("moves its item and everything in it exactly the margin down", () => {
    expect(after.elements.slice(1)).toEqual(moved(before.elements.slice(1), MARGIN));
    expect(boxAt(after, at("bare", "card")).y).toBe(20);
    expect(element(after, at("bare"))).toMatchObject({ y: 34.40234375 });
  });
});

describe("a frame's margin", () => {
  const before = drawn(grouped);
  const after = drawn(grouped, { places: { g: { margin: MARGIN } } });

  it("makes a frame of one card exactly twice the margin higher, its title kept", () => {
    expect(rect(after, at("g"))).toEqual(taller(rect(before, at("g"))));
    expect(element(after, at("g", "name"))).toEqual(element(before, at("g", "name")));
    expect([after.width, after.height]).toEqual([before.width, before.height + 2 * MARGIN]);
    expect(boxAt(after, at("g")).contentCount).toBe(1);
  });

  it("moves its card and everything in it exactly the margin down", () => {
    const card = at("bare", "card");
    expect(inside(after, card)).toEqual(moved(inside(before, card), MARGIN));
  });
});

describe("a card's margin", () => {
  it("makes a block-held card of one row twice the margin higher, its contents the margin lower", () => {
    const manifest = loadFile("bare");
    const before = drawn(manifest);
    const after = drawn(manifest, { places: { bare: { margin: MARGIN } } });
    const card = at("bare", "card");
    expect(rect(after, card)).toEqual({ x: 8, y: 8, width: 458.5771484375, height: 73.37890625 });
    expect(inside(after, card).slice(1)).toEqual(moved(inside(before, card).slice(1), MARGIN));
    expect(element(after, at("bare"))).toMatchObject({ y: 34.40234375 });
    expect([after.width, after.height]).toEqual([476.5771484375, 91.37890625]);
    expect(boxAt(after, card)).toMatchObject({ contentCount: 2, card: { margin: MARGIN } });
  });

  it("makes a member's card and its frame twice the margin higher, the frame's title kept", () => {
    const before = drawn(grouped);
    const after = drawn(grouped, { places: { g: { cards: { bare: { margin: MARGIN } } } } });
    const card = at("bare", "card");
    expect(rect(after, card)).toEqual(taller(rect(before, card)));
    expect(rect(after, at("g"))).toEqual(taller(rect(before, at("g"))));
    expect(element(after, at("g", "name"))).toEqual(element(before, at("g", "name")));
    expect(inside(after, card).slice(1)).toEqual(moved(inside(before, card).slice(1), MARGIN));
    expect([after.width, after.height]).toEqual([before.width, before.height + 2 * MARGIN]);
  });

  it("moves a member's ancestor lines with it, and the cards below by twice the margin", () => {
    const manifest = loadFile("groups/group_child_member");
    const before = drawn(manifest);
    const after = drawn(manifest, {
      places: { group_1: { cards: { "second-half": { margin: MARGIN } } } },
    });
    const half = at("second-half", "card");
    const recording = at("recording", "card");
    expect(rect(after, half).height).toBe(107.953125);
    expect(inside(after, half).slice(1)).toEqual(moved(inside(before, half).slice(1), MARGIN));
    expect(inside(after, half).some((item) => item.type === "ancestor")).toBe(true);
    expect(inside(after, recording)).toEqual(moved(inside(before, recording), 2 * MARGIN));
    expect([rect(before, recording).y, rect(after, recording).y]).toEqual([
      124.7578125, 148.7578125,
    ]);
    expect([rect(before, at("group_1")).height, rect(after, at("group_1")).height]).toEqual([
      174.13671875, 198.13671875,
    ]);
    expect(boxAt(after, half)).toMatchObject({ contentCount: 3, card: { margin: MARGIN } });
  });

  it("moves the root's flow markers with the card's contents", () => {
    const manifest = loadFile("flow_control");
    const before = drawn(manifest);
    const after = drawn(manifest, { places: { "flow:quarters": { margin: MARGIN } } });
    const card = at("flow:quarters", "card");
    const markers = (drawing: Drawing) =>
      inside(drawing, card).filter((item) => item.type === "flow_marker");
    expect(markers(after).length).toBe(1);
    expect(markers(after)).toEqual(moved(markers(before), MARGIN));
    expect(rect(after, card)).toEqual(taller(rect(before, card)));
  });
});

describe("a margin of 0", () => {
  it("draws as no margin stated", () => {
    const manifest = loadFile("bundles/bundle_mixed");
    const zero = { margin: 0 };
    const stated = drawn(manifest, {
      margin: 0,
      places: {
        group_1: { ...zero, cards: { score: zero, performance: zero } },
        group_2: { ...zero, cards: { page: zero, excerpt: zero } },
        annotations: zero,
        recording: zero,
      },
    });
    const none = drawn(manifest);
    expect(stated.elements).toEqual(none.elements);
    expect([stated.width, stated.height]).toEqual([none.width, none.height]);
  });
});
