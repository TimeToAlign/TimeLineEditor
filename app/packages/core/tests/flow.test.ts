import { dumps, loads } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { apply } from "../src/commands/apply.ts";
import { assertNever } from "../src/errors.ts";
import { idAddress } from "../src/manifest/address.ts";
import { manifestElements, memberFlow } from "../src/manifest/elements.ts";
import { memberDrawings } from "../src/manifest/files.ts";
import {
  destinationPlace,
  FLOW_LINE_ROLES,
  flowSymbols,
  isRejected,
  passesText,
  withElementBelief,
} from "../src/manifest/flow.ts";
import { loadManifest, saveManifest } from "../src/manifest/io.ts";
import { removedBy } from "../src/manifest/remove.ts";
import { findTimeline } from "../src/manifest/tree.ts";
import type { FlowControlElement, Manifest, TimelineManifest } from "../src/manifest/types.ts";
import { axisCoordinate } from "../src/number/coordinate.ts";
import { addressWords, manifestIds, resolveElement } from "../src/workspace/address.ts";
import type { View } from "../src/workspace/view.ts";
import {
  A,
  allFixtures,
  at,
  changed,
  fileText,
  key,
  load,
  loadText,
  manifestValue,
  viewOf,
} from "./support.ts";

const FLOW = allFixtures.filter((fixture) => fixture.name.startsWith("flow/"));
const COMPLETE = { minimal: false } as const;

const manifestOf = (view: View): Manifest => {
  const manifest = view.blocks[A]?.manifest;
  if (manifest === undefined) throw new Error("block A holds a manifest");
  return manifest;
};

const rename = (name: string | null) => ({
  type: "set",
  changes: [{ target: { block: A }, values: { name } }],
});

/** The flow-control element `id` of the first root of a fixture. */
function element(name: string, id: string): FlowControlElement {
  const found = load(name).timelines[0]?.flow_control.find((item) => item.id === id);
  if (found === undefined) throw new Error(`${name} holds no flow-control element ${id}`);
  return found;
}

const refusal = (view: View, command: object) => {
  const result = apply(view, command);
  return "code" in result ? { code: result.code, path: result.path } : null;
};

describe("the flow fixtures", () => {
  it("are the ten of the schema version", () => {
    expect(FLOW.map((fixture) => fixture.name)).toEqual([
      "flow/da_capo_al_fine.yaml",
      "flow/dal_segno_al_coda.yaml",
      "flow/flow_map_by_hand.yaml",
      "flow/loop.yaml",
      "flow/ossia.yaml",
      "flow/repairs.yaml",
      "flow/repeat_end_and_dal_segno.yaml",
      "flow/sections.yaml",
      "flow/sonata_exposition.yaml",
      "flow/volta_passes.yaml",
    ]);
  });

  it.each(FLOW.map((fixture) => [fixture.name, fixture.text, fixture.twin] as const))(
    "%s is written as it came after an edit of something else",
    (name, text, twin) => {
      const view = viewOf([A, name]);
      const original = manifestOf(view).name;
      const edited = changed(view, rename("Edited"));
      const file = loads(text) as { readonly [key: string]: unknown };
      expect(saveManifest(manifestOf(edited), COMPLETE)).toBe(dumps({ ...file, name: "Edited" }));
      const back = changed(edited, rename(original));
      expect(saveManifest(manifestOf(back), COMPLETE)).toBe(text);
      expect(saveManifest(manifestOf(back))).toBe(twin);
    },
  );
});

describe("the drawn elements of flow control", () => {
  const drawn = (name: string) =>
    manifestElements(load(name))
      .filter((item) => item.inside.at(-1) === "band" && item.address.facet === undefined)
      .filter((item) => !["label", "region", "symbol"].includes(item.type ?? ""))
      .map((item) => [item.type, item.address.id]);

  it("names the roles drawn as lines", () => {
    expect(FLOW_LINE_ROLES).toEqual(["break", "section_break", "barline"]);
  });

  it("lists the lines in canonical order, then the jumps, and no jump target", () => {
    expect(drawn("flow/sections.yaml")).toEqual([
      ["break", "break_1"],
      ["section_break", "section_break_1"],
      ["jump", "jump_1"],
      ["jump", "jump_2"],
    ]);
    expect(drawn("flow/repairs.yaml")).toEqual([
      ["barline", "barline_1"],
      ["jump", "jump_1"],
      ["jump", "jump_2"],
    ]);
    expect(drawn("flow/sonata_exposition.yaml")).toEqual([
      ["break", "break_1"],
      ["jump", "jump_1"],
      ["jump", "jump_2"],
    ]);
  });

  it("gives every drawn one the labels of its stack, whatever its role", () => {
    const labels = manifestElements(load("flow/sections.yaml"))
      .filter((item) => item.type === "label" && item.inside.at(-1) !== "band")
      .map((item) => [item.inside.at(-1), item.address]);
    expect(labels).toEqual([
      ["break", { id: "break_1", part: ["id"] }],
      ["break", { id: "break_1", part: ["label"] }],
      ["section_break", { id: "section_break_1", part: ["id"] }],
      ["jump", { id: "jump_1", part: ["id"] }],
      ["jump", { id: "jump_1", part: ["label"] }],
      ["jump", { id: "jump_2", part: ["id"] }],
      ["jump", { id: "jump_2", part: ["label"] }],
    ]);
  });

  it("lists the symbols and the forks, a jump target's held by the band", () => {
    const parts = (name: string) =>
      manifestElements(load(name))
        .filter((item) => item.type === "symbol" || item.type === "fork")
        .map((item) => [item.type, item.address, item.inside.at(-1)]);
    const part = (id: string, word: "symbol" | "fork") => ({ id, part: [word] });
    expect(parts("flow/sections.yaml")).toEqual([
      ["symbol", part("break_1", "symbol"), "break"],
      ["symbol", part("section_break_1", "symbol"), "section_break"],
      ["symbol", part("jump_1", "symbol"), "jump"],
      ["symbol", part("jump_2", "symbol"), "jump"],
    ]);
    expect(parts("flow/sonata_exposition.yaml")).toEqual([
      ["fork", part("jump_1", "fork"), "jump"],
      ["symbol", part("jump_2", "symbol"), "jump"],
    ]);
    expect(parts("flow/repairs.yaml")).toEqual([
      ["symbol", part("barline_1", "symbol"), "barline"],
      ["symbol", part("jump_1", "symbol"), "jump"],
      ["symbol", part("jump_2", "symbol"), "jump"],
      ["symbol", part("jump_target_1", "symbol"), "band"],
    ]);
  });

  it("words an element by its role, in a workspace of one block", () => {
    const sections = viewOf([A, "flow/sections.yaml"]);
    const repairs = viewOf([A, "flow/repairs.yaml"]);
    expect(
      ["break_1", "section_break_1", "jump_1"].map((id) => addressWords(sections, at(id))),
    ).toEqual(["break 'break_1'", "section break 'section_break_1'", "jump 'jump_1'"]);
    expect(["barline_1", "jump_target_1"].map((id) => addressWords(repairs, at(id)))).toEqual([
      "barline 'barline_1'",
      "jump target 'jump_target_1'",
    ]);
  });
});

describe("FlowMaps and virtual timelines", () => {
  const SONATA = "flow/sonata_exposition.yaml";

  it("hold IDs of the manifest that name nothing drawn", () => {
    const manifest = load(SONATA);
    const ids = manifestIds(manifest);
    for (const id of ["flow_map_1", "flow_map_2", "flow_map_3", "virtual_1"]) {
      expect(ids.has(id)).toBe(true);
      expect(resolveElement(manifest, idAddress(id))).toBeUndefined();
    }
  });

  it("refuse their IDs to an added element", () => {
    const view = viewOf([A, SONATA]);
    for (const id of ["flow_map_1", "virtual_1"]) {
      const region = { id, start: [0, 1], end: [1, 1] };
      expect(refusal(view, { type: "add", into: at("score"), region })).toEqual({
        code: "duplicate_id",
        path: [key(at("score")), "region", "id"],
      });
    }
  });

  it("go with the root timeline they belong to", () => {
    const manifest = load(SONATA);
    expect([...removedBy(manifest, ["score"])].sort()).toEqual([
      "break_1",
      "flow_map_1",
      "flow_map_2",
      "flow_map_3",
      "jump_1",
      "jump_2",
      "jump_target_1",
      "region_1",
      "region_2",
      "region_3",
      "score",
      "virtual_1",
    ]);
    const emptied = manifestOf(
      changed(viewOf([A, SONATA]), { type: "remove", targets: [at("score")] }),
    );
    expect(emptied.timelines).toEqual([]);
    expect(emptied.flow_maps).toEqual([]);
    expect(emptied.virtual_timelines).toEqual([]);
  });

  it("stay away from a manifest that states none", () => {
    const emptied = manifestOf(
      changed(viewOf([A, "flow/sections.yaml"]), { type: "remove", targets: [at("score")] }),
    );
    expect(Object.hasOwn(emptied, "flow_maps")).toBe(false);
    expect(Object.hasOwn(emptied, "virtual_timelines")).toBe(false);
  });

  it("refuse the removal of a region a FlowMap lists", () => {
    const view = viewOf([A, SONATA]);
    expect(refusal(view, { type: "remove", targets: [at("region_2")] })).toEqual({
      code: "schema_violation",
      path: [A, "manifest", "flow_maps", 0, "chunks", 1],
    });
  });
});

describe("a virtual timeline", () => {
  const SONATA = "flow/sonata_exposition.yaml";

  it("is held to the sum of the chunks of the FlowMap it applies, when a command changes one", () => {
    // region_3, the section C of 8 quarters, shortened to 4: A, B, A, C then sum to 32, not 36.
    const shortened = {
      type: "set",
      changes: [{ target: at("region_3"), values: { start: [20, 1] } }],
    };
    expect(apply(viewOf([A, SONATA]), shortened)).toEqual({
      code: "schema_violation",
      message:
        "length [36, 1] of 'virtual_1' is not the sum of the chunks and gaps of 'flow_map_1', [32, 1]",
      path: [A, "manifest", "virtual_timelines", 0, "length"],
    });
  });

  it("is held to it when a manifest is read", () => {
    const text = FLOW.find((fixture) => fixture.name === SONATA)?.text ?? "";
    expect(text.split("length: [36, 1]").length).toBe(2);
    expect(loadManifest(text.replace("length: [36, 1]", "length: [30, 1]"))).toEqual({
      problems: [
        {
          code: "schema_violation",
          message:
            "length [30, 1] of 'virtual_1' is not the sum of the chunks and gaps of 'flow_map_1', [36, 1]",
          path: ["virtual_timelines", 0, "length"],
        },
      ],
    });
  });
});

describe("a rejected element", () => {
  it("is one an entry of whose provenance holds a belief false", () => {
    const rejected = ["barline_1", "jump_target_1", "jump_1", "jump_2"].map((id) =>
      isRejected(element("flow/repairs.yaml", id)),
    );
    expect(rejected).toEqual([false, false, true, false]);
    expect(isRejected({})).toBe(false);
    expect(
      isRejected({
        provenance: [
          { method: "imported" },
          { beliefs: [{ actor: "a:b", belief: "unlikely", date: "2026-11-25" }] },
        ],
      }),
    ).toBe(false);
    expect(
      isRejected({
        provenance: [
          { method: "imported" },
          {
            beliefs: [
              { actor: "a:b", belief: "true", date: "2026-11-25" },
              { actor: "a:c", belief: "false", date: "2026-11-25" },
            ],
          },
        ],
      }),
    ).toBe(true);
  });
});

describe("a belief recorded in an element", () => {
  const EDITOR = "https://example.org/people/editor";
  const CONTEXT = { ex: "https://example.org/people/" };
  const mine = { actor: EDITOR, belief: "false", date: "2026-11-26" } as const;
  const other = {
    actor: "https://example.org/people/other",
    belief: "true",
    date: "2026-11-25",
  } as const;

  it("makes the one entry of an element that has no provenance", () => {
    expect(withElementBelief(undefined, null, mine)).toEqual([{ beliefs: [mine] }]);
  });

  it("joins the first entry where the actor holds none", () => {
    expect(
      withElementBelief(
        [{ method: "imported" }, { method: "manual", beliefs: [other] }],
        null,
        mine,
      ),
    ).toEqual([
      { method: "imported", beliefs: [mine] },
      { method: "manual", beliefs: [other] },
    ]);
    expect(withElementBelief([{ method: "manual", beliefs: [other] }], null, mine)).toEqual([
      { method: "manual", beliefs: [other, mine] },
    ]);
  });

  it("replaces the actor's own in place, the actor compared by the IRI it stands for", () => {
    const earlier = {
      actor: "ex:editor",
      belief: "true",
      date: "2026-11-25",
      note: "as printed",
    } as const;
    const provenance = [
      { method: "imported" },
      { method: "manual", beliefs: [other, earlier] },
    ] as const;
    expect(withElementBelief(provenance, CONTEXT, mine)).toEqual([
      { method: "imported" },
      { method: "manual", beliefs: [other, mine] },
    ]);
    // Without the prefix the compact IRI is another actor.
    expect(withElementBelief(provenance, null, mine)).toEqual([
      { method: "imported", beliefs: [mine] },
      { method: "manual", beliefs: [other, earlier] },
    ]);
  });
});

describe("a belief set in an element", () => {
  const EDITOR = "https://example.org/people/editor";
  const OTHER = "https://example.org/people/other";
  const DAY = "2026-11-26";
  const REPAIRS = "flow/repairs.yaml";
  const FLOW_PATH = [A, "manifest", "timelines", 0, "flow_control"];
  const believe = (id: string, belief: unknown) => ({
    type: "set",
    changes: [{ target: at(id), values: { belief } }],
  });
  const flowOf = (view: View) => manifestOf(view).timelines[0]?.flow_control ?? [];
  const provenanceOf = (view: View, id: string) =>
    flowOf(view).find((item) => item.id === id)?.provenance;

  it("rejects the replacement of flow/repairs and believes its rejected jump again", () => {
    const view = viewOf([A, REPAIRS]);
    const mine = (belief: "true" | "false") => ({ actor: EDITOR, belief, date: DAY });
    // Two jumps at one coordinate, neither rejected, are refused: the second in canonical order.
    expect(refusal(view, believe("jump_1", mine("true")))).toEqual({
      code: "schema_violation",
      path: [...FLOW_PATH, 3],
    });
    const swapped = changed(
      changed(view, believe("jump_2", mine("false"))),
      believe("jump_1", mine("true")),
    );
    expect(flowOf(swapped).map((item) => [item.id, isRejected(item)])).toEqual([
      ["barline_1", false],
      ["jump_target_1", false],
      ["jump_1", false],
      ["jump_2", true],
    ]);
    expect(provenanceOf(swapped, "jump_1")).toEqual([
      { method: "imported", beliefs: [{ actor: EDITOR, belief: "true", date: DAY }] },
    ]);
  });

  it("erases nothing and speaks for nobody else", () => {
    const view = viewOf([A, REPAIRS]);
    const theirs = { actor: OTHER, belief: "true", date: DAY };
    const believed = changed(view, believe("jump_1", theirs));
    expect(provenanceOf(believed, "jump_1")).toEqual([
      {
        method: "imported",
        beliefs: [
          {
            actor: EDITOR,
            belief: "false",
            date: "2026-11-25",
            note: "The repeat begins at the double barline.",
          },
          theirs,
        ],
      },
    ]);
    expect(flowOf(believed).map((item) => isRejected(item))).toEqual([false, false, true, false]);
    const doubted = { actor: OTHER, belief: "unlikely", date: DAY };
    expect(provenanceOf(changed(view, believe("barline_1", doubted)), "barline_1")).toEqual([
      { method: "imported", beliefs: [doubted] },
    ]);
    // The belief the element holds already changes nothing.
    const held = { actor: EDITOR, belief: "true", date: "2026-11-25" };
    expect(refusal(view, believe("jump_2", held))).toEqual({
      code: "invalid_value",
      path: [key(at("jump_2")), "belief"],
    });
  });

  it("is the one way a set changes the provenance", () => {
    const view = viewOf([A, REPAIRS]);
    const stored = element(REPAIRS, "jump_1").provenance;
    for (const provenance of [null, [], [{ method: "imported" }], stored]) {
      const command = { type: "set", changes: [{ target: at("jump_1"), values: { provenance } }] };
      expect(refusal(view, command)).toEqual({
        code: "wrong_target_kind",
        path: [key(at("jump_1")), "provenance"],
      });
    }
  });

  it.each([
    ["null", null, "invalid_value", []],
    ["a list", [], "invalid_value", []],
    ["no date", { actor: OTHER, belief: "false" }, "invalid_value", []],
    ["no actor", { belief: "false", date: DAY }, "invalid_value", []],
    ["no belief", { actor: OTHER, date: DAY }, "invalid_value", []],
    ["another word", { actor: OTHER, belief: "maybe", date: DAY }, "invalid_value", ["belief"]],
    ["an empty actor", { actor: "", belief: "true", date: DAY }, "invalid_value", ["actor"]],
    ["a date no string", { actor: OTHER, belief: "true", date: 7 }, "invalid_value", ["date"]],
    [
      "a fourth member",
      { actor: OTHER, belief: "true", date: DAY, note: "as printed" },
      "unknown_property",
      ["note"],
    ],
  ])("refuses %s as a belief", (_case, belief, code, member) => {
    const view = viewOf([A, REPAIRS]);
    expect(refusal(view, believe("jump_2", belief))).toEqual({
      code,
      path: [key(at("jump_2")), "belief", ...member],
    });
  });

  it("is read by the format's rules once recorded", () => {
    const view = viewOf([A, REPAIRS]);
    // No calendar date: refused where the belief stands in the element's provenance.
    const undated = { actor: OTHER, belief: "false", date: "2026-13-40" };
    expect(refusal(view, believe("jump_2", undated))).toEqual({
      code: "schema_violation",
      path: [...FLOW_PATH, 3, "provenance", 0, "beliefs", 1, "date"],
    });
    // A jump target a jump that is not rejected names cannot be rejected alone.
    const rejecting = { actor: OTHER, belief: "false", date: DAY };
    expect(refusal(view, believe("jump_target_1", rejecting))).toEqual({
      code: "schema_violation",
      path: [...FLOW_PATH, 3, "targets", 0, "to"],
    });
  });
});

describe("what a flow-control element draws besides its line", () => {
  it("gives each manifestation its symbol, a jump one per destination", () => {
    const symbols = (role: string, manifestation: string | null, targets?: object[]) =>
      flowSymbols({ id: "x", role, coordinate: [0, 1], manifestation, targets } as never);
    expect(symbols("jump_target", "repeat_start")).toEqual(["\u{1D106}"]);
    expect(symbols("jump_target", "segno")).toEqual(["\u{1D10B}"]);
    expect(symbols("jump_target", "coda")).toEqual(["\u{1D10C}"]);
    expect(symbols("jump_target", "volta")).toEqual([]);
    expect(symbols("break", "fine")).toEqual(["Fine"]);
    expect(symbols("break", "volta")).toEqual([]);
    expect(symbols("barline", "double_barline")).toEqual(["\u{1D101}"]);
    expect(symbols("barline", "final_barline")).toEqual(["\u{1D102}"]);
    expect(symbols("barline", null)).toEqual([]);
    expect(symbols("section_break", null)).toEqual(["\u{1D102}"]);
    const words = [
      "repeat_end",
      "dal_segno",
      "dal_segno_al_fine",
      "dal_segno_al_coda",
      "da_capo",
      "da_capo_al_fine",
      "da_capo_al_coda",
      "to_coda",
      "volta",
      "ossia",
      "unknown_word",
    ];
    expect(
      symbols(
        "jump",
        null,
        words.map((manifestation) => ({ manifestation })),
      ),
    ).toEqual([
      "\u{1D107}",
      "\u{1D109}",
      "\u{1D109}",
      "\u{1D109}",
      "\u{1D10A}",
      "\u{1D10A}",
      "\u{1D10A}",
      "\u{1D10C}",
    ]);
  });

  it("prints the passes of a branch of a volta fork", () => {
    expect(passesText([1])).toBe("1.");
    expect(passesText([1, 3])).toBe("1., 3.");
    expect(passesText({ from: 4 })).toBe("4.–");
  });

  it("gathers a child member's flow from its root's tree, on its own axis", () => {
    const value = manifestValue("groups/group_child_member.yaml");
    const [piece] = value.timelines as Record<string, unknown>[];
    const element = (id: string, role: string, coordinate: number) => ({
      id,
      role,
      coordinate: [coordinate, 1],
    });
    const withFlow = {
      ...value,
      timelines: [
        {
          ...piece,
          flow_control: [
            element("barline_1", "barline", 4),
            element("barline_2", "barline", 8),
            element("section_break_1", "section_break", 12),
            element("barline_3", "barline", 16),
          ],
          children: ((piece?.children ?? []) as Record<string, unknown>[]).map((child) => ({
            ...child,
            flow_control: [element("barline_4", "barline", 2)],
          })),
        },
        ...(value.timelines as unknown[]).slice(1),
      ],
    };
    const manifest = loadText(fileText(withFlow));
    const { frames } = memberDrawings(manifest);
    const members = frames.flatMap((frame) => frame.members);
    const placed = (id: string) => {
      const member = members.find((each) => each.timeline.id === id);
      if (member === undefined) throw new Error(`no member ${id}`);
      return memberFlow(manifest, member).map((item) => [
        item.element.id,
        item.timeline.id,
        String(item.start),
        String(item.at),
      ]);
    };
    expect(placed("second-half")).toEqual([
      ["barline_2", "piece", "-8", "0"],
      ["section_break_1", "piece", "-8", "4"],
      ["barline_3", "piece", "-8", "8"],
      ["barline_4", "second-half", "0", "2"],
    ]);
    expect(placed("recording")).toEqual([]);
    // Core lists the root's elements outside the member's tree in the member's flow control band.
    const keys = manifestElements(manifest).filter(
      (key) => key.type === "barline" || key.type === "section_break",
    );
    expect(keys.map((key) => [key.address.id, key.timeline, key.inside.at(-2)])).toEqual([
      ["barline_4", "second-half", "child"],
      ["barline_1", "piece", "timeline"],
      ["barline_2", "piece", "timeline"],
      ["section_break_1", "piece", "timeline"],
      ["barline_3", "piece", "timeline"],
      ["barline_4", "second-half", "timeline"],
      ["barline_2", "piece", "timeline"],
      ["section_break_1", "piece", "timeline"],
      ["barline_3", "piece", "timeline"],
    ]);
  });
});

describe("where a destination leads", () => {
  const quarters = (value: number) =>
    axisCoordinate([value, 1], { unit: "quarters", number_type: "fraction" });

  /** The timeline `score` of `view`'s block `A`. */
  const scoreOf = (view: View): TimelineManifest => {
    const timeline = manifestOf(view).timelines[0];
    if (timeline === undefined) throw new Error("block A holds a root");
    return timeline;
  };

  /**
   * What each destination of the jump `id` of `view`'s timeline `listing` names: its kind, its
   * ID, where it lands and, for a section's start, the timeline listing that section break.
   */
  const placesIn = (view: View, listing: string, id: string) => {
    const timeline = findTimeline(manifestOf(view), listing);
    if (timeline === undefined) throw new Error(`no timeline ${listing}`);
    const jump = timeline.flow_control.find((item) => item.id === id);
    if (jump === undefined) throw new Error(`no jump ${id}`);
    return (jump.targets ?? []).map((destination) => {
      const place = destinationPlace(manifestOf(view), timeline, jump, destination);
      switch (place.kind) {
        case "by":
          return [place.kind, null, place.at];
        case "jump_target":
          return [place.kind, place.element.id, place.at];
        case "region":
          return [place.kind, place.region.id, place.at];
        case "timeline":
          return [place.kind, place.timeline.id, place.at];
        case "child":
          return [place.kind, place.child.id, place.at];
        case "section":
          return [place.kind, place.start?.id ?? null, place.at, place.holder?.id ?? null];
        case "nowhere":
          return [place.kind, place.to, null];
        default:
          return assertNever(place);
      }
    });
  };
  const placesOf = (view: View, id: string) => placesIn(view, "score", id);

  it("names the jump target, the child, or the place a distance reaches", () => {
    expect(placesOf(viewOf([A, "flow/sonata_exposition.yaml"]), "jump_1")).toEqual([
      ["by", null, quarters(12)],
      ["jump_target", "jump_target_1", quarters(16)],
    ]);
    expect(placesOf(viewOf([A, "flow/ossia.yaml"]), "jump_1")).toEqual([
      ["by", null, quarters(4)],
      ["child", "ossia", quarters(16)],
    ]);
    expect(placesOf(viewOf([A, "flow/repairs.yaml"]), "jump_2")).toEqual([
      ["jump_target", "jump_target_1", quarters(8)],
    ]);
  });

  it("starts a section at the nearest section break before the jump, else at 0", () => {
    expect(placesOf(viewOf([A, "flow/sonata_exposition.yaml"]), "jump_2")).toEqual([
      ["section", null, quarters(0), null],
    ]);
    const sections = viewOf([A, "flow/sections.yaml"]);
    expect(placesOf(sections, "jump_2")).toEqual([
      ["section", "section_break_1", quarters(16), "score"],
    ]);
    expect(placesOf(sections, "jump_1")).toEqual([["section", null, quarters(0), null]]);
  });

  it("finds the section break among the whole tree's, never before the start of the timeline listing the jump", () => {
    const sectionBreak = (into: string, id: string, coordinate: [number, number]) => ({
      type: "add",
      into: at(into),
      flow_control: { id, role: "section_break", coordinate },
    });
    // `piece` 16 long, `verse` at 4 and 8 long; a jump of `verse` at 6, at 10 on `piece`'s axis.
    let view = changed(viewOf([A, "child_flow_control.yaml"]), {
      type: "add",
      into: at("verse"),
      flow_control: { id: "jump_x", role: "jump", coordinate: [6, 1], targets: [{}] },
    });
    view = changed(view, sectionBreak("piece", "section_break_a", [2, 1]));
    view = changed(view, {
      type: "add",
      into: at("piece"),
      flow_control: { id: "jump_y", role: "jump", coordinate: [14, 1], targets: [{}] },
    });
    // At 2, before `verse` starts: `jump_x` lands at `verse`'s start; `jump_y` at that break.
    expect(placesIn(view, "verse", "jump_x")).toEqual([["section", null, quarters(0), null]]);
    expect(placesIn(view, "piece", "jump_y")).toEqual([
      ["section", "section_break_a", quarters(2), "piece"],
    ]);
    // A section break of `piece` at 7, between `verse`'s start 4 and the jump at 10.
    view = changed(view, sectionBreak("piece", "section_break_b", [7, 1]));
    expect(placesIn(view, "verse", "jump_x")).toEqual([
      ["section", "section_break_b", quarters(3), "piece"],
    ]);
    // One of `verse` at 5, at 9 on `piece`'s axis: nearer; `jump_y` at 14 lands there too.
    view = changed(view, sectionBreak("verse", "section_break_c", [5, 1]));
    expect(placesIn(view, "verse", "jump_x")).toEqual([
      ["section", "section_break_c", quarters(5), "verse"],
    ]);
    expect(placesIn(view, "piece", "jump_y")).toEqual([
      ["section", "section_break_c", quarters(9), "verse"],
    ]);
  });

  it("names a region, the timeline itself, and nothing for an unknown ID", () => {
    const view = changed(viewOf([A, "flow/sonata_exposition.yaml"]), {
      type: "add",
      into: at("score"),
      flow_control: {
        id: "jump_3",
        role: "jump",
        coordinate: [20, 1],
        targets: [{ to: "region_2" }, { to: "score" }, { by: [-8, 1] }],
      },
    });
    // Canonical order: by `by`, then by `to`.
    expect(placesOf(view, "jump_3")).toEqual([
      ["by", null, quarters(12)],
      ["region", "region_2", quarters(12)],
      ["timeline", "score", quarters(0)],
    ]);
    const timeline = scoreOf(view);
    const jump = timeline.flow_control.find((item) => item.id === "jump_3");
    if (jump === undefined) throw new Error("jump_3 was added");
    const nowhere = { to: "nothing", determined: true, reset: true, label: null };
    expect(destinationPlace(manifestOf(view), timeline, jump, nowhere)).toEqual({
      kind: "nowhere",
      to: "nothing",
    });
  });
});
