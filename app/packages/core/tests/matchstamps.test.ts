import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { JsonFloat, SCHEMA_VERSION } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { apply } from "../src/commands/apply.ts";
import { matchStampSpec } from "../src/commands/matchstamps.ts";
import { isCommandError } from "../src/errors.ts";
import { addressKey } from "../src/manifest/address.ts";
import type { NamedMatchStamp, NamedTimestamp } from "../src/manifest/types.ts";
import { Rational } from "../src/number/rational.ts";
import type { Address } from "../src/workspace/address.ts";
import { addressWords, manifestIds, resolveAddress } from "../src/workspace/address.ts";
import type { View } from "../src/workspace/view.ts";
import { A, block, changed, deepFreeze, load, loadText, storeOf, viewOf } from "./support.ts";

const FIXTURE = "bundles/bundle_matchstamps.yaml";
const view = deepFreeze(viewOf([A, FIXTURE]));
const fixture = load(FIXTURE);
const TS = fixture.graphical?.timestamps ?? [];
const [M1, M2] = fixture.graphical?.matchstamps ?? [];
if (M1 === undefined || M2 === undefined) throw new Error(`${FIXTURE} holds two MatchStamps`);

const at = (id: string): Address => ({ block: A, id });
const key = (address: Address) => addressKey(address);
const INTO = key({ block: A });

/** A coordinate as a command gives it. */
const c = (timeline: string, coordinate: unknown) => ({ timeline, coordinate });
/**
 * The IDs naming `BAR_4` takes, in the order it takes them: the MatchStamp's,
 * then each new match timestamp's as the anchors meet them, then each
 * anchor's in screen order.
 */
const BAR_4_IDS = ["bar4", "bar4-score", "bar4-take1", "bar4-take2", "bar4-a1", "bar4-a2"];
const name = (matchstamp: object, ids: readonly string[] = BAR_4_IDS) => ({
  type: "add",
  into: { block: A },
  matchstamp,
  ids,
});
const set = (target: Address, values: object, ids?: readonly string[]) => ({
  type: "set",
  changes: [{ target, values }],
  ...(ids === undefined ? {} : { ids }),
});
const remove = (...targets: Address[]) => ({ type: "remove", targets });

/** A new match timestamp as naming writes it. */
const match = (id: string, timeline: string, coordinate: unknown) => ({
  id,
  timeline,
  coordinate,
  display: ["cross_section"],
  matchstamp: true,
  groupstamp: false,
});
/** The fixture's timestamp `id`. */
const ts = (id: string): NamedTimestamp => {
  const found = TS.find((item) => item.id === id);
  if (found === undefined) throw new Error(`${FIXTURE} holds ${id}`);
  return found;
};
const without = (...ids: string[]) => TS.filter((item) => !ids.includes(item.id));

const timestampsOf = (state: View) => block(state).manifest.graphical?.timestamps;
const matchstampsOf = (state: View) => block(state).manifest.graphical?.matchstamps;
const stamp = (state: View, id: string): NamedMatchStamp | undefined =>
  matchstampsOf(state)?.find((item) => item.id === id);

/** A refusal's code, message and path. */
function refused(result: unknown): { code: string; message: string; path: readonly unknown[] } {
  if (!isCommandError(result)) throw new Error("expected a refusal");
  return { code: result.code, message: result.message, path: result.path };
}

/** The text of TimeToShare's table fixture's manifest. */
function tablesManifest() {
  const packageDir = path.dirname(
    createRequire(import.meta.url).resolve("@timetoalign/timetoshare/package.json"),
  );
  const file = path.join(packageDir, "fixtures", "tables", SCHEMA_VERSION, "manifest.yaml");
  return loadText(readFileSync(file, "utf8"), "the table fixture's manifest");
}

const BAR_4 = {
  name: "Bar 4",
  anchors: [
    [c("score", [6, 1]), c("take_1", 176400)],
    [c("take_1", 176400), c("take_2", 198450)],
  ],
  match_claims: ["claim_7", "claim_8"],
};

describe("reading named MatchStamps", () => {
  it("holds them complete, resolves them and names them", () => {
    expect(M2.alignment_anchors).toEqual([
      { id: "anchor_2", timestamps: ["timestamp_1", "timestamp_3"], display: ["line"] },
    ]);
    expect(fixture.resources).toEqual([]);
    const ms = resolveAddress(view, at("matchstamp_1"));
    if (isCommandError(ms) || ms.kind !== "matchstamp") throw new Error("matchstamp_1");
    expect([ms.index, ms.matchstamp]).toEqual([0, M1]);
    const anchor = resolveAddress(view, at("anchor_2"));
    if (isCommandError(anchor) || anchor.kind !== "anchor") throw new Error("anchor_2");
    expect([anchor.index, anchor.position, anchor.matchstamp, anchor.anchor]).toEqual([
      1,
      0,
      M2,
      M2.alignment_anchors[0],
    ]);
    expect(addressWords(view, at("matchstamp_1"))).toBe("MatchStamp 'Bar 2, downbeat (take 1)'");
    expect(addressWords(view, at("anchor_2"))).toBe("alignment anchor 'anchor_2'");
    expect(addressWords(view, at("timestamp_1"))).toBe("timestamp 'timestamp_1'");
    const part = resolveAddress(view, { ...at("matchstamp_1"), part: ["name"] });
    expect(isCommandError(part) ? part.code : part.kind).toBe("unknown_target");
  });

  it("resolves the label an anchor draws, and a style rule selecting it reaches its block", () => {
    const label = resolveAddress(view, { ...at("anchor_1"), part: ["name"] });
    if (isCommandError(label) || label.kind !== "part") throw new Error("anchor_1's label");
    expect(label.word).toBe("name");
    const { owner } = label;
    if (owner.kind !== "anchor") throw new Error("the label's owner");
    expect([owner.anchor.id, owner.index, owner.position]).toEqual(["anchor_1", 0, 0]);
    const hidden = resolveAddress(view, { ...at("anchor_2"), part: ["name"] });
    expect(isCommandError(hidden) ? hidden.code : hidden.kind).toBe("unknown_target");
    const select = { addresses: [{ id: "anchor_1", part: ["name"] }] };
    const styled = changed(view, { type: "style", select, set: { opacity: 0.5 } });
    expect(block(styled).manifest.graphical?.rules?.at(-1)).toEqual({
      select,
      set: { opacity: 0.5 },
    });
  });

  it("counts their IDs, and the resources', among the manifest's", () => {
    const ids = manifestIds(fixture);
    for (const id of ["matchstamp_1", "matchstamp_2", "anchor_1", "anchor_2"]) {
      expect(ids.has(id)).toBe(true);
    }
    const tables = tablesManifest();
    expect(manifestIds(tables).has("resource_1")).toBe(true);
    expect(manifestIds(tables).has("resource_2")).toBe(true);
    const tablesView = changed(viewOf(), {
      type: "add",
      into: {},
      block: { id: A, manifest: tables, x: 0, y: 0 },
    });
    const resource = resolveAddress(tablesView, at("resource_1"));
    expect(isCommandError(resource) ? resource.code : resource.kind).toBe("unknown_target");
  });
});

describe("naming a potential MatchStamp", () => {
  it("writes its match timestamps, its anchors and its claims in one entry", () => {
    const store = storeOf(view);
    const before = store.view;
    const entries = store.journal.length;
    expect(store.dispatch(name(BAR_4))).toBeNull();
    expect(store.journal).toHaveLength(entries + 1);
    const after = store.view;
    expect(timestampsOf(after)).toEqual([
      ts("timestamp_4"),
      ts("timestamp_1"),
      match("bar4-score", "score", [6, 1]),
      ts("timestamp_5"),
      ts("timestamp_6"),
      ts("timestamp_2"),
      match("bar4-take1", "take_1", 176400),
      ts("timestamp_7"),
      ts("timestamp_8"),
      ts("timestamp_3"),
      match("bar4-take2", "take_2", 198450),
      ts("timestamp_9"),
    ]);
    // In canonical order, by ID: `bar4` before `matchstamp_1`.
    expect(matchstampsOf(after)).toEqual([
      {
        id: "bar4",
        name: "Bar 4",
        alignment_anchors: [
          {
            id: "bar4-a1",
            timestamps: ["bar4-score", "bar4-take1"],
            display: ["line", "name"],
          },
          { id: "bar4-a2", timestamps: ["bar4-take1", "bar4-take2"], display: ["line"] },
        ],
        match_claims: ["claim_7", "claim_8"],
      },
      M1,
      M2,
    ]);
    store.undo();
    expect(store.view).toBe(before);
  });

  it("reuses the match timestamp a coordinate has, never an ordinary one", () => {
    const reused = changed(
      view,
      name({ ...BAR_4, anchors: [[c("score", [8, 2]), c("take_2", 99225)]] }, ["bar4", "bar4-a1"]),
    );
    expect(timestampsOf(reused)).toEqual(TS);
    expect(stamp(reused, "bar4")?.alignment_anchors).toEqual([
      { id: "bar4-a1", timestamps: ["timestamp_1", "timestamp_3"], display: ["line", "name"] },
    ]);
    const origins = changed(
      view,
      name({ ...BAR_4, anchors: [[c("score", [0, 1]), c("take_1", 0)]] }, [
        "bar4",
        "bar4-score",
        "bar4-take1",
        "bar4-a1",
      ]),
    );
    expect(timestampsOf(origins)?.filter((item) => item.matchstamp)).toEqual([
      match("bar4-score", "score", [0, 1]),
      ts("timestamp_1"),
      match("bar4-take1", "take_1", 0),
      ts("timestamp_2"),
      ts("timestamp_3"),
    ]);
    expect(timestampsOf(origins)?.filter((item) => !item.matchstamp)).toEqual(
      TS.filter((item) => !item.matchstamp),
    );
  });

  it("shows the name on the middle anchor in screen order", () => {
    const third = [c("score", [6, 1]), c("take_2", 198450)];
    const three = changed(
      view,
      name({ ...BAR_4, anchors: [...BAR_4.anchors, third] }, [...BAR_4_IDS, "bar4-a3"]),
    );
    const displays = (state: View) =>
      stamp(state, "bar4")?.alignment_anchors.map((item) => [item.id, item.display]);
    expect(displays(three)).toEqual([
      ["bar4-a1", ["line"]],
      ["bar4-a2", ["line", "name"]],
      ["bar4-a3", ["line"]],
    ]);
    const fourth = [c("score", [6, 1]), c("take_1", 200000)];
    const ids = ["bar4", "bar4-score", "bar4-take1", "bar4-take2", "bar4-take1b"];
    const four = changed(
      view,
      name({ ...BAR_4, anchors: [...BAR_4.anchors, third, fourth] }, [
        ...ids,
        "bar4-a1",
        "bar4-a2",
        "bar4-a3",
        "bar4-a4",
      ]),
    );
    expect(displays(four)).toEqual([
      ["bar4-a1", ["line"]],
      ["bar4-a2", ["line", "name"]],
      ["bar4-a3", ["line"]],
      ["bar4-a4", ["line"]],
    ]);
  });

  it("refuses a value it cannot read, at the value", () => {
    const inValue = (...rest: unknown[]) => [INTO, "matchstamp", ...rest];
    const cases: [object, string, string, unknown[]][] = [
      [{ ...BAR_4, colour: 1 }, "unknown_property", "unknown member colour", inValue("colour")],
      [{ ...BAR_4, name: "" }, "invalid_value", "a name is a non-empty string", inValue("name")],
      [
        { ...BAR_4, anchors: [] },
        "invalid_value",
        "anchors is a non-empty list of anchors",
        inValue("anchors"),
      ],
      [
        { ...BAR_4, anchors: [[c("score", [6, 1])]] },
        "invalid_value",
        "an anchor is a pair of coordinates",
        inValue("anchors", 0),
      ],
      [
        { ...BAR_4, anchors: [[c("score", [6, 1]), c("nope", 1)]] },
        "invalid_value",
        "'nope' names no timeline of this manifest",
        inValue("anchors", 0, 1, "timeline"),
      ],
      [
        { ...BAR_4, anchors: [[{ timeline: "score" }, c("take_1", 1)]] },
        "invalid_value",
        "a coordinate needs coordinate",
        inValue("anchors", 0, 0, "coordinate"),
      ],
      [
        { ...BAR_4, anchors: [[c("score", [9, 1]), c("take_1", 1)]] },
        "invalid_value",
        "the coordinate lies after the end of timeline 'score'",
        inValue("anchors", 0, 0, "coordinate"),
      ],
      [
        { ...BAR_4, anchors: [BAR_4.anchors[0], [...(BAR_4.anchors[0] ?? [])].reverse()] },
        "invalid_value",
        "the anchor is given twice",
        inValue("anchors", 1),
      ],
      [
        { ...BAR_4, match_claims: ["", "claim_1"] },
        "invalid_value",
        "match_claims is a list of MatchClaim IDs",
        inValue("match_claims"),
      ],
    ];
    for (const [value, code, message, path] of cases) {
      expect(refused(apply(view, name(value)))).toEqual({ code, message, path });
    }
    for (const member of ["name", "anchors", "match_claims"]) {
      const { [member as keyof typeof BAR_4]: _, ...rest } = BAR_4;
      expect(refused(apply(view, name(rest)))).toEqual({
        code: "invalid_value",
        message: `a new MatchStamp needs ${member}`,
        path: inValue(member),
      });
    }
    const bare = refused(
      apply(view, name({ ...BAR_4, anchors: [[c("score", 6), c("take_1", 1)]] })),
    );
    expect([bare.code, bare.path]).toEqual([
      "invalid_coordinate",
      inValue("anchors", 0, 0, "coordinate"),
    ]);
    expect(refused(apply(view, { type: "add", into: at("score"), matchstamp: BAR_4 }))).toEqual({
      code: "wrong_target_kind",
      message: "nothing of kind matchstamp goes into root",
      path: [key(at("score")), "matchstamp"],
    });
  });

  it("leaves the rules of MatchStamps to the schema package", () => {
    const manifest = (...rest: unknown[]) => [
      A,
      "manifest",
      "graphical",
      "matchstamps",
      0,
      ...rest,
    ];
    expect(
      refused(
        apply(
          view,
          name({ ...BAR_4, anchors: [[c("take_1", 0), c("take_1", 88200)]] }, [
            "bar4",
            "bar4-take1",
            "bar4-a1",
          ]),
        ),
      ),
    ).toEqual({
      code: "schema_violation",
      message: "the timestamps of 'bar4-a1' both lie on the timeline 'take_1'",
      path: manifest("alignment_anchors", 0, "timestamps", 1),
    });
    const apart = [
      [c("score", [6, 1]), c("take_1", 176400)],
      [c("score", [7, 1]), c("take_2", 198450)],
    ];
    const apartIds = ["bar4", "bar4-score", "bar4-take1", "bar4-score7", "bar4-take2"];
    const named = name({ ...BAR_4, anchors: apart }, [...apartIds, "bar4-a1", "bar4-a2"]);
    expect(refused(apply(view, named))).toEqual({
      code: "schema_violation",
      message: "the alignment anchors of 'bar4' are not one connected set",
      path: manifest("alignment_anchors"),
    });
    const twice = refused(apply(view, name({ ...BAR_4, match_claims: ["claim_1", "claim_1"] })));
    expect([twice.code, twice.path]).toEqual(["schema_violation", manifest("match_claims")]);
  });
});

describe("updating a named MatchStamp", () => {
  it("keeps the anchors it still has and adds the new ones, in one entry", () => {
    const store = storeOf(view);
    const before = store.view;
    const entries = store.journal.length;
    const anchors = [
      [c("take_1", 88200), c("score", [4, 1])],
      [c("take_1", 88200), c("take_2", 99225)],
    ];
    const claims = ["claim_1", "claim_2", "claim_4"];
    const command = set(at("matchstamp_1"), { anchors, match_claims: claims }, ["new-anchor"]);
    expect(store.dispatch(command)).toBeNull();
    expect(store.journal).toHaveLength(entries + 1);
    expect(stamp(store.view, "matchstamp_1")).toEqual({
      ...M1,
      alignment_anchors: [
        M1.alignment_anchors[0],
        { id: "new-anchor", timestamps: ["timestamp_2", "timestamp_3"], display: ["line"] },
      ],
      match_claims: claims,
    });
    expect(timestampsOf(store.view)).toEqual(TS);
    store.undo();
    expect(store.view).toBe(before);
  });

  it("moves the name to the middle anchor when its anchor is gone", () => {
    const updated = changed(
      view,
      set(at("matchstamp_1"), { anchors: [[c("score", [4, 1]), c("take_2", 99225)]] }, ["moved"]),
    );
    expect(matchstampsOf(updated)).toEqual([
      {
        ...M1,
        alignment_anchors: [
          { id: "moved", timestamps: ["timestamp_1", "timestamp_3"], display: ["line", "name"] },
        ],
      },
      M2,
    ]);
    expect(timestampsOf(updated)).toEqual(without("timestamp_2"));
  });

  it("creates the match timestamps it needs and removes those left unnamed", () => {
    const updated = changed(
      view,
      set(at("matchstamp_2"), { anchors: [[c("score", [4, 1]), c("take_2", 110250)]] }, [
        "take2-new",
        "anchor-new",
      ]),
    );
    expect(stamp(updated, "matchstamp_2")?.alignment_anchors).toEqual([
      { id: "anchor-new", timestamps: ["timestamp_1", "take2-new"], display: ["line"] },
    ]);
    const take2 = timestampsOf(updated)?.filter((item) => item.timeline === "take_2");
    expect(take2).toEqual([
      ts("timestamp_8"),
      match("take2-new", "take_2", 110250),
      ts("timestamp_9"),
    ]);
  });

  it("refuses an update that changes nothing", () => {
    const own = [[c("take_1", 88200), c("score", [8, 2])]];
    expect(refused(apply(view, set(at("matchstamp_1"), { anchors: own })))).toEqual({
      code: "invalid_value",
      message: "the command changes nothing",
      path: [key(at("matchstamp_1")), "anchors"],
    });
    const claims = ["claim_1", "claim_2"];
    expect(refused(apply(view, set(at("matchstamp_1"), { match_claims: claims })))).toEqual({
      code: "invalid_value",
      message: "the command changes nothing",
      path: [key(at("matchstamp_1")), "match_claims"],
    });
  });

  it("sets its name, and refuses what it has not", () => {
    const named = changed(view, set(at("matchstamp_1"), { name: "Downbeat" }));
    expect(stamp(named, "matchstamp_1")).toEqual({ ...M1, name: "Downbeat" });
    const path = (property: string) => [key(at("matchstamp_1")), property];
    expect(refused(apply(view, set(at("matchstamp_1"), { name: "" })))).toEqual({
      code: "invalid_value",
      message: "a name is a non-empty string",
      path: path("name"),
    });
    expect(refused(apply(view, set(at("matchstamp_1"), { id: "x" }))).code).toBe("id_not_settable");
    expect(refused(apply(view, set(at("matchstamp_1"), { colour: 1 })))).toEqual({
      code: "unknown_property",
      message: "matchstamp has no property colour",
      path: path("colour"),
    });
    expect(refused(apply(view, set(at("matchstamp_1"), { display: [] })))).toEqual({
      code: "wrong_target_kind",
      message: "display is a property of timestamp, elision, anchor, not of matchstamp",
      path: path("display"),
    });
  });

  it("sets an anchor's display in canonical order", () => {
    const shown = changed(view, set(at("anchor_2"), { display: ["name", "line"] }));
    expect(stamp(shown, "matchstamp_2")?.alignment_anchors[0]?.display).toEqual(["line", "name"]);
    const hidden = changed(view, set(at("anchor_2"), { display: [] }));
    expect(stamp(hidden, "matchstamp_2")?.alignment_anchors[0]?.display).toEqual([]);
    expect(refused(apply(view, set(at("anchor_2"), { display: ["flag"] })))).toEqual({
      code: "invalid_value",
      message: "'flag' is no display word",
      path: [key(at("anchor_2")), "display"],
    });
    expect(refused(apply(view, set(at("anchor_1"), { display: ["name", "line"] })))).toEqual({
      code: "invalid_value",
      message: "the command changes nothing",
      path: [key(at("anchor_1")), "display"],
    });
  });

  it("deletes a match timestamp's name by null, which undo gives back", () => {
    const store = storeOf(view);
    const before = store.view;
    const entries = store.journal.length;
    expect(store.dispatch(set(at("timestamp_3"), { name: null }))).toBeNull();
    expect(store.journal).toHaveLength(entries + 1);
    const graphical = fixture.graphical;
    expect(block(store.view).manifest).toStrictEqual({
      ...fixture,
      graphical: {
        ...graphical,
        timestamps: TS.map((item) =>
          item.id === "timestamp_3"
            ? {
                id: "timestamp_3",
                timeline: "take_2",
                coordinate: 99225,
                display: ["name", "cross_section"],
                matchstamp: true,
                groupstamp: false,
              }
            : item,
        ),
      },
    });
    store.undo();
    expect(store.view).toBe(before);
    expect(block(store.view).manifest).toStrictEqual(fixture);
    expect(ts("timestamp_3").name).toBe("Take 2, bar 2");
  });

  it("refuses null for an unnamed match timestamp and for an ordinary timestamp", () => {
    expect(refused(apply(view, set(at("timestamp_1"), { name: null })))).toEqual({
      code: "invalid_value",
      message: "the command changes nothing",
      path: [key(at("timestamp_1")), "name"],
    });
    expect(refused(apply(view, set(at("timestamp_4"), { name: null })))).toEqual({
      code: "invalid_value",
      message: "a name is a non-empty string",
      path: [key(at("timestamp_4")), "name"],
    });
  });
});

describe("removing named MatchStamps", () => {
  it("removes one with the match timestamps only it named, in one entry", () => {
    const styled = changed(view, {
      type: "style",
      select: { addresses: [{ id: "anchor_1" }] },
      set: { stroke: "#E51400" },
      blocks: [A],
    });
    const store = storeOf(styled);
    const before = store.view;
    expect(store.dispatch(remove(at("matchstamp_1")))).toBeNull();
    expect(matchstampsOf(store.view)).toEqual([M2]);
    expect(timestampsOf(store.view)).toEqual(without("timestamp_2"));
    expect(block(store.view).manifest.graphical?.rules).toEqual([]);
    store.undo();
    expect(store.view).toBe(before);
    const both = changed(view, remove(at("matchstamp_1"), at("matchstamp_2")));
    expect(matchstampsOf(both)).toEqual([]);
    expect(timestampsOf(both)).toEqual(without("timestamp_1", "timestamp_2", "timestamp_3"));
  });

  it("goes with a timeline or a match timestamp one of its anchors names", () => {
    const timeline = changed(view, remove(at("take_1")));
    expect(matchstampsOf(timeline)).toEqual([M2]);
    expect(timestampsOf(timeline)).toEqual(without("timestamp_2", "timestamp_6", "timestamp_7"));
    const timestamp = changed(view, remove(at("timestamp_3")));
    expect(matchstampsOf(timestamp)).toEqual([M1]);
    expect(timestampsOf(timestamp)).toEqual(without("timestamp_3"));
  });

  it("removes an anchor only with its MatchStamp", () => {
    expect(refused(apply(view, remove(at("anchor_1"))))).toEqual({
      code: "not_removable",
      message: "an alignment anchor goes with its MatchStamp",
      path: [key(at("anchor_1"))],
    });
  });

  it("leaves every resource naming the timelines left", () => {
    const tables = tablesManifest();
    const removed = changed(
      changed(viewOf(), { type: "add", into: {}, block: { id: A, manifest: tables, x: 0, y: 0 } }),
      remove(at("clt_2")),
    );
    const [first, second] = tables.resources;
    expect(block(removed).manifest.resources).toEqual([
      { ...first, timelines: ["clt_1", "dpt_1", "cpt_1"] },
      { ...second, timelines: ["dpt_1", "cpt_1"] },
    ]);
  });
});

describe("match timestamps and a new length", () => {
  it("leave a match timestamp where it is", () => {
    const ends = changed(
      view,
      name({ ...BAR_4, anchors: [[c("score", [8, 1]), c("take_1", 352800)]] }, [
        "bar4",
        "bar4-score",
        "bar4-take1",
        "bar4-a1",
      ]),
    );
    const longer = changed(ends, set(at("score"), { length: [10, 1] }));
    const score = timestampsOf(longer)?.filter((item) => item.timeline === "score");
    expect(score).toEqual([
      ts("timestamp_4"),
      ts("timestamp_1"),
      match("bar4-score", "score", [8, 1]),
      { ...ts("timestamp_5"), coordinate: [10, 1] },
    ]);
  });
});

describe("match timestamps on grouped timelines", () => {
  it("are groupstamps where their timeline lies in a group", () => {
    const mixed = deepFreeze(viewOf([A, "bundles/bundle_mixed.yaml"]));
    const before = new Set((timestampsOf(mixed) ?? []).map((item) => item.id));
    const turn = changed(
      mixed,
      name(
        {
          name: "Turn",
          anchors: [[c("score", [6, 1]), c("performance", new JsonFloat(3))]],
          match_claims: ["claim_1"],
        },
        ["turn", "turn-score", "turn-performance", "turn-a1"],
      ),
    );
    const added = (timestampsOf(turn) ?? []).filter((item) => !before.has(item.id));
    expect(added).toEqual([
      { ...match("turn-performance", "performance", new JsonFloat(3)), groupstamp: true },
      { ...match("turn-score", "score", [6, 1]), groupstamp: true },
    ]);
  });

  it("are ordinary timestamps in a bundle without groups", () => {
    const named = changed(view, name(BAR_4));
    const known = new Set(TS.map((item) => item.id));
    const added = (timestampsOf(named) ?? []).filter((item) => !known.has(item.id));
    expect(added.map((item) => [item.id, item.groupstamp])).toEqual([
      ["bar4-score", false],
      ["bar4-take1", false],
      ["bar4-take2", false],
    ]);
  });
});

describe("a named MatchStamp for the comparison", () => {
  it("gives its anchors' values and the name's anchor", () => {
    expect(matchStampSpec(fixture, M1)).toEqual({
      anchors: [
        {
          coordinates: [
            { timeline: "score", value: Rational.fromParts(4n, 1n) },
            { timeline: "take_1", value: 88200n },
          ],
          carriesName: true,
        },
      ],
      claims: ["claim_1", "claim_2"],
    });
  });
});
