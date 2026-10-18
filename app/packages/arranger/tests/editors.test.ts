import { describe, expect, it } from "vitest";
import type { Editing, Hit, Level, ResizedKind } from "../src/index.ts";
import {
  editedElement,
  editorTargetOf,
  GESTURES,
  gesturesOf,
  RESIZING,
  resizes,
  sameEditing,
} from "../src/index.ts";
import { A, B, changed, load, mixedView } from "./support.ts";

const view = changed(mixedView(), {
  type: "add",
  into: "workspace",
  block: { id: B, manifest: load("bare"), x: 600, y: 0 },
});

function hit(kind: Hit["kind"], address: string, block = A, within: string | null = null): Hit {
  return { block, kind, address, boundary: false, within, band: null };
}

/** An element hit at a point that the card or frame `within` holds. */
const inBox = (address: string, within: string) => hit("element", address, A, within);

const at = (element: string) => `${A}/${element}`;
const bundle: Editing = { target: A, kind: "bundle" };
const group: Editing = { target: at("group_1"), kind: "group" };

describe("editorTargetOf", () => {
  it.each([
    ["block", A, A],
    ["group", at("group_1"), at("group_1")],
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
    expect(editorTargetOf(view, hit("block", A), bundle)).toBeNull();
    expect(editorTargetOf(view, hit("group", at("group_1")), bundle)).toBe(at("group_1"));
    expect(editorTargetOf(view, hit("card", at("annotations/card")), bundle)).toBe(
      at("annotations"),
    );
    expect(editorTargetOf(view, hit("block", B, B), bundle)).toBeNull();
  });

  it("opens inside the group editor only what the group contains, never the group", () => {
    expect(editorTargetOf(view, hit("group", at("group_1")), group)).toBeNull();
    expect(editorTargetOf(view, hit("card", at("score/card")), group)).toBe(at("score"));
    expect(editorTargetOf(view, hit("element", at("performance")), group)).toBe(at("performance"));
    expect(editorTargetOf(view, hit("card", at("page/card")), group)).toBeNull();
    expect(editorTargetOf(view, hit("group", at("group_2")), group)).toBeNull();
    expect(editorTargetOf(view, hit("block", A), group)).toBeNull();
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
    expect(editorTargetOf(view, hit("block", "zzzzzzzzzz", "zzzzzzzzzz"), null)).toBeNull();
  });
});

describe("sameEditing and editedElement", () => {
  it("compares editors by target and kind", () => {
    expect(sameEditing(group, { target: at("group_1"), kind: "group" })).toBe(true);
    expect(sameEditing(null, null)).toBe(true);
    expect(sameEditing(group, null)).toBe(false);
    expect(sameEditing(null, bundle)).toBe(false);
    expect(sameEditing(group, bundle)).toBe(false);
    expect(sameEditing(group, { target: at("group_1"), kind: "timeline" })).toBe(false);
  });

  it("splits a target into its block and element", () => {
    expect(editedElement(at("group_1"))).toEqual({ block: A, element: "group_1" });
    expect(editedElement(A)).toEqual({ block: A, element: null });
  });
});

describe("GESTURES and gesturesOf", () => {
  it("is the permission table of the gestures besides resizing", () => {
    const row = (
      moveBlocks: boolean,
      moveItems: boolean,
      reorderMembers: boolean,
      moveBands: boolean,
      marquee: "blocks" | "elements",
    ) => ({ moveBlocks, moveItems, reorderMembers, moveBands, marquee });
    expect(GESTURES).toStrictEqual({
      arranger: row(true, false, false, false, "blocks"),
      bundle: row(false, true, false, false, "elements"),
      group: row(false, false, true, false, "elements"),
      timeline: row(false, false, false, true, "elements"),
    });
  });

  it("gives each level its row", () => {
    expect(gesturesOf(null)).toBe(GESTURES.arranger);
    expect(gesturesOf(bundle)).toBe(GESTURES.bundle);
    expect(gesturesOf(group)).toBe(GESTURES.group);
    expect(gesturesOf({ target: at("annotations"), kind: "timeline" })).toBe(GESTURES.timeline);
  });
});

describe("RESIZING and resizes", () => {
  it("is one table by box kind: where each kind resizes and what each mode writes", () => {
    const item = { scale: "item", box: "item", length: "item", spacing: "item" };
    expect(RESIZING).toStrictEqual({
      block: {
        levels: { arranger: "inside", bundle: "edited" },
        writes: { scale: "block", box: "block", length: "block", spacing: "block" },
      },
      frame: { levels: { arranger: "inside", bundle: "inside", group: "edited" }, writes: item },
      card: { levels: { arranger: "inside", bundle: "inside", timeline: "edited" }, writes: item },
      member: {
        levels: { arranger: "inside", bundle: "inside", group: "inside", timeline: "edited" },
        writes: { scale: "item", box: "card", length: "item", spacing: "card" },
      },
    });
  });

  it("resizes an inside box anywhere it reaches, the edited box only as its own", () => {
    const kinds: readonly ResizedKind[] = ["block", "frame", "card", "member"];
    const levels: readonly Level[] = ["arranger", "bundle", "group", "timeline"];
    const table = Object.fromEntries(
      kinds.map((kind) => [
        kind,
        Object.fromEntries(
          levels.map((level) => [level, [resizes(kind, level, false), resizes(kind, level, true)]]),
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
      member: { arranger: inside, bundle: inside, group: inside, timeline: edited },
    });
  });
});
