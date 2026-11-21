/** MatchStamps as the editor takes them; the expected values are derived in `README.md` ("MatchClaims and the Matchstamp tab"). */

import { drawingOf } from "@timetoalign/tilie-arranger";
import type { AnchorIndex, Store } from "@timetoalign/tilie-core";
import {
  coordinateOf,
  DEFAULT_MATCH_CLAIM_FILTER,
  DEFAULT_USER,
  USER_TAG,
} from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import { compactJson, fontMetrics } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { claimEntryLine } from "../src/inspector/claimProvenance.ts";
import type { StampCoordinate } from "../src/inspector/matchstamps.ts";
import {
  claimLines,
  differencesOf,
  hiddenAnchorsNote,
  matchIndexes,
  matchInputs,
  nameCommand,
  namedComparisons,
  namedStamp,
  pinnedMatchStampOf,
  potentialStamp,
  removeCommand,
  stampToName,
  updateCommand,
} from "../src/inspector/matchstamps.ts";
import type { HeldMatch, MatchShown } from "../src/inspector/tabs.ts";
import { matchOutlived, matchPinned, namedMatchStampOf } from "../src/inspector/tabs.ts";
import { BELIEFS_BY_ROW, ME, matchTable, OTHER, q, tableManifest } from "./matches.ts";
import { storeOf } from "./support.ts";

const A = "0000000000";

/** The table fixture's manifest's context: it declares none. */
const CONTEXT = tableManifest()["@context"];

/** The block's timelines filter of the README's cases: `cpt_1` left out. */
const NARROWED = { timelines: ["clt_1", "dpt_1"], belief: "not_false" } as const;

function setup(): { store: Store; drawing: Drawing } {
  const store = storeOf(tableManifest());
  const block = store.view.blocks[A];
  if (block === undefined) throw new Error("the block is missing");
  return { store, drawing: drawingOf(block, store.view.graphical, fontMetrics) };
}

/** The number of the potential MatchStamp holding `timeline` at `value` in `index`. */
function stampAt(index: AnchorIndex, timeline: string, value: Parameters<typeof coordinateOf>[2]) {
  const coordinate = coordinateOf(index, timeline, value);
  expect(coordinate).toBeGreaterThanOrEqual(0);
  return index.matchStamps.of[coordinate] as number;
}

/** A coordinate as the tests compare it: its timeline and its value's text. */
const text = ({ timeline, value }: StampCoordinate) => [timeline, String(value)];

/** Name the potential MatchStamp of `clt_1` 0 "Downbeat" in `store`. */
function nameDownbeat(store: Store, drawing: Drawing): void {
  const { shown } = matchIndexes(matchTable(), DEFAULT_MATCH_CLAIM_FILTER, ME, CONTEXT);
  const stamp = potentialStamp(A, shown, stampAt(shown, "clt_1", q(0)), drawing);
  expect(store.dispatch(nameCommand(stamp, "Downbeat"))).toBe(null);
}

describe("the indexes", () => {
  it("builds one index per table and filter, the timelines narrowing only the shown one", () => {
    const table = matchTable();
    const plain = matchIndexes(table, DEFAULT_MATCH_CLAIM_FILTER, ME, CONTEXT);
    expect(plain.shown).toBe(plain.compared);
    expect([plain.compared.anchors.count, plain.compared.matchStamps.count]).toEqual([4, 3]);
    expect(matchIndexes(table, DEFAULT_MATCH_CLAIM_FILTER, ME, CONTEXT)).toEqual(plain);
    expect(matchIndexes(table, DEFAULT_MATCH_CLAIM_FILTER, ME, CONTEXT).compared).toBe(
      plain.compared,
    );

    const believed = matchIndexes(table, { timelines: null, belief: "true" }, ME, CONTEXT);
    expect(believed.compared.anchors.count).toBe(1);

    const narrowed = matchIndexes(table, NARROWED, ME, CONTEXT);
    expect(narrowed.compared).toBe(plain.compared);
    expect(narrowed.shown.anchors.count).toBe(2);
  });
});

describe("a potential MatchStamp", () => {
  it("lists its timestamps and anchors in screen order and the claims behind it", () => {
    const { drawing } = setup();
    const { shown } = matchIndexes(matchTable(), DEFAULT_MATCH_CLAIM_FILTER, ME, CONTEXT);
    const stamp = potentialStamp(A, shown, stampAt(shown, "clt_1", q(0)), drawing);
    expect(stamp.coordinates.map(text)).toEqual([
      ["clt_1", "0"],
      ["cpt_1", "0"],
      ["dpt_1", "0"],
    ]);
    expect(stamp.anchors.map((anchor) => anchor.coordinates.map(text))).toEqual([
      [
        ["clt_1", "0"],
        ["cpt_1", "0"],
      ],
      [
        ["clt_1", "0"],
        ["dpt_1", "0"],
      ],
    ]);
    expect(stamp.claims).toEqual(["claim_1", "claim_2"]);
    expect([stamp.id, stamp.name]).toEqual([null, null]);
  });

  it("is named in one entry: match timestamps, the anchors, the middle one showing the name", () => {
    const { store, drawing } = setup();
    const before = store.journal.length;
    nameDownbeat(store, drawing);
    expect(store.journal.length).toBe(before + 1);
    const graphical = store.view.blocks[A]?.manifest.graphical;
    expect(
      graphical?.timestamps?.map((item) => [
        item.id,
        item.timeline,
        compactJson(item.coordinate),
        item.matchstamp,
        item.display,
      ]),
    ).toEqual([
      ["timestamp_1", "clt_1", "[0,1]", true, ["cross_section"]],
      ["timestamp_2", "cpt_1", "0.0", true, ["cross_section"]],
      ["timestamp_3", "dpt_1", "0", true, ["cross_section"]],
    ]);
    expect(graphical?.matchstamps).toEqual([
      {
        id: "matchstamp_1",
        name: "Downbeat",
        alignment_anchors: [
          { id: "anchor_1", timestamps: ["timestamp_1", "timestamp_2"], display: ["line", "name"] },
          { id: "anchor_2", timestamps: ["timestamp_1", "timestamp_3"], display: ["line"] },
        ],
        match_claims: ["claim_1", "claim_2"],
      },
    ]);
  });
});

describe("naming under a timelines filter", () => {
  it("names the MatchStamp the table states, which is not out of date, and says so", () => {
    const { store, drawing } = setup();
    const indexes = matchIndexes(matchTable(), NARROWED, ME, CONTEXT);
    const shown = potentialStamp(A, indexes.shown, stampAt(indexes.shown, "clt_1", q(0)), drawing);
    expect(shown.coordinates.map(text)).toEqual([
      ["clt_1", "0"],
      ["dpt_1", "0"],
    ]);
    expect(shown.claims).toEqual(["claim_1"]);

    const named = stampToName(shown, indexes, drawing);
    expect(named.coordinates.map(text)).toEqual([
      ["clt_1", "0"],
      ["cpt_1", "0"],
      ["dpt_1", "0"],
    ]);
    expect(named.claims).toEqual(["claim_1", "claim_2"]);
    expect(hiddenAnchorsNote(shown, named)).toBe(
      "Naming also stores 1 anchor on timelines the MatchClaim filter hides.",
    );

    expect(store.dispatch(nameCommand(named, "Downbeat"))).toBe(null);
    const manifest = store.view.blocks[A]?.manifest;
    const matchstamp = manifest?.graphical?.matchstamps?.[0];
    if (manifest === undefined || matchstamp === undefined) throw new Error("not named");
    expect(matchstamp.match_claims).toEqual(["claim_1", "claim_2"]);
    expect(matchstamp.alignment_anchors.map((anchor) => anchor.timestamps)).toEqual([
      ["timestamp_1", "timestamp_2"],
      ["timestamp_1", "timestamp_3"],
    ]);
    const [compared] = namedComparisons(manifest, indexes.compared);
    if (compared === undefined) throw new Error("no comparison");
    expect(compared.comparison.outOfDate).toBe(false);
    expect(differencesOf(manifest, matchstamp, compared.comparison, indexes.compared)).toEqual([]);
  });

  it("names what is shown where no filter narrows it", () => {
    const { drawing } = setup();
    const indexes = matchIndexes(matchTable(), DEFAULT_MATCH_CLAIM_FILTER, ME, CONTEXT);
    const shown = potentialStamp(A, indexes.shown, stampAt(indexes.shown, "clt_1", q(0)), drawing);
    const named = stampToName(shown, indexes, drawing);
    expect(named).toBe(shown);
    expect(hiddenAnchorsNote(shown, named)).toBe(null);
  });
});

describe("a named MatchStamp against the table", () => {
  /** The table with the user believing `claim_1` false. */
  const doubted = () => matchTable([[[ME, "false"]], ...BELIEFS_BY_ROW.slice(1)]);

  it("marks the anchors no longer stated and lists what differs", () => {
    const { store, drawing } = setup();
    nameDownbeat(store, drawing);
    const manifest = store.view.blocks[A]?.manifest;
    const named = manifest?.graphical?.matchstamps?.[0];
    if (manifest === undefined || named === undefined) throw new Error("not named");
    const { compared } = matchIndexes(doubted(), DEFAULT_MATCH_CLAIM_FILTER, ME, CONTEXT);
    const [comparison] = namedComparisons(manifest, compared);
    expect(comparison?.id).toBe("matchstamp_1");
    if (comparison === undefined) throw new Error("no comparison");
    const stamp = namedStamp(A, manifest, named, comparison.comparison, drawing);
    expect(stamp.anchors.map((anchor) => [anchor.id, anchor.stated])).toEqual([
      ["anchor_1", true],
      ["anchor_2", false],
    ]);
    expect(differencesOf(manifest, named, comparison.comparison, compared)).toEqual([
      { label: "MatchClaims the belief filter leaves out", items: ["claim_1"] },
      { label: "Anchors gone", items: ["anchor_2"] },
    ]);
    expect(namedStamp(A, manifest, named, null, drawing).anchors.map((a) => a.stated)).toEqual([
      null,
      null,
    ]);
  });

  it("updates in one entry from the current potential MatchStamp, and is removed in one", () => {
    const { store, drawing } = setup();
    nameDownbeat(store, drawing);
    const manifest = store.view.blocks[A]?.manifest;
    if (manifest === undefined) throw new Error("no manifest");
    const { compared } = matchIndexes(doubted(), DEFAULT_MATCH_CLAIM_FILTER, ME, CONTEXT);
    const update = namedComparisons(manifest, compared)[0]?.comparison.update;
    if (update == null) throw new Error("no update");
    const before = store.journal.length;
    expect(store.dispatch(updateCommand(A, "matchstamp_1", update, compared, drawing))).toBe(null);
    expect(store.journal.length).toBe(before + 1);
    const graphical = store.view.blocks[A]?.manifest.graphical;
    expect(graphical?.matchstamps?.[0]?.alignment_anchors).toEqual([
      { id: "anchor_1", timestamps: ["timestamp_1", "timestamp_2"], display: ["line", "name"] },
    ]);
    expect(graphical?.matchstamps?.[0]?.match_claims).toEqual(["claim_2"]);
    expect(graphical?.timestamps?.map((item) => item.id)).toEqual(["timestamp_1", "timestamp_2"]);

    expect(store.dispatch(removeCommand(A, "matchstamp_1"))).toBe(null);
    expect(store.journal.length).toBe(before + 2);
    const removed = store.view.blocks[A]?.manifest.graphical;
    expect([removed?.matchstamps, removed?.timestamps]).toEqual([[], []]);
  });
});

/** A belief as the tab lists it before the provenance is read: no date, no note. */
const held = (actor: string, iri: string, who: string, belief: string) => ({
  actor,
  iri,
  who,
  belief,
  date: null,
  note: null,
});

describe("MatchClaims and beliefs", () => {
  it("lists every actor's belief and the user's own", () => {
    const table = matchTable();
    const me = DEFAULT_USER.name;
    expect(claimLines(table, ["claim_4", "claim_5", "claim_9"], DEFAULT_USER, CONTEXT)).toEqual([
      { id: "claim_4", held: true, beliefs: [held(OTHER, OTHER, OTHER, "true")], mine: null },
      { id: "claim_5", held: true, beliefs: [held(ME, ME, me, "true")], mine: "true" },
      { id: "claim_9", held: false, beliefs: [], mine: null },
    ]);
    expect(claimLines(null, ["claim_1"], DEFAULT_USER, CONTEXT)).toEqual([
      { id: "claim_1", held: false, beliefs: [], mine: null },
    ]);
  });

  it("compares actors as the IRIs they stand for under the manifest's context", () => {
    const plain = matchTable();
    const compact = `tilie:${encodeURIComponent(DEFAULT_USER.name)}`;
    const table = { ...plain, beliefs: { ...plain.beliefs, actors: [compact, OTHER] } };
    const context = { tilie: USER_TAG };
    const [line] = claimLines(table, ["claim_5"], DEFAULT_USER, context);
    expect(line).toEqual({
      id: "claim_5",
      held: true,
      beliefs: [held(compact, ME, DEFAULT_USER.name, "true")],
      mine: "true",
    });
    expect(claimLines(table, ["claim_5"], DEFAULT_USER, undefined)[0]?.mine).toBe(null);
    const believed = { timelines: null, belief: "true" } as const;
    expect(matchIndexes(table, believed, ME, context).compared.anchors.count).toBe(1);
    expect(matchIndexes(table, believed, ME, undefined).compared.anchors.count).toBe(0);
  });

  it("gives one entry line per MatchClaim, read or not", () => {
    const [claim] = claimLines(matchTable(), ["claim_4"], DEFAULT_USER, CONTEXT);
    if (claim === undefined) throw new Error("no line");
    expect(claimEntryLine(claim, null, DEFAULT_USER, CONTEXT)).toBe(null);
    expect(claimEntryLine(claim, undefined, DEFAULT_USER, CONTEXT)).toEqual({
      method: null,
      who: null,
      date: null,
      service: null,
      basis: [],
      match: null,
      note: null,
      beliefs: [held(OTHER, OTHER, OTHER, "true")],
    });
    const entry = {
      stated_by: [ME],
      date: "2026-11-20",
      method: "imported",
      service: "https://example.org/aligner",
      beliefs: [
        { actor: OTHER, belief: "true" as const, date: "2026-11-21", note: "seen in the score" },
      ],
    };
    expect(claimEntryLine(claim, entry, DEFAULT_USER, CONTEXT)).toEqual({
      method: "imported",
      who: DEFAULT_USER.name,
      date: "2026-11-20",
      service: "https://example.org/aligner",
      basis: [],
      match: null,
      note: null,
      beliefs: [
        {
          actor: OTHER,
          iri: OTHER,
          who: OTHER,
          belief: "true",
          date: "2026-11-21",
          note: "seen in the score",
        },
      ],
    });
  });
});

describe("the tab rule of MatchStamps", () => {
  it("shows a MatchStamp in the Matchstamp tab and lets it go to the tab before", () => {
    const { store } = setup();
    const { shown } = matchIndexes(matchTable(), DEFAULT_MATCH_CLAIM_FILTER, ME, CONTEXT);
    const held: HeldMatch = { kind: "potential", block: A, index: shown, matchStamp: 0 };
    const start: MatchShown = { picked: { tab: "journal", openings: 2 }, match: null };
    const pinned = matchPinned(start, held);
    expect(pinned).toEqual({
      picked: { tab: "matchstamp", openings: 2 },
      match: { ...held, before: "journal" },
    });
    expect(matchPinned(pinned, null)).toEqual(start);
    expect(matchPinned(start, null)).toBe(start);

    expect(matchOutlived(held, store.view, shown)).toBe(false);
    const other = matchIndexes(matchTable(), DEFAULT_MATCH_CLAIM_FILTER, OTHER, CONTEXT).shown;
    expect(matchOutlived(held, store.view, other)).toBe(true);
    expect(matchOutlived(held, store.view, null)).toBe(true);
  });

  it("names a named MatchStamp by its address and an anchor's, by nothing else", () => {
    const { store, drawing } = setup();
    nameDownbeat(store, drawing);
    const { view } = store;
    expect(namedMatchStampOf(view, { block: A, id: "matchstamp_1" })).toBe("matchstamp_1");
    expect(namedMatchStampOf(view, { block: A, id: "anchor_2" })).toBe("matchstamp_1");
    expect(namedMatchStampOf(view, { block: A, id: "timestamp_1" })).toBe(null);
    expect(namedMatchStampOf(view, { block: A })).toBe(null);
    const named: HeldMatch = { kind: "named", block: A, id: "matchstamp_1" };
    expect(matchOutlived(named, view, null)).toBe(false);
    store.dispatch(removeCommand(A, "matchstamp_1"));
    expect(matchOutlived(named, store.view, null)).toBe(true);
  });
});

describe("the overlay", () => {
  it("gives every block with a table its shown index and its named comparisons", () => {
    const { store, drawing } = setup();
    nameDownbeat(store, drawing);
    const table = matchTable([[[ME, "false"]], ...BELIEFS_BY_ROW.slice(1)]);
    const indexes = matchIndexes(table, NARROWED, ME, CONTEXT);
    const indexesOf = (block: string) => (block === A ? indexes : null);
    expect(matchInputs(store.view, [], indexesOf)).toEqual([]);
    const manifest = store.view.blocks[A]?.manifest;
    if (manifest === undefined) throw new Error("no manifest");
    const [input, ...others] = matchInputs(store.view, [A, "zzzzzzzzzz"], indexesOf);
    expect(others).toEqual([]);
    expect(input?.block).toBe(A);
    expect(input?.index).toBe(indexes.shown);
    expect(input?.named).toBe(namedComparisons(manifest, indexes.compared));
    expect(matchInputs(store.view, [A], () => null)).toEqual([]);
    // `stated` in the order of the MatchStamp's `alignment_anchors`: anchor_1 stated, anchor_2 not.
    const anchors = manifest.graphical?.matchstamps?.[0]?.alignment_anchors ?? [];
    const [named] = input?.named ?? [];
    expect(anchors.map((anchor) => anchor.id)).toEqual(["anchor_1", "anchor_2"]);
    expect(named?.comparison.stated.map((anchor) => anchor === null)).toEqual([false, true]);
  });

  it("pins a potential MatchStamp with its block, read from that block's shown index", () => {
    const indexes = matchIndexes(matchTable(), NARROWED, ME, CONTEXT);
    const indexesOf = (block: string) => (block === A ? indexes : null);
    const pinned: HeldMatch = { kind: "potential", block: A, index: indexes.shown, matchStamp: 1 };
    expect(pinnedMatchStampOf(pinned, indexesOf)).toEqual({ block: A, matchStamp: 1 });
    expect(pinnedMatchStampOf({ ...pinned, index: indexes.compared }, indexesOf)).toBe(null);
    expect(pinnedMatchStampOf(pinned, () => null)).toBe(null);
    expect(pinnedMatchStampOf({ kind: "named", block: A, id: "matchstamp_1" }, indexesOf)).toBe(
      null,
    );
    expect(pinnedMatchStampOf(null, indexesOf)).toBe(null);
  });
});
