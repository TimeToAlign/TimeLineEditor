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

import type { MatchClaimTable } from "@timetoalign/tilie-client";
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
  View,
} from "@timetoalign/tilie-core";
import {
  anchorIndexOf,
  BELIEFS,
  beliefMask,
  checkMatchStamp,
  claimRowsOf,
  coordinateDict,
  coordinateValue,
  copyValue,
  findTimeline,
  matchStampAnchors,
  matchStampMembers,
  matchStampSpec,
  prettyText,
  prettyUnit,
} from "@timetoalign/tilie-core";
import type { CoordinateValue } from "@timetoalign/tilie-core/numbers";
import { axisValueOf, toRational } from "@timetoalign/tilie-core/numbers";
import type { Drawing, LineAxis } from "@timetoalign/tilie-layout";
import { abscissaOf, lineAxes } from "@timetoalign/tilie-layout";
import type { Belief } from "@timetoalign/timetoshare";
import { ANCHOR_DISPLAY } from "@timetoalign/timetoshare";
import type { Format, Text } from "./formats.svelte.ts";
import { writeText } from "./formats.svelte.ts";
import type { Result } from "./problems.ts";
import type { HeldMatch } from "./tabs.ts";

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
 * editor's one user), each built once per table and filter.
 */
export function matchIndexes(
  table: MatchClaimTable,
  filter: MatchClaimFilter,
  believer: string,
): MatchIndexes {
  const mask = () => beliefMask(table.beliefs, believer, filter.belief);
  const compared = cachedIndex(table, JSON.stringify([believer, filter.belief]), () =>
    anchorIndexOf(table.columns, mask()),
  );
  const { timelines } = filter;
  if (timelines === null) return { compared, shown: compared };
  const shown = cachedIndex(table, JSON.stringify([believer, filter.belief, timelines]), () =>
    anchorIndexOf(table.columns, timelineMask(table, timelines, mask())),
  );
  return { compared, shown };
}

/** A named MatchStamp compared with the current table: its ID and core's comparison. */
export interface NamedComparison {
  readonly id: string;
  readonly comparison: MatchStampCheck;
}

const comparisonCache = new WeakMap<Manifest, WeakMap<AnchorIndex, readonly NamedComparison[]>>();

/** Every named MatchStamp of `manifest` compared with `index` (`checkMatchStamp`), in the manifest's order. */
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
 * What the arranger's canvas draws as the match overlay (its `matches`
 * prop): the block, the anchor index of its potential MatchStamps (the
 * shown index) and its named MatchStamps compared with the current table
 * (against the compared index, so an anchor of a named MatchStamp on a
 * timeline the filter leaves out still counts as stated).
 */
export interface MatchOverlayInput {
  readonly block: string;
  readonly index: AnchorIndex;
  readonly named: readonly NamedComparison[];
}

/** The canvas's props of the match overlay. */
export interface MatchOverlay {
  readonly matches: MatchOverlayInput | null;
  /** The potential MatchStamp of `matches.index` the Matchstamp tab shows, drawn blue; `null` for none. */
  readonly pinnedMatchStamp: number | null;
  /** A click on a potential MatchStamp of the overlay (its number), or elsewhere (`null`). */
  readonly onmatchstamppin: (set: number | null) => void;
}

/**
 * The overlay of block `block` of `view`, from its table's indexes
 * (`null`: no block or no table, so no overlay), with the potential
 * MatchStamp `shown` pinned where it was read from the shown index.
 */
export function matchOverlay(
  view: View,
  block: string | null,
  indexes: MatchIndexes | null,
  shown: HeldMatch | null,
  onmatchstamppin: (set: number | null) => void,
): MatchOverlay {
  const manifest = block === null ? undefined : view.blocks[block]?.manifest;
  if (block === null || indexes === null || manifest === undefined) {
    return { matches: null, pinnedMatchStamp: null, onmatchstamppin };
  }
  const pinned =
    shown?.kind === "potential" && shown.block === block && shown.index === indexes.shown
      ? shown.matchStamp
      : null;
  return {
    matches: {
      block,
      index: indexes.shown,
      named: namedComparisons(manifest, indexes.compared),
    },
    pinnedMatchStamp: pinned,
    onmatchstamppin,
  };
}

// --- Screen order ------------------------------------------------------------

/** A coordinate of a MatchStamp: a timeline's ID and a value on its own axis. */
export interface StampCoordinate {
  readonly timeline: string;
  readonly value: CoordinateValue;
}

/** Where a coordinate is drawn in its block: its line's ordinate, then its abscissa. */
type ScreenKey = readonly [number, number];

/** The drawn lines of a block, in drawing order, which screen order reads. */
export type Lines = readonly LineAxis[];

/** The drawn lines of `drawing`. */
export function linesOf(drawing: Drawing): Lines {
  return [...lineAxes(drawing).values()];
}

/** Where `coordinate` is drawn: on the first line drawing its timeline; after every line where none does. */
function screenKey(lines: Lines, coordinate: StampCoordinate): ScreenKey {
  const line = lines.find((item) => item.timeline === coordinate.timeline);
  if (line === undefined) return [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const { value } = coordinate;
  return [line.y, abscissaOf(line, typeof value === "number" ? value : toRational(value))];
}

function compareKeys(left: ScreenKey, right: ScreenKey): number {
  return left[0] - right[0] || left[1] - right[1];
}

/** Whether two coordinates are one: one timeline, one exact value. */
function sameCoordinate(left: StampCoordinate, right: StampCoordinate): boolean {
  if (left.timeline !== right.timeline) return false;
  if (typeof left.value === "number" || typeof right.value === "number") {
    return left.value === right.value;
  }
  return toRational(left.value).equals(toRational(right.value));
}

/** `coordinates` in screen order: top to bottom, then left to right; an equal place keeps the given order. */
export function inScreenOrder(
  lines: Lines,
  coordinates: readonly StampCoordinate[],
): StampCoordinate[] {
  return coordinates
    .map((coordinate) => ({ coordinate, key: screenKey(lines, coordinate) }))
    .sort((left, right) => compareKeys(left.key, right.key))
    .map(({ coordinate }) => coordinate);
}

type Pair = readonly [StampCoordinate, StampCoordinate];

/** `pair` in screen order: its upper coordinate first, the left one on one line. */
function pairInScreenOrder(lines: Lines, [left, right]: Pair): Pair {
  return compareKeys(screenKey(lines, right), screenKey(lines, left)) < 0
    ? [right, left]
    : [left, right];
}

/**
 * `pairs` in screen order: each pair its upper coordinate first (the left
 * one on one line), the pairs by their first coordinate, then their second.
 */
export function pairsInScreenOrder(lines: Lines, pairs: readonly Pair[]): Pair[] {
  return pairs
    .map((given) => {
      const pair = pairInScreenOrder(lines, given);
      return { pair, first: screenKey(lines, pair[0]), second: screenKey(lines, pair[1]) };
    })
    .sort(
      (left, right) =>
        compareKeys(left.first, right.first) || compareKeys(left.second, right.second),
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

/** The potential MatchStamp `matchStamp` of `index`, in block `block` drawn as `lines`. */
export function potentialStamp(
  block: string,
  index: AnchorIndex,
  matchStamp: number,
  lines: Lines,
): ShownStamp {
  const anchors = matchStampAnchors(index, matchStamp);
  const members = Array.from(matchStampMembers(index, matchStamp), (c) =>
    indexCoordinate(index, c),
  );
  return {
    block,
    id: null,
    name: null,
    coordinates: inScreenOrder(lines, members),
    anchors: pairsInScreenOrder(lines, indexPairs(index, anchors)).map((coordinates) => ({
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
 * as `lines`, its anchors in the manifest's order, each stated or not as
 * `comparison` (the current table's) says; `null` without a table.
 */
export function namedStamp(
  block: string,
  manifest: Manifest,
  matchstamp: NamedMatchStamp,
  comparison: MatchStampCheck | null,
  lines: Lines,
): ShownStamp {
  const spec = matchStampSpec(manifest, matchstamp);
  const anchors = matchstamp.alignment_anchors.map((anchor, at): StampAnchor => {
    const coordinates = spec.anchors[at]?.coordinates;
    if (coordinates === undefined) throw new Error(`'${anchor.id}' joins two coordinates`);
    return {
      key: anchor.id,
      id: anchor.id,
      coordinates: pairInScreenOrder(lines, coordinates),
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
    coordinates: inScreenOrder(lines, unique),
    anchors,
    claims: matchstamp.match_claims,
  };
}

/** The named MatchStamps of `manifest` an anchor of which names the match timestamp `timestamp`. */
export function matchStampsOf(manifest: Manifest, timestamp: string): readonly NamedMatchStamp[] {
  return (manifest.graphical?.matchstamps ?? []).filter((matchstamp) =>
    matchstamp.alignment_anchors.some((anchor) => anchor.timestamps.includes(timestamp)),
  );
}

// --- Coordinates -------------------------------------------------------------

/** A timestamp of a MatchStamp as the Coordinates area lists it. */
export interface CoordinateRow {
  /** Unique among the rows of one MatchStamp. */
  readonly key: string;
  readonly timeline: string;
  /** The timeline's name, else its ID. */
  readonly name: string;
  /** The exact value (`copyValue`). */
  readonly text: string;
  /** The pretty unit; `null` where the timeline is no longer in the manifest. */
  readonly unit: string | null;
  /** The pretty text (`prettyText`), `null` where it is the exact text. */
  readonly pretty: string | null;
}

/** The rows of `coordinates` of a MatchStamp of `manifest`, in the order given. */
export function coordinateRows(
  manifest: Manifest,
  coordinates: readonly StampCoordinate[],
): CoordinateRow[] {
  return coordinates.map((coordinate, at) => {
    const timeline = findTimeline(manifest, coordinate.timeline);
    const key = JSON.stringify([at, coordinate.timeline]);
    if (timeline === undefined) {
      return {
        key,
        timeline: coordinate.timeline,
        name: coordinate.timeline,
        text: String(coordinate.value),
        unit: null,
        pretty: null,
      };
    }
    const text = copyValue(coordinate.value, timeline.number_type);
    const pretty = prettyText(coordinate.value, timeline.number_type, timeline.unit);
    return {
      key,
      timeline: timeline.id,
      name: timeline.name ?? timeline.id,
      text,
      unit: prettyUnit(timeline.unit),
      pretty: pretty === text ? null : pretty,
    };
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

/** One actor's belief in a MatchClaim. */
export interface BeliefLine {
  readonly actor: string;
  readonly belief: Belief;
}

/** A MatchClaim behind a MatchStamp as the tab lists it. */
export interface ClaimLine {
  readonly id: string;
  /** Whether the table holds it; `false` without a table. */
  readonly held: boolean;
  /** Every actor's belief in it, as the table states them. */
  readonly beliefs: readonly BeliefLine[];
  /** The belief of `user`; `null` while they state none. */
  readonly mine: Belief | null;
}

const rowCache = new WeakMap<MatchClaimTable, ReadonlyMap<string, number>>();

function rowOf(table: MatchClaimTable, id: string): number | undefined {
  let rows = rowCache.get(table);
  if (rows === undefined) {
    rows = new Map(table.columns.claimIds.map((claim, row) => [claim, row]));
    rowCache.set(table, rows);
  }
  return rows.get(id);
}

/** The MatchClaims `ids` with their beliefs in `table` (none without one), `user` the IRI of the editor's user. */
export function claimLines(
  table: MatchClaimTable | null,
  ids: readonly string[],
  user: string,
): ClaimLine[] {
  return ids.map((id) => {
    const row = table === null ? undefined : rowOf(table, id);
    if (table === null || row === undefined) return { id, held: false, beliefs: [], mine: null };
    const { actors, offsets, actor, word } = table.beliefs;
    const beliefs: BeliefLine[] = [];
    for (let at = offsets[row] as number; at < (offsets[row + 1] as number); at += 1) {
      const belief = BELIEFS[word[at] as number];
      const name = actors[actor[at] as number];
      if (belief !== undefined && name !== undefined) beliefs.push({ actor: name, belief });
    }
    const mine = beliefs.find((line) => line.actor === user)?.belief ?? null;
    return { id, held: true, beliefs, mine };
  });
}

// --- What differs ------------------------------------------------------------

/** One kind of difference between a named MatchStamp and the current table, with what differs. */
export interface Difference {
  readonly label: string;
  readonly items: readonly string[];
}

/** A coordinate as a difference names it: the timeline's name and the exact value. */
function coordinateText(manifest: Manifest, coordinate: StampCoordinate): string {
  const [row] = coordinateRows(manifest, [coordinate]);
  return row === undefined ? coordinate.timeline : `${row.name} ${row.text}`;
}

/**
 * What differs between the named MatchStamp `matchstamp` and the current
 * table (`comparison`, against `index`), each kind with what differs, only
 * the kinds that do, in the order: MatchClaims missing from the table,
 * MatchClaims believed false, anchors gone, anchors new, MatchClaims
 * stating other anchors, MatchClaims new.
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
    { label: "MatchClaims believed false", items: comparison.claimsBelievedFalse },
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
 * screen order, as `stamp` holds them, and the MatchClaims behind it.
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
  const next = display.includes(word)
    ? display.filter((item) => item !== word)
    : ANCHOR_DISPLAY.filter((item) => item === word || display.includes(item));
  return { type: "set", changes: [{ target: { block, id: anchor }, values: { display: next } }] };
}

/**
 * The `set` updating the named MatchStamp `id` of block `block` from the
 * current potential MatchStamp `update` of `index` (core's comparison): its
 * anchors in screen order and the MatchClaims behind them, in one entry.
 */
export function updateCommand(
  block: string,
  id: string,
  update: MatchStampUpdate,
  index: AnchorIndex,
  lines: Lines,
): Command {
  const anchors = pairsInScreenOrder(lines, indexPairs(index, update.anchors));
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

// --- The table a manifest names ----------------------------------------------

/** The location of the MatchClaim table `manifest` names in its resources; `null` where it names none. */
export function namedTable(manifest: Manifest): string | null {
  return manifest.resources?.find((resource) => resource.type === "MatchClaim")?.url ?? null;
}

/** The last part of a location: the file name a picker gives for it. */
export function fileNameOf(url: string): string {
  return url.split(/[/\\]/).at(-1) ?? url;
}
