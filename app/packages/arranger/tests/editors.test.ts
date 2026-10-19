import type { DrawnBox } from "@timetoalign/tilie-layout";
import { describe, expect, it } from "vitest";
import type { Hit } from "../src/boxes.ts";
import { boxOf } from "../src/boxes.ts";
import type { Level, LevelRules } from "../src/containers.ts";
import { fieldsOf, LEVELS, resizeModes, resizes, resizingOf, rulesOf } from "../src/containers.ts";
import { drawingOf } from "../src/drawing.ts";
import type { Editing } from "../src/editing.ts";
import { addressParts, sameEditing } from "../src/editing.ts";
import { editorTargetOf } from "../src/editors.ts";
import { A, B, blockIn, changed, load, metrics, mixedView } from "./support.ts";

const view = changed(mixedView(), {
  type: "add",
  into: "workspace",
  block: { id: B, manifest: load("bare"), x: 600, y: 0 },
});
const drawing = drawingOf(blockIn(view, A), view.settings, metrics);

/** The container of block A's drawing at `element`, failing loudly when there is none. */
function box(element: string | null): DrawnBox {
  const found = boxOf(drawing, element);
  if (found === undefined) throw new Error(`${element} is no container of the drawing`);
  return found;
}

/** A hit of `kind` on `address`, at a point inside the frame or card `within` when given. */
function hit(kind: Hit["kind"], address: string, block = A, within: string | null = null): Hit {
  const { element } = addressParts(address);
  const container = block !== A || kind === "element" ? null : box(element);
  return {
    block,
    kind,
    address,
    box: container,
    boundary: false,
    within: within === null ? null : box(within),
  };
}
/** An element hit at a point that the card or frame `within` holds. */
const inBox = (address: string, within: string) => hit("element", address, A, within);

const at = (element: string) => `${A}/${element}`;
const bundle: Editing = { target: A, kind: "bundle" };
const group: Editing = { target: at("group_1"), kind: "group" };

describe("editorTargetOf", () => {
  it.each([
    ["box", A, A],
    ["frame", at("group_1"), at("group_1")],
    ["card", at("score/card"), at("score")],
    ["element", at("score"), at("score")],
    ["element", at("annotations"), at("annotations")],
    ["element", at("excerpt"), at("excerpt")],
    ["element", at("dlt_1"), at("dlt_1")],
    ["element", at("recording"), at("recording")],
    ["element", at("score/start"), null],
    ["element", at("score/name"), null],
    ["element", at("group_1/name"), null],
    ["element", at("name"), null],
  ] as const)("on the arranger, a %s hit on %s opens %s", (kind, address, target) => {
    expect(editorTargetOf(view, hit(kind, address), null)).toBe(target);
  });

  it.each([
    ["score/name", "score/card", at("score")],
    ["score/start", "score/card", at("score")],
    ["group_1/name", "group_1", at("group_1")],
    ["dlt_1", "excerpt/card", at("dlt_1")],
  ] as const)("on the arranger, %s within %s opens %s", (address, within, target) => {
    expect(editorTargetOf(view, inBox(at(address), within), null)).toBe(target);
  });

  it("opens inside the bundle editor anything of its block but the block", () => {
    expect(editorTargetOf(view, hit("box", A), bundle)).toBeNull();
    expect(editorTargetOf(view, hit("frame", at("group_1")), bundle)).toBe(at("group_1"));
    expect(editorTargetOf(view, hit("card", at("annotations/card")), bundle)).toBe(
      at("annotations"),
    );
    expect(editorTargetOf(view, hit("box", B, B), bundle)).toBeNull();
  });

  it("opens inside the group editor only what the group contains, never the group", () => {
    expect(editorTargetOf(view, hit("frame", at("group_1")), group)).toBeNull();
    expect(editorTargetOf(view, hit("card", at("score/card")), group)).toBe(at("score"));
    expect(editorTargetOf(view, hit("element", at("performance")), group)).toBe(at("performance"));
    expect(editorTargetOf(view, hit("card", at("page/card")), group)).toBeNull();
    expect(editorTargetOf(view, hit("frame", at("group_2")), group)).toBeNull();
    expect(editorTargetOf(view, hit("box", A), group)).toBeNull();
    expect(editorTargetOf(view, inBox(at("score/name"), "score/card"), group)).toBe(at("score"));
    expect(editorTargetOf(view, inBox(at("group_1/name"), "group_1"), group)).toBeNull();
    expect(editorTargetOf(view, inBox(at("page/name"), "page/card"), group)).toBeNull();
  });

  it("opens inside a timeline editor only what the timeline contains", () => {
    const excerpt: Editing = { target: at("excerpt"), kind: "timeline" };
    expect(editorTargetOf(view, hit("element", at("dlt_1")), excerpt)).toBe(at("dlt_1"));
    expect(editorTargetOf(view, hit("card", at("excerpt/card")), excerpt)).toBeNull();
    expect(editorTargetOf(view, hit("element", at("recording")), excerpt)).toBeNull();
    const child: Editing = { target: at("dlt_1"), kind: "timeline" };
    expect(editorTargetOf(view, hit("element", at("dlt_1")), child)).toBeNull();
  });

  it("opens nothing on a band", () => {
    const band = hit("band", at("excerpt/children_1"));
    expect(editorTargetOf(view, band, { target: at("excerpt"), kind: "timeline" })).toBeNull();
    expect(editorTargetOf(view, band, null)).toBeNull();
  });

  it("opens nothing in a block that does not exist", () => {
    expect(editorTargetOf(view, hit("box", "zzzzzzzzzz", "zzzzzzzzzz"), null)).toBeNull();
  });
});

describe("sameEditing", () => {
  it("compares editors by target and kind", () => {
    expect(sameEditing(group, { target: at("group_1"), kind: "group" })).toBe(true);
    expect(sameEditing(null, null)).toBe(true);
    expect(sameEditing(group, null)).toBe(false);
    expect(sameEditing(null, bundle)).toBe(false);
    expect(sameEditing(group, bundle)).toBe(false);
    expect(sameEditing(group, { target: at("group_1"), kind: "timeline" })).toBe(false);
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
    expect(rulesOf({ target: at("annotations"), kind: "timeline" }, free)).toBe(LEVELS.timeline);
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
    expect(rulesOf({ target: at("excerpt"), kind: "timeline" }, locked)).toStrictEqual({
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
    box: box(null),
    frame: box("group_1"),
    card: box("annotations/card"),
    held: box("score/card"),
  };

  it("reads one row per kind of container, a held card's beside the card's", () => {
    const item = { scale: "item", box: "item", length: "item", spacing: "item" };
    expect(resizingOf(boxes.box)).toStrictEqual({
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
    expect(resizingOf(box("excerpt/children_1")).levels).toStrictEqual({});
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
      box: { arranger: inside, bundle: edited, group: never, timeline: never },
      frame: { arranger: inside, bundle: inside, group: edited, timeline: never },
      card: { arranger: inside, bundle: inside, group: never, timeline: edited },
      held: { arranger: inside, bundle: inside, group: inside, timeline: edited },
    });
  });

  it("offers the three modes wherever a container resizes, none elsewhere", () => {
    expect(resizeModes(boxes.held, "group")).toEqual(["scale", "box", "stretch"]);
    expect(resizeModes(boxes.box, "group")).toEqual([]);
    expect(resizeModes(box("excerpt/children_1"), "timeline")).toEqual([]);
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
      box: { arranger: block, bundle: block, group: fixedOff, timeline: fixedOff },
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
    expect(fieldsOf(box("excerpt/children_1"), "timeline")).toEqual([]);
  });
});
