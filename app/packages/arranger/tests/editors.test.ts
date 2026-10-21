import type { Address, ElementAddress, PlaceKey } from "@timetoalign/tilie-core";
import {
  BUNDLE_ADDRESS,
  bandAddress,
  cardAddress,
  idAddress,
  inBlock,
  partAddress,
  TITLE_ADDRESS,
  WORKSPACE,
} from "@timetoalign/tilie-core";
import type { DrawnBox } from "@timetoalign/tilie-layout";
import { describe, expect, it } from "vitest";
import type { Hit } from "../src/boxes.ts";
import { boxOf, keyedBox } from "../src/boxes.ts";
import type { Level, LevelRules } from "../src/containers.ts";
import { fieldsOf, LEVELS, resizeModes, resizes, resizingOf, rulesOf } from "../src/containers.ts";
import { drawingOf } from "../src/drawing.ts";
import type { Editing } from "../src/editing.ts";
import { addressParts, sameEditing } from "../src/editing.ts";
import { editorTargetOf } from "../src/editors.ts";
import { A, B, blockIn, changed, load, metrics, mixedView } from "./support.ts";

const view = changed(mixedView(), {
  type: "add",
  into: WORKSPACE,
  block: { id: B, manifest: load("bare"), x: 600, y: 0 },
});
const drawing = drawingOf(blockIn(view, A), view.settings, metrics);

/** The container of block A's drawing at `element`, failing loudly when there is none. */
function box(element: ElementAddress): DrawnBox {
  const found = boxOf(drawing, element);
  if (found === undefined) throw new Error(`${JSON.stringify(element)} is no container`);
  return found;
}

/** The frame or card of block A's drawing under the place key `key`. */
function keyed(key: PlaceKey): DrawnBox {
  const found = keyedBox(drawing, key);
  if (found === undefined) throw new Error(`${JSON.stringify(key)} is no frame or card`);
  return found;
}

/** A hit of `kind` on `address`, at a point inside the frame or card under `within` when given. */
function hit(kind: Hit["kind"], address: Address, within: PlaceKey | null = null): Hit {
  const { block, element } = addressParts(address);
  const container = block !== A || kind === "element" ? null : box(element ?? BUNDLE_ADDRESS);
  return {
    block,
    kind,
    address,
    box: container,
    boundary: false,
    within: within === null ? null : keyed(within),
  };
}
/** An element hit at a point that the card or frame under `within` holds. */
const inBox = (address: Address, within: PlaceKey) => hit("element", address, within);

/** The element `element` of block A. */
const at = (element: ElementAddress): Address => inBlock(A, element);
/** The element with the ID `id` of block A: a timeline's line, a group. */
const id = (element: string): Address => at(idAddress(element));
/** The part `words` of the element `owner` of block A. */
const part = (owner: string, ...words: ("start" | "name")[]): Address =>
  at(words.reduce(partAddress, idAddress(owner)));
/** The cards of `timeline` in block A. */
const card = (timeline: string): Address => at(cardAddress(timeline));

const scoreCard: PlaceKey = { item: "group_1", member: "score" };
const bundle: Editing = { target: { block: A }, kind: "bundle" };
const group: Editing = { target: id("group_1"), kind: "group" };
const timeline = (element: string): Editing => ({ target: id(element), kind: "timeline" });

describe("editorTargetOf", () => {
  it.each([
    ["block", { block: A }, { block: A }],
    ["frame", id("group_1"), id("group_1")],
    ["card", card("score"), id("score")],
    ["element", id("score"), id("score")],
    ["element", id("annotations"), id("annotations")],
    ["element", id("excerpt"), id("excerpt")],
    ["element", id("dlt_1"), id("dlt_1")],
    ["element", id("recording"), id("recording")],
    ["element", part("score", "start"), null],
    ["element", part("score", "name"), null],
    ["element", part("group_1", "name"), null],
    ["element", at(TITLE_ADDRESS), null],
  ] as const)("on the arranger, a %s hit on %j opens %j", (kind, address, target) => {
    expect(editorTargetOf(view, hit(kind, address), null)).toEqual(target);
  });

  it.each([
    [part("score", "name"), scoreCard, id("score")],
    [part("score", "start"), scoreCard, id("score")],
    [part("group_1", "name"), { item: "group_1" }, id("group_1")],
    [id("dlt_1"), { item: "group_2", member: "excerpt" }, id("dlt_1")],
  ] as const)("on the arranger, %j within %j opens %j", (address, within, target) => {
    expect(editorTargetOf(view, inBox(address, within), null)).toEqual(target);
  });

  it("opens inside the bundle editor anything of its block but the block", () => {
    expect(editorTargetOf(view, hit("block", { block: A }), bundle)).toBeNull();
    expect(editorTargetOf(view, hit("frame", id("group_1")), bundle)).toEqual(id("group_1"));
    expect(editorTargetOf(view, hit("card", card("annotations")), bundle)).toEqual(
      id("annotations"),
    );
    expect(editorTargetOf(view, hit("block", { block: B }), bundle)).toBeNull();
  });

  it("opens inside the group editor only what the group contains, never the group", () => {
    expect(editorTargetOf(view, hit("frame", id("group_1")), group)).toBeNull();
    expect(editorTargetOf(view, hit("card", card("score")), group)).toEqual(id("score"));
    expect(editorTargetOf(view, hit("element", id("performance")), group)).toEqual(
      id("performance"),
    );
    expect(editorTargetOf(view, hit("card", card("page")), group)).toBeNull();
    expect(editorTargetOf(view, hit("frame", id("group_2")), group)).toBeNull();
    expect(editorTargetOf(view, hit("block", { block: A }), group)).toBeNull();
    expect(editorTargetOf(view, inBox(part("score", "name"), scoreCard), group)).toEqual(
      id("score"),
    );
    expect(
      editorTargetOf(view, inBox(part("group_1", "name"), { item: "group_1" }), group),
    ).toBeNull();
    expect(
      editorTargetOf(view, inBox(part("page", "name"), { item: "group_2", member: "page" }), group),
    ).toBeNull();
  });

  it("opens inside a timeline editor only what the timeline contains", () => {
    const excerpt = timeline("excerpt");
    expect(editorTargetOf(view, hit("element", id("dlt_1")), excerpt)).toEqual(id("dlt_1"));
    expect(editorTargetOf(view, hit("card", card("excerpt")), excerpt)).toBeNull();
    expect(editorTargetOf(view, hit("element", id("recording")), excerpt)).toBeNull();
    expect(editorTargetOf(view, hit("element", id("dlt_1")), timeline("dlt_1"))).toBeNull();
  });

  it("opens nothing on a band", () => {
    const band = hit("band", at(bandAddress("excerpt", "children")));
    expect(editorTargetOf(view, band, timeline("excerpt"))).toBeNull();
    expect(editorTargetOf(view, band, null)).toBeNull();
  });

  it("opens nothing in a block that does not exist", () => {
    expect(editorTargetOf(view, hit("block", { block: "zzzzzzzzzz" }), null)).toBeNull();
  });
});

describe("sameEditing", () => {
  it("compares editors by target and kind", () => {
    expect(sameEditing(group, { target: inBlock(A, idAddress("group_1")), kind: "group" })).toBe(
      true,
    );
    expect(sameEditing(null, null)).toBe(true);
    expect(sameEditing(group, null)).toBe(false);
    expect(sameEditing(null, bundle)).toBe(false);
    expect(sameEditing(group, bundle)).toBe(false);
    expect(sameEditing(group, { target: id("group_1"), kind: "timeline" })).toBe(false);
  });
});

describe("LEVELS and rulesOf", () => {
  const row = (
    move: boolean,
    nudge: boolean,
    reorder: boolean,
    bands: boolean,
    marquee: "blocks" | "elements",
    itemsFree: boolean,
    frameWidthPinned: boolean,
    order: boolean,
  ): LevelRules => ({
    move,
    nudge,
    reorder,
    bands,
    marquee,
    itemsFree,
    frameWidthPinned,
    remove: true,
    order,
    open: true,
    lock: true,
    resize: true,
  });

  it("is one row of rules per level", () => {
    expect(LEVELS).toStrictEqual({
      arranger: row(true, true, false, false, "blocks", true, false, true),
      bundle: row(true, false, false, false, "elements", true, false, false),
      group: row(false, false, true, false, "elements", false, true, false),
      timeline: row(false, false, false, true, "elements", false, false, false),
    });
  });

  const free = { locked: false, readonly: false };

  it("gives the innermost editor's row, the arranger's without one", () => {
    expect(rulesOf(null, free)).toBe(LEVELS.arranger);
    expect(rulesOf(bundle, free)).toBe(LEVELS.bundle);
    expect(rulesOf(group, free)).toBe(LEVELS.group);
    expect(rulesOf(timeline("annotations"), free)).toBe(LEVELS.timeline);
  });

  it("resizes at every level of a free canvas", () => {
    for (const rules of Object.values(LEVELS)) expect(rules.resize).toBe(true);
  });

  it("nudges by key on the arranger alone", () => {
    expect(
      Object.entries(LEVELS).flatMap(([level, rules]) => (rules.nudge ? [level] : [])),
    ).toEqual(["arranger"]);
  });

  it("moves and nudges nothing, no band and resizes nothing on a locked canvas, and keeps everything else", () => {
    const locked = { locked: true, readonly: false };
    expect(rulesOf(null, locked)).toStrictEqual({
      ...LEVELS.arranger,
      move: false,
      nudge: false,
      resize: false,
    });
    expect(rulesOf(bundle, locked)).toStrictEqual({ ...LEVELS.bundle, move: false, resize: false });
    expect(rulesOf(timeline("excerpt"), locked)).toStrictEqual({
      ...LEVELS.timeline,
      bands: false,
      resize: false,
    });
    expect(rulesOf(group, locked)).toStrictEqual({ ...LEVELS.group, resize: false });
  });

  it("writes nothing on a read-only canvas: no gesture, no resize, no removal, no editor, no lock", () => {
    const none = {
      move: false,
      nudge: false,
      reorder: false,
      bands: false,
      remove: false,
      order: false,
      open: false,
      lock: false,
      resize: false,
    };
    for (const locked of [false, true]) {
      expect(rulesOf(null, { locked, readonly: true })).toStrictEqual({
        ...LEVELS.arranger,
        ...none,
      });
      expect(rulesOf(group, { locked, readonly: true })).toStrictEqual({
        ...LEVELS.group,
        ...none,
      });
    }
  });
});

describe("resizingOf and resizes", () => {
  const boxes = {
    block: box(BUNDLE_ADDRESS),
    frame: keyed({ item: "group_1" }),
    card: keyed({ item: "annotations" }),
    held: keyed(scoreCard),
  };

  it("reads one row per kind of container, a held card's beside the card's", () => {
    const item = { scale: "item", box: "item", length: "item", spacing: "item" };
    expect(resizingOf(boxes.block)).toStrictEqual({
      levels: { arranger: "inside", bundle: "edited" },
      writes: { scale: "block", box: "block", length: "block", spacing: "block" },
    });
    expect(resizingOf(boxes.frame)).toStrictEqual({
      levels: { arranger: "inside", bundle: "inside", group: "edited" },
      writes: item,
    });
    expect(resizingOf(boxes.card)).toStrictEqual({
      levels: { arranger: "inside", bundle: "inside", timeline: "edited" },
      writes: item,
    });
    expect(resizingOf(boxes.held)).toStrictEqual({
      levels: { arranger: "inside", bundle: "inside", group: "inside", timeline: "edited" },
      writes: { scale: "item", box: "own", length: "item", spacing: "own" },
    });
    expect(resizingOf(box(bandAddress("excerpt", "children"))).levels).toStrictEqual({});
  });

  it("resizes an inside container anywhere it reaches, the edited one only as its own", () => {
    const levels: readonly Level[] = ["arranger", "bundle", "group", "timeline"];
    const table = Object.fromEntries(
      Object.entries(boxes).map(([name, resized]) => [
        name,
        Object.fromEntries(
          levels.map((level) => [
            level,
            [resizes(resized, level, false), resizes(resized, level, true)],
          ]),
        ),
      ]),
    );
    const inside = [true, true];
    const edited = [false, true];
    const never = [false, false];
    expect(table).toStrictEqual({
      block: { arranger: inside, bundle: edited, group: never, timeline: never },
      frame: { arranger: inside, bundle: inside, group: edited, timeline: never },
      card: { arranger: inside, bundle: inside, group: never, timeline: edited },
      held: { arranger: inside, bundle: inside, group: inside, timeline: edited },
    });
  });

  it("offers the three modes wherever a container resizes, none elsewhere", () => {
    expect(resizeModes(boxes.held, "group")).toEqual(["scale", "box", "stretch"]);
    expect(resizeModes(boxes.block, "group")).toEqual([]);
    expect(resizeModes(box(bandAddress("excerpt", "children")), "timeline")).toEqual([]);
  });

  it("lists each container's place members per level: whose they are and whether the level edits them", () => {
    const levels: readonly Level[] = ["arranger", "bundle", "group", "timeline"];
    /** `<member> <written>`, marked `-` where the level does not edit it. */
    const table = Object.fromEntries(
      Object.entries(boxes).map(([name, placed]) => [
        name,
        Object.fromEntries(
          levels.map((level) => [
            level,
            fieldsOf(placed, level).map(
              ({ property, offered, written }) => `${offered ? "" : "-"}${property} ${written}`,
            ),
          ]),
        ),
      ]),
    );
    const all = (written: string) =>
      ["x", "y", "length", "scale", "spacing", "width", "height"].map(
        (member) => `${member} ${written}`,
      );
    const block = all("block");
    const fixedOff = ["x", "y", "-length", "-scale", "-spacing", "width", "height"].map(
      (member) => `${member} block`,
    );
    const item = all("item");
    const unmoved = ["-x", "-y", "length", "scale", "spacing", "width", "height"].map(
      (member) => `${member} item`,
    );
    const held = ["length item", "scale item", "spacing own", "width own", "height own"];
    expect(table).toStrictEqual({
      block: { arranger: block, bundle: block, group: fixedOff, timeline: fixedOff },
      frame: {
        arranger: unmoved,
        bundle: item,
        group: unmoved,
        timeline: unmoved.map((field) => (field.startsWith("-") ? field : `-${field}`)),
      },
      card: {
        arranger: unmoved,
        bundle: item,
        group: unmoved.map((field) => (field.startsWith("-") ? field : `-${field}`)),
        timeline: unmoved,
      },
      held: { arranger: held, bundle: held, group: held, timeline: held },
    });
    expect(fieldsOf(box(bandAddress("excerpt", "children")), "timeline")).toEqual([]);
  });
});
