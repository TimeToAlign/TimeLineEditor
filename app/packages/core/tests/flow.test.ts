import { dumps, loads } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { apply } from "../src/commands/apply.ts";
import { idAddress } from "../src/manifest/address.ts";
import { manifestElements } from "../src/manifest/elements.ts";
import { FLOW_LINE_ROLES, isRejected, withElementBelief } from "../src/manifest/flow.ts";
import { saveManifest } from "../src/manifest/io.ts";
import { removedBy } from "../src/manifest/remove.ts";
import type { FlowControlElement, Manifest } from "../src/manifest/types.ts";
import { addressWords, manifestIds, resolveElement } from "../src/workspace/address.ts";
import type { View } from "../src/workspace/view.ts";
import { A, allFixtures, at, changed, key, load, viewOf } from "./support.ts";

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
      .filter((item) => item.type !== "label" && item.type !== "region")
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

  it("gives every drawn one a label, whatever its role", () => {
    const labels = manifestElements(load("flow/sections.yaml"))
      .filter((item) => item.type === "label" && item.inside.at(-1) !== "band")
      .map((item) => [item.inside.at(-1), item.address]);
    expect(labels).toEqual([
      ["break", { id: "break_1", part: ["label"] }],
      ["section_break", { id: "section_break_1", part: ["label"] }],
      ["jump", { id: "jump_1", part: ["label"] }],
      ["jump", { id: "jump_2", part: ["label"] }],
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
