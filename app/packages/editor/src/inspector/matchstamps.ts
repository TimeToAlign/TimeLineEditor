/**
 * MatchStamps as the Matchstamp tab and the canvas's overlay take them: the
 * anchor indexes of a block's MatchClaim table under its MatchClaim filter,
 * each named MatchStamp compared with the current table, a potential or a
 * named MatchStamp as the tab shows it (its timestamps and anchors in
 * screen order, the MatchClaims behind it with their beliefs), the
 * differences of an out-of-date one, its text in a format, and the
 * commands the tab sends: naming, renaming, an anchor's display, Update and
 * Remove. The index, the comparison and the commands' readers are core's;
 * nothing here computes an anchor or a potential MatchStamp.
 */

import type {
  MatchOverlayInput,
  MatchStampPin,
  NamedComparison,
} from "@timetoalign/tilie-arranger";
import { inScreenOrder, screenOrder, screenPlace } from "@timetoalign/tilie-arranger";
import type { ClaimEvents, MatchClaimTable } from "@timetoalign/tilie-client";
import type {
  AnchorDisplay,
  AnchorIndex,
  AnchorValue,
  Command,
  Json,
  Manifest,
  MatchClaimFilter,
  MatchStampCheck,
  MatchStampUpdate,
  NamedMatchStamp,
  User,
  View,
} from "@timetoalign/tilie-core";
import {
  actorIri,
  anchorIndexOf,
  BELIEFS,
  beliefMask,
  believedBy,
  canonicalText,
  checkMatchStamp,
  claimRowOf,
  claimRowsOf,
  coordinateDict,
  coordinateOf,
  coordinateValue,
  findTimeline,
  matchClaimFilterOf,
  matchStampAnchors,
  matchStampMembers,
  matchStampSpec,
  statedBy,
} from "@timetoalign/tilie-core";
import type { CoordinateValue } from "@timetoalign/tilie-core/numbers";
import { axisValueOf, toRational } from "@timetoalign/tilie-core/numbers";
import type { Drawing } from "@timetoalign/tilie-layout";
import type { Belief } from "@timetoalign/timetoshare";
import {
  ANCHOR_DISPLAY,
  CHUNK_SENTINEL,
  defaultCatalogue,
  NOMATCH_SENTINEL,
} from "@timetoalign/timetoshare";
import { iriNames } from "../iris.ts";
import type { Format, Text } from "./formats.svelte.ts";
import { writeText } from "./formats.svelte.ts";
import type { Result } from "./problems.ts";
import type { BeliefLine } from "./provenance.ts";
import { whoOf } from "./provenance.ts";
import { displayCommand } from "./stamps/commands.ts";
import type { HeldMatch } from "./tabs.ts";
import type { TimelineRows } from "./timestamp.ts";
import { coordinateGroup } from "./timestamp.ts";

// --- The indexes -------------------------------------------------------------

/**
 * The two anchor indexes of a table: `compared` under the belief filter
 * alone, which named MatchStamps are compared with (an anchor is stated when
 * a MatchClaim the belief filter passes gives it); `shown` under the belief
 * filter and the timelines filter, which the overlay draws and a potential
 * MatchStamp is read from. Without a timelines filter both are one index.
 */
export interface MatchIndexes {
  readonly compared: AnchorIndex;
  readonly shown: AnchorIndex;
  /**
   * The believer's belief in every MatchClaim of the table, per row
   * (core's `believedBy`), which the canvas colours the anchors of a shown
   * MatchStamp by.
   */
  readonly beliefs: Uint8Array;
}

/** The rows of `mask` (every row for `null`) whose two timelines are among `timelines`. */
export function timelineMask(
  table: MatchClaimTable,
  timelines: readonly string[],
  mask: Uint8Array | null,
): Uint8Array {
  const { columns } = table;
  const listed = new Set(timelines);
  const numbers = columns.timelines.map((timeline) => listed.has(timeline.id));
  const rows = new Uint8Array(columns.rows);
  for (let row = 0; row < columns.rows; row += 1) {
    const passes = mask === null || mask[row] === 1;
    const a = numbers[columns.a.timeline[row] as number] === true;
    const b = numbers[columns.b.timeline[row] as number] === true;
    rows[row] = passes && a && b ? 1 : 0;
  }
  return rows;
}

const indexCache = new WeakMap<MatchClaimTable, Map<string, AnchorIndex>>();

function cachedIndex(table: MatchClaimTable, key: string, build: () => AnchorIndex): AnchorIndex {
  let cached = indexCache.get(table);
  if (cached === undefined) {
    cached = new Map();
    indexCache.set(table, cached);
  }
  const known = cached.get(key);
  if (known !== undefined) return known;
  const index = build();
  cached.set(key, index);
  return index;
}

/**
 * The indexes of `table` under `filter` for the believer `believer` (the
 * editor's one user), the actors compared as their IRIs under `context`
 * (the block's manifest's `@context`, `undefined` for none: `actorIri`),
 * each built once per table, filter and context.
 */
export function matchIndexes(
  table: MatchClaimTable,
  filter: MatchClaimFilter,
  believer: string,
  context: unknown,
): MatchIndexes {
  const mask = () => beliefMask(table.beliefs, believer, filter.beliefs, context);
  const prefixes = context === undefined ? "" : canonicalText(context);
  const compared = cachedIndex(table, JSON.stringify([believer, filter.beliefs, prefixes]), () =>
    anchorIndexOf(table.columns, mask()),
  );
  const beliefs = believedBy(table.beliefs, believer, context ?? null);
  const { timelines } = filter;
  if (timelines === null) return { compared, shown: compared, beliefs };
  const key = JSON.stringify([believer, filter.beliefs, prefixes, timelines]);
  const shown = cachedIndex(table, key, () =>
    anchorIndexOf(table.columns, timelineMask(table, timelines, mask())),
  );
  return { compared, shown, beliefs };
}

/**
 * The indexes of block `block` of `view` holding the table `table` (`null`
 * for none) under the block's MatchClaim filter, for the believer
 * `believer` and under the block's manifest's `@context` (`matchIndexes`):
 * what the editor gives the canvas, the drawer and the Matchstamp tab, one
 * function for all three; `null` without a table or without the block.
 */
export function blockIndexes(
  view: View,
  block: string,
  table: MatchClaimTable | null,
  believer: string,
): MatchIndexes | null {
  const manifest = view.blocks[block]?.manifest;
  if (table === null || manifest === undefined) return null;
  const filter = matchClaimFilterOf(view.settings, block);
  return matchIndexes(table, filter, believer, manifest["@context"]);
}

const comparisonCache = new WeakMap<Manifest, WeakMap<AnchorIndex, readonly NamedComparison[]>>();

/**
 * Every named MatchStamp of `manifest` compared with `index`
 * (`checkMatchStamp`), in the manifest's order; each comparison's `stated`
 * follows its MatchStamp's `alignment_anchors` (`matchStampSpec` lists them
 * in that order), which is how the canvas finds the anchors to draw red.
 */
export function namedComparisons(
  manifest: Manifest,
  index: AnchorIndex,
): readonly NamedComparison[] {
  let byIndex = comparisonCache.get(manifest);
  if (byIndex === undefined) {
    byIndex = new WeakMap();
    comparisonCache.set(manifest, byIndex);
  }
  const known = byIndex.get(index);
  if (known !== undefined) return known;
  const compared = (manifest.graphical?.matchstamps ?? []).map((matchstamp) => ({
    id: matchstamp.id,
    comparison: checkMatchStamp(index, matchStampSpec(manifest, matchstamp)),
  }));
  byIndex.set(index, compared);
  return compared;
}

// --- The overlay -------------------------------------------------------------

/**
 * The canvas's `matches`: for every block of `blocks` (those holding a
 * table) that `view` still holds and whose table `indexesOf` gives, the
 * anchor index of its potential MatchStamps (the shown index) and its named
 * MatchStamps compared with its table (against the compared index, so an
 * anchor of a named MatchStamp on a timeline the filter leaves out still
 * counts as stated); in the order of `blocks`.
 */
export function matchInputs(
  view: View,
  blocks: readonly string[],
  indexesOf: (block: string) => MatchIndexes | null,
): readonly MatchOverlayInput[] {
  return blocks.flatMap((block) => {
    const manifest = view.blocks[block]?.manifest;
    const indexes = manifest === undefined ? null : indexesOf(block);
    if (manifest === undefined || indexes === null) return [];
    const named = namedComparisons(manifest, indexes.compared);
    return [{ block, index: indexes.shown, named, beliefs: indexes.beliefs }];
  });
}

/**
 * The canvas's `pinnedMatchStamp`: the potential MatchStamp the Matchstamp
 * tab shows (`shown`), with its block, where it was read from that block's
 * shown index as it is now (`indexesOf`); `null` for anything else.
 */
export function pinnedMatchStampOf(
  shown: HeldMatch | null,
  indexesOf: (block: string) => MatchIndexes | null,
): MatchStampPin | null {
  if (shown?.kind !== "potential") return null;
  return indexesOf(shown.block)?.shown === shown.index
    ? { block: shown.block, matchStamp: shown.matchStamp }
    : null;
}

// --- Screen order ------------------------------------------------------------

/** A coordinate of a MatchStamp: a timeline's ID and a value on its own axis. */
export interface StampCoordinate {
  readonly timeline: string;
  readonly value: CoordinateValue;
}

/** Whether two coordinates are one: one timeline, one exact value. */
function sameCoordinate(left: StampCoordinate, right: StampCoordinate): boolean {
  if (left.timeline !== right.timeline) return false;
  if (typeof left.value === "number" || typeof right.value === "number") {
    return left.value === right.value;
  }
  return toRational(left.value).equals(toRational(right.value));
}

type Pair = readonly [StampCoordinate, StampCoordinate];

/**
 * `pair` in screen order (the arranger's `screenOrder` in `drawing`, `raised`
 * naming the root whose ancestor cards are raised, `raisedRoot`, else
 * `null`): its upper coordinate first, the left one on one line.
 */
function pairInScreenOrder(drawing: Drawing, [left, right]: Pair, raised: string | null): Pair {
  const place = (coordinate: StampCoordinate) => screenPlace(drawing, coordinate, raised);
  return screenOrder(place(right), place(left)) < 0 ? [right, left] : [left, right];
}

/**
 * `pairs` in screen order in `drawing` under `raised` (`pairInScreenOrder`):
 * each pair its upper coordinate first (the left one on one line), the
 * pairs by their first coordinate, then their second; pairs at one place
 * keep the given order.
 */
function pairsInScreenOrder(
  drawing: Drawing,
  pairs: readonly Pair[],
  raised: string | null,
): Pair[] {
  return pairs
    .map((given) => {
      const pair = pairInScreenOrder(drawing, given, raised);
      return {
        pair,
        first: screenPlace(drawing, pair[0], raised),
        second: screenPlace(drawing, pair[1], raised),
      };
    })
    .sort(
      (left, right) =>
        screenOrder(left.first, right.first) || screenOrder(left.second, right.second),
    )
    .map(({ pair }) => pair);
}

// --- MatchStamps as the tab shows them ---------------------------------------

/** An alignment anchor as the tab shows it. */
export interface StampAnchor {
  /** Unique among the anchors of one MatchStamp: its ID, else its two coordinates. */
  readonly key: string;
  /** A named MatchStamp's anchor ID; `null` for a potential one. */
  readonly id: string | null;
  readonly coordinates: Pair;
  /** A named anchor's `display`; `null` for a potential one. */
  readonly display: readonly AnchorDisplay[] | null;
  /** Whether the current table states it: `null` without a table or for a potential one. */
  readonly stated: boolean | null;
}

/** A potential or named MatchStamp as the tab shows it. */
export interface ShownStamp {
  readonly block: string;
  /** A named MatchStamp's ID and name; both `null` for a potential one. */
  readonly id: string | null;
  readonly name: string | null;
  /** Its timestamps, one per coordinate, in screen order. */
  readonly coordinates: readonly StampCoordinate[];
  readonly anchors: readonly StampAnchor[];
  /** The IDs of the MatchClaims behind it: the table's for a potential one, those recorded for a named one. */
  readonly claims: readonly string[];
}

function indexCoordinate(index: AnchorIndex, coordinate: number): StampCoordinate {
  const number = index.coordinates.timeline[coordinate] as number;
  const timeline = index.columns.timelines[number]?.id;
  if (timeline === undefined) throw new Error(`coordinate ${coordinate} lies on a timeline`);
  return { timeline, value: coordinateValue(index, coordinate) };
}

function indexPairs(index: AnchorIndex, anchors: ArrayLike<number>): Pair[] {
  return Array.from(anchors, (anchor) => [
    indexCoordinate(index, index.anchors.low[anchor] as number),
    indexCoordinate(index, index.anchors.high[anchor] as number),
  ]);
}

/** The IDs of the MatchClaims stating `anchors` of `index`, in row order. */
function claimIds(index: AnchorIndex, anchors: ArrayLike<number>): string[] {
  return Array.from(claimRowsOf(index, anchors), (row) => index.columns.claimIds[row] as string);
}

/**
 * The potential MatchStamp `matchStamp` of `index`, in block `block` drawn
 * as `drawing`, in screen order there, `raised` naming the root whose
 * ancestor cards the open editor raises (the arranger's `raisedRoot`), else
 * `null`.
 */
export function potentialStamp(
  block: string,
  index: AnchorIndex,
  matchStamp: number,
  drawing: Drawing,
  raised: string | null = null,
): ShownStamp {
  const anchors = matchStampAnchors(index, matchStamp);
  const members = Array.from(matchStampMembers(index, matchStamp), (c) =>
    indexCoordinate(index, c),
  );
  return {
    block,
    id: null,
    name: null,
    coordinates: inScreenOrder(drawing, members, (coordinate) => coordinate, raised),
    anchors: pairsInScreenOrder(drawing, indexPairs(index, anchors), raised).map((coordinates) => ({
      key: JSON.stringify(coordinates.map((c) => [c.timeline, String(c.value)])),
      id: null,
      coordinates,
      display: null,
      stated: null,
    })),
    claims: claimIds(index, anchors),
  };
}

/**
 * The named MatchStamp `matchstamp` of `manifest`, in block `block` drawn
 * as `drawing` (in screen order under `raised`, as `potentialStamp`), its
 * anchors in the manifest's order, each stated or not as `comparison` (the
 * current table's) says; `null` without a table.
 */
export function namedStamp(
  block: string,
  manifest: Manifest,
  matchstamp: NamedMatchStamp,
  comparison: MatchStampCheck | null,
  drawing: Drawing,
  raised: string | null = null,
): ShownStamp {
  const spec = matchStampSpec(manifest, matchstamp);
  const anchors = matchstamp.alignment_anchors.map((anchor, at): StampAnchor => {
    const coordinates = spec.anchors[at]?.coordinates;
    if (coordinates === undefined) throw new Error(`'${anchor.id}' joins two coordinates`);
    return {
      key: anchor.id,
      id: anchor.id,
      coordinates: pairInScreenOrder(drawing, coordinates, raised),
      display: anchor.display,
      stated: comparison === null ? null : comparison.stated[at] !== null,
    };
  });
  const unique: StampCoordinate[] = [];
  for (const { coordinates } of anchors) {
    for (const coordinate of coordinates) {
      if (!unique.some((known) => sameCoordinate(known, coordinate))) unique.push(coordinate);
    }
  }
  return {
    block,
    id: matchstamp.id,
    name: matchstamp.name,
    coordinates: inScreenOrder(drawing, unique, (coordinate) => coordinate, raised),
    anchors,
    claims: matchstamp.match_claims,
  };
}

/**
 * The potential MatchStamp that naming `stamp` stores: the MatchStamp of
 * the compared index (the belief filter alone) holding `stamp`'s first
 * coordinate, so that a MatchStamp named under a timelines filter is the
 * whole MatchStamp the table states and is not out of date the moment it
 * is named (the timelines filter limits what is shown, never what is
 * stated). `stamp` itself where both indexes are one, or where the compared
 * index does not hold its coordinate. What is stored never depends on the
 * open editor: `stamp` is read with nothing raised, and so is the
 * MatchStamp returned (`potentialStamp` with `raised` `null`).
 */
export function stampToName(
  stamp: ShownStamp,
  indexes: MatchIndexes,
  drawing: Drawing,
): ShownStamp {
  const [first] = stamp.coordinates;
  if (indexes.shown === indexes.compared || first === undefined) return stamp;
  const { compared } = indexes;
  const coordinate = coordinateOf(compared, first.timeline, first.value);
  const matchStamp = coordinate < 0 ? undefined : compared.matchStamps.of[coordinate];
  return matchStamp === undefined
    ? stamp
    : potentialStamp(stamp.block, compared, matchStamp, drawing);
}

/**
 * What the tab says before `stamp` (as shown) is named as `named`
 * (`stampToName`): how many of the anchors naming stores lie on timelines
 * the MatchClaim filter hides; `null` when it stores what is shown.
 */
export function hiddenAnchorsNote(stamp: ShownStamp, named: ShownStamp): string | null {
  const hidden = named.anchors.length - stamp.anchors.length;
  if (hidden <= 0) return null;
  const anchors = hidden === 1 ? "1 anchor" : `${hidden} anchors`;
  return `Naming also stores ${anchors} on timelines the MatchClaim filter hides.`;
}

/** The named MatchStamps of `manifest` an anchor of which names the match timestamp `timestamp`. */
export function matchStampsOf(manifest: Manifest, timestamp: string): readonly NamedMatchStamp[] {
  return (manifest.graphical?.matchstamps ?? []).filter((matchstamp) =>
    matchstamp.alignment_anchors.some((anchor) => anchor.timestamps.includes(timestamp)),
  );
}

// --- Coordinates -------------------------------------------------------------

/**
 * The groups of `coordinates` of a MatchStamp of `manifest`, in the order
 * given, as the Timestamp tab's Coordinates show a timestamp's
 * (`coordinateGroup`): each its timeline's name, else its ID, and one row
 * "coordinate", the exact value in the timeline's unit and number type (its
 * text alone where the timeline is no longer in the manifest).
 */
export function stampRows(
  manifest: Manifest,
  coordinates: readonly StampCoordinate[],
): TimelineRows[] {
  return coordinates.map((coordinate, at) => {
    const key = JSON.stringify([at, coordinate.timeline]);
    const timeline = findTimeline(manifest, coordinate.timeline);
    if (timeline === undefined) {
      return coordinateGroup(
        key,
        coordinate.timeline,
        coordinate.timeline,
        String(coordinate.value),
      );
    }
    return coordinateGroup(key, timeline.id, timeline.name ?? timeline.id, {
      unit: timeline.unit,
      numberType: timeline.number_type,
      value: coordinate.value,
    });
  });
}

/**
 * `stamp` as JSON: its ID and name where it is named, its timestamps (each
 * `{timeline, coordinate}`, the coordinate a coordinate dict) in screen
 * order, its anchors as pairs of timestamp positions, and its MatchClaims.
 */
export function stampJson(manifest: Manifest, stamp: ShownStamp): Json {
  const position = (coordinate: StampCoordinate) =>
    stamp.coordinates.findIndex((known) => sameCoordinate(known, coordinate));
  const timestamps = stamp.coordinates.map((coordinate): Json => {
    const timeline = findTimeline(manifest, coordinate.timeline);
    return timeline === undefined
      ? { timeline: coordinate.timeline, coordinate: String(coordinate.value) }
      : {
          timeline: coordinate.timeline,
          coordinate: { ...coordinateDict(coordinate.value, timeline.unit, timeline.number_type) },
        };
  });
  const named: { [key: string]: Json } =
    stamp.id === null ? {} : { id: stamp.id, name: stamp.name };
  return {
    ...named,
    timestamps,
    alignment_anchors: stamp.anchors.map(({ coordinates }) => coordinates.map(position)),
    match_claims: [...stamp.claims],
  };
}

/** `stamp` as text in `format` (`stampJson`). */
export function stampText(format: Format, manifest: Manifest, stamp: ShownStamp): Result<Text> {
  return writeText(format, stampJson(manifest, stamp));
}

// --- MatchClaims and beliefs -------------------------------------------------

/** A MatchClaim behind a MatchStamp as the tab lists it. */
export interface ClaimLine {
  readonly id: string;
  /** Whether the table holds it; `false` without a table. */
  readonly held: boolean;
  /**
   * Every actor's belief in it, as the table states them, each actor's IRI
   * under the manifest's context and its words (`whoOf`: the user's name,
   * else a slug of the IRI, `iris.ts`); date and note
   * `null`, which only the provenance entry gives.
   */
  readonly beliefs: readonly BeliefLine[];
  /** The belief of `user`; `null` while they state none. */
  readonly mine: Belief | null;
}

/**
 * The MatchClaims `ids` with their beliefs in `table` (none without one),
 * `user` the editor's user, actors compared as their IRIs under `context`
 * (the manifest's `@context`, `actorIri`), as the belief filter compares them.
 */
export function claimLines(
  table: MatchClaimTable | null,
  ids: readonly string[],
  user: User,
  context: unknown,
): ClaimLine[] {
  const me = actorIri(context, statedBy(user));
  const names = iriNames(defaultCatalogue(), context);
  return ids.map((id) => {
    const row = table === null ? undefined : claimRowOf(table.columns).get(id);
    if (table === null || row === undefined) return { id, held: false, beliefs: [], mine: null };
    const { actors, offsets, actor, word } = table.beliefs;
    const beliefs: BeliefLine[] = [];
    for (let at = offsets[row] as number; at < (offsets[row + 1] as number); at += 1) {
      const belief = BELIEFS[word[at] as number];
      const name = actors[actor[at] as number];
      if (belief === undefined || name === undefined) continue;
      const iri = actorIri(context, name);
      beliefs.push({
        actor: name,
        iri,
        who: whoOf(iri, user, names),
        belief,
        date: null,
        note: null,
      });
    }
    const mine = beliefs.find((line) => line.iri === me)?.belief ?? null;
    return { id, held: true, beliefs, mine };
  });
}

/** The sentinels a side of a MatchClaim may be instead of an event. */
export type Sentinel = "CHUNK" | "NOMATCH";

/**
 * The MatchClaim table's reserved event IDs, each the sentinel it writes:
 * `CHUNK_SENTINEL` a position on a timeline that holds no event for it (the
 * anchor states it), `NOMATCH_SENTINEL` no counterpart.
 */
const SENTINELS: ReadonlyMap<string, Sentinel> = new Map([
  [CHUNK_SENTINEL, "CHUNK"],
  [NOMATCH_SENTINEL, "NOMATCH"],
]);

/** What the tab says a sentinel is, in plain words. */
export const SENTINEL_TITLES: Readonly<Record<Sentinel, string>> = {
  CHUNK: "a position on a timeline that holds no event for it",
  NOMATCH: "no counterpart on this timeline",
};

/**
 * One side of a MatchClaim as the tab shows it expanded: its timeline, its
 * ID and its name (else the ID), then its event (ID and name, `null` for
 * none), or the sentinel it is where it names no event.
 */
export type SideLine = {
  readonly timeline: string;
  readonly timelineName: string;
} & (
  | { readonly event: string; readonly name: string | null }
  | { readonly event: null; readonly sentinel: Sentinel }
);

/** What the tab shows of a MatchClaim expanded: its two sides and its certainty. */
export interface ClaimDetails {
  readonly sides: readonly [SideLine, SideLine];
  /** The certainty the table states; `null` for none. */
  readonly certainty: number | null;
}

/** The name of the timeline `id` in `manifest`, else the ID. */
function timelineNameOf(manifest: Manifest, id: string): string {
  return findTimeline(manifest, id)?.name ?? id;
}

/**
 * The details of the MatchClaim `id` among the events the server read
 * (`read`), its timelines named from `manifest`; `null` where `read` does
 * not hold it.
 */
export function claimDetails(
  read: readonly ClaimEvents[],
  id: string,
  manifest: Manifest,
): ClaimDetails | null {
  const events = read.find((item) => item.id === id);
  if (events === undefined) return null;
  const side = (timeline: string, event: string, name: string | null): SideLine => {
    const timelineName = timelineNameOf(manifest, timeline);
    const sentinel = SENTINELS.get(event);
    return sentinel === undefined
      ? { timeline, timelineName, event, name }
      : { timeline, timelineName, event: null, sentinel };
  };
  return {
    sides: [
      side(events.timeline_a_id, events.event_a_id, events.event_a_name),
      side(events.timeline_b_id, events.event_b_id, events.event_b_name),
    ],
    certainty: events.certainty,
  };
}

// --- What differs ------------------------------------------------------------

/** One kind of difference between a named MatchStamp and the current table, with what differs. */
export interface Difference {
  readonly label: string;
  readonly items: readonly string[];
}

/** A coordinate as a difference names it: the timeline's name and the exact value. */
function coordinateText(manifest: Manifest, coordinate: StampCoordinate): string {
  const [group] = stampRows(manifest, [coordinate]);
  const row = group?.rows[0];
  return group === undefined || row === undefined
    ? coordinate.timeline
    : `${group.name} ${row.text}`;
}

/**
 * What differs between the named MatchStamp `matchstamp` and the current
 * table (`comparison`, against `index`), each kind with what differs, only
 * the kinds that do, in the order: MatchClaims missing from the table,
 * MatchClaims the belief filter leaves out (their state for the user is
 * one the filter does not keep), anchors gone, anchors new,
 * MatchClaims stating other anchors, MatchClaims new.
 */
export function differencesOf(
  manifest: Manifest,
  matchstamp: NamedMatchStamp,
  comparison: MatchStampCheck,
  index: AnchorIndex,
): Difference[] {
  const gone = comparison.anchorsGone.map(
    (at) => matchstamp.alignment_anchors[at]?.id ?? String(at),
  );
  const fresh = indexPairs(index, comparison.anchorsNew).map(
    ([left, right]) => `${coordinateText(manifest, left)} – ${coordinateText(manifest, right)}`,
  );
  const kinds: Difference[] = [
    { label: "MatchClaims missing from the table", items: comparison.claimsMissing },
    { label: "MatchClaims the belief filter leaves out", items: comparison.claimsFilteredOut },
    { label: "Anchors gone", items: gone },
    { label: "Anchors new", items: fresh },
    { label: "MatchClaims stating other anchors", items: comparison.claimsElsewhere },
    { label: "MatchClaims new", items: comparison.claimsNew },
  ];
  return kinds.filter((kind) => kind.items.length > 0);
}

// --- Commands ----------------------------------------------------------------

function anchorValue(coordinate: StampCoordinate): AnchorValue {
  return { timeline: coordinate.timeline, coordinate: axisValueOf(coordinate.value) };
}

function anchorPair([left, right]: Pair): readonly [AnchorValue, AnchorValue] {
  return [anchorValue(left), anchorValue(right)];
}

/**
 * The `add` naming the potential MatchStamp `stamp` `name`: its anchors in
 * screen order, as `stamp` holds them, and the MatchClaims behind it. The
 * tab names `stampToName` of the MatchStamp it shows, read with nothing
 * raised, so what is stored does not depend on the open editor.
 */
export function nameCommand(stamp: ShownStamp, name: string): Command {
  return {
    type: "add",
    into: { block: stamp.block },
    matchstamp: {
      name,
      anchors: stamp.anchors.map(({ coordinates }) => anchorPair(coordinates)),
      match_claims: [...stamp.claims],
    },
  };
}

/** The `set` renaming the named MatchStamp `id` of block `block` `name`. */
export function renameCommand(block: string, id: string, name: string): Command {
  return { type: "set", changes: [{ target: { block, id }, values: { name } }] };
}

/** The `set` of the anchor `anchor`'s `display` with `word` toggled, in the schema's order. */
export function anchorDisplayCommand(
  block: string,
  anchor: string,
  display: readonly AnchorDisplay[],
  word: AnchorDisplay,
): Command {
  return displayCommand({ block, id: anchor }, ANCHOR_DISPLAY, display, word);
}

/**
 * The `set` updating the named MatchStamp `id` of block `block` from the
 * current potential MatchStamp `update` of `index` (core's comparison): its
 * anchors in screen order with nothing raised, as naming stores them
 * (`stampToName`), whichever editor is open, and the MatchClaims behind
 * them, in one entry.
 */
export function updateCommand(
  block: string,
  id: string,
  update: MatchStampUpdate,
  index: AnchorIndex,
  drawing: Drawing,
): Command {
  const anchors = pairsInScreenOrder(drawing, indexPairs(index, update.anchors), null);
  return {
    type: "set",
    changes: [
      {
        target: { block, id },
        values: {
          anchors: anchors.map(anchorPair),
          match_claims: [...update.claims],
        },
      },
    ],
  };
}

/** The `remove` deleting the named MatchStamp `id` of block `block`, and the match timestamps only it used. */
export function removeCommand(block: string, id: string): Command {
  return { type: "remove", targets: [{ block, id }] };
}

/** The named MatchStamp of block `block` that `after` holds and `before` does not; `null` for none. */
export function addedMatchStamp(
  before: Manifest | undefined,
  after: Manifest | undefined,
): NamedMatchStamp | null {
  const known = new Set((before?.graphical?.matchstamps ?? []).map((item) => item.id));
  return (after?.graphical?.matchstamps ?? []).find((item) => !known.has(item.id)) ?? null;
}
