/** MatchStamps as the editor takes them; the expected values are derived in `README.md` ("MatchClaims and the Matchstamp tab"). */

import { drawingOf } from "@timetoalign/tilie-arranger";
import type { AnchorIndex, Store } from "@timetoalign/tilie-core";
import { coordinateOf, DEFAULT_MATCH_CLAIM_FILTER } from "@timetoalign/tilie-core";
import { compactJson, fontMetrics } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import type { Lines, StampCoordinate } from "../src/inspector/matchstamps.ts";
import {
  claimLines,
  differencesOf,
  linesOf,
  matchIndexes,
  matchOverlay,
  nameCommand,
  namedComparisons,
  namedStamp,
  potentialStamp,
  removeCommand,
  updateCommand,
} from "../src/inspector/matchstamps.ts";
import type { HeldMatch, MatchShown } from "../src/inspector/tabs.ts";
import { matchOutlived, matchPinned, namedMatchStampOf } from "../src/inspector/tabs.ts";
import { BELIEFS_BY_ROW, ME, matchTable, OTHER, q, tableManifest } from "./matches.ts";
import { storeOf } from "./support.ts";

const A = "0000000000";

function setup(): { store: Store; lines: Lines } {
  const store = storeOf(tableManifest());
  const block = store.view.blocks[A];
  if (block === undefined) throw new Error("the block is missing");
  return { store, lines: linesOf(drawingOf(block, store.view.graphical, fontMetrics)) };
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
function nameDownbeat(store: Store, lines: Lines): void {
  const { shown } = matchIndexes(matchTable(), DEFAULT_MATCH_CLAIM_FILTER, ME);
  const stamp = potentialStamp(A, shown, stampAt(shown, "clt_1", q(0)), lines);
  expect(store.dispatch(nameCommand(stamp, "Downbeat"))).toBe(null);
}

describe("the indexes", () => {
  it("builds one index per table and filter, the timelines narrowing only the shown one", () => {
    const table = matchTable();
    const plain = matchIndexes(table, DEFAULT_MATCH_CLAIM_FILTER, ME);
    expect(plain.shown).toBe(plain.compared);
    expect([plain.compared.anchors.count, plain.compared.matchStamps.count]).toEqual([4, 3]);
    expect(matchIndexes(table, DEFAULT_MATCH_CLAIM_FILTER, ME)).toEqual(plain);
    expect(matchIndexes(table, DEFAULT_MATCH_CLAIM_FILTER, ME).compared).toBe(plain.compared);

    const believed = matchIndexes(table, { timelines: null, belief: "true" }, ME);
    expect(believed.compared.anchors.count).toBe(1);

    const narrowed = matchIndexes(
      table,
      { timelines: ["clt_1", "dpt_1"], belief: "not_false" },
      ME,
    );
    expect(narrowed.compared).toBe(plain.compared);
    expect(narrowed.shown.anchors.count).toBe(2);
  });
});

describe("a potential MatchStamp", () => {
  it("lists its timestamps and anchors in screen order and the claims behind it", () => {
    const { lines } = setup();
    const { shown } = matchIndexes(matchTable(), DEFAULT_MATCH_CLAIM_FILTER, ME);
    const stamp = potentialStamp(A, shown, stampAt(shown, "clt_1", q(0)), lines);
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
    const { store, lines } = setup();
    const before = store.journal.length;
    nameDownbeat(store, lines);
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

describe("a named MatchStamp against the table", () => {
  /** The table with the user believing `claim_1` false. */
  const doubted = () => matchTable([[[ME, "false"]], ...BELIEFS_BY_ROW.slice(1)]);

  it("marks the anchors no longer stated and lists what differs", () => {
    const { store, lines } = setup();
    nameDownbeat(store, lines);
    const manifest = store.view.blocks[A]?.manifest;
    const named = manifest?.graphical?.matchstamps?.[0];
    if (manifest === undefined || named === undefined) throw new Error("not named");
    const { compared } = matchIndexes(doubted(), DEFAULT_MATCH_CLAIM_FILTER, ME);
    const [comparison] = namedComparisons(manifest, compared);
    expect(comparison?.id).toBe("matchstamp_1");
    if (comparison === undefined) throw new Error("no comparison");
    const stamp = namedStamp(A, manifest, named, comparison.comparison, lines);
    expect(stamp.anchors.map((anchor) => [anchor.id, anchor.stated])).toEqual([
      ["anchor_1", true],
      ["anchor_2", false],
    ]);
    expect(differencesOf(manifest, named, comparison.comparison, compared)).toEqual([
      { label: "MatchClaims believed false", items: ["claim_1"] },
      { label: "Anchors gone", items: ["anchor_2"] },
    ]);
    expect(namedStamp(A, manifest, named, null, lines).anchors.map((a) => a.stated)).toEqual([
      null,
      null,
    ]);
  });

  it("updates in one entry from the current potential MatchStamp, and is removed in one", () => {
    const { store, lines } = setup();
    nameDownbeat(store, lines);
    const manifest = store.view.blocks[A]?.manifest;
    if (manifest === undefined) throw new Error("no manifest");
    const { compared } = matchIndexes(doubted(), DEFAULT_MATCH_CLAIM_FILTER, ME);
    const update = namedComparisons(manifest, compared)[0]?.comparison.update;
    if (update == null) throw new Error("no update");
    const before = store.journal.length;
    expect(store.dispatch(updateCommand(A, "matchstamp_1", update, compared, lines))).toBe(null);
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

describe("MatchClaims and beliefs", () => {
  it("lists every actor's belief and the user's own", () => {
    const table = matchTable();
    expect(claimLines(table, ["claim_4", "claim_5", "claim_9"], ME)).toEqual([
      { id: "claim_4", held: true, beliefs: [{ actor: OTHER, belief: "true" }], mine: null },
      { id: "claim_5", held: true, beliefs: [{ actor: ME, belief: "true" }], mine: "true" },
      { id: "claim_9", held: false, beliefs: [], mine: null },
    ]);
    expect(claimLines(null, ["claim_1"], ME)).toEqual([
      { id: "claim_1", held: false, beliefs: [], mine: null },
    ]);
  });
});

describe("the tab rule of MatchStamps", () => {
  it("shows a MatchStamp in the Matchstamp tab and lets it go to the tab before", () => {
    const { store } = setup();
    const { shown } = matchIndexes(matchTable(), DEFAULT_MATCH_CLAIM_FILTER, ME);
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
    const other = matchIndexes(matchTable(), DEFAULT_MATCH_CLAIM_FILTER, OTHER).shown;
    expect(matchOutlived(held, store.view, other)).toBe(true);
    expect(matchOutlived(held, store.view, null)).toBe(true);
  });

  it("names a named MatchStamp by its address and an anchor's, by nothing else", () => {
    const { store, lines } = setup();
    nameDownbeat(store, lines);
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
  it("gives the shown index, the named comparisons and the pinned number of that index", () => {
    const { store, lines } = setup();
    nameDownbeat(store, lines);
    const onpin = () => undefined;
    expect(matchOverlay(store.view, A, null, null, onpin)).toEqual({
      matches: null,
      pinnedMatchStamp: null,
      onmatchstamppin: onpin,
    });
    const indexes = matchIndexes(
      matchTable(),
      { timelines: ["clt_1", "dpt_1"], belief: "not_false" },
      ME,
    );
    const pinned: HeldMatch = { kind: "potential", block: A, index: indexes.shown, matchStamp: 1 };
    const overlay = matchOverlay(store.view, A, indexes, pinned, onpin);
    expect(overlay.matches?.block).toBe(A);
    expect(overlay.matches?.index).toBe(indexes.shown);
    const manifest = store.view.blocks[A]?.manifest;
    if (manifest === undefined) throw new Error("no manifest");
    expect(overlay.matches?.named).toBe(namedComparisons(manifest, indexes.compared));
    expect(overlay.pinnedMatchStamp).toBe(1);
    const elsewhere: HeldMatch = { ...pinned, index: indexes.compared };
    expect(matchOverlay(store.view, A, indexes, elsewhere, onpin).pinnedMatchStamp).toBe(null);
  });
});
