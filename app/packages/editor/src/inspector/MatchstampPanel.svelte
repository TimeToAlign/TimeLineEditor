<script lang="ts">
/**
 * The Matchstamp tab, its areas one below the other, each a section of
 * `stamps/`: while a MatchStamp is shown, the **name header** first (naming
 * a potential MatchStamp stores the whole MatchStamp the table states,
 * saying so where the timelines filter hides some of its anchors; it stays
 * in view while the pane scrolls); **Coordinates** (`StampCoordinates`, the
 * Timestamp tab's): a hint while no MatchStamp is shown, else its
 * timestamps in screen order, shown disabled and copied, or its text in a
 * format; **Alignment anchors** (`MatchstampAnchors`), their toggles
 * inactive until it is named; **MatchClaims** (`MatchClaimList`); for a
 * named one what differs from the current table, Update and Remove
 * (`MatchstampActions`); the **MatchClaim filter** at the pane's bottom
 * (`MatchClaimFilter`). The tab reads what it shows here once and hands it
 * to its sections.
 */
import type { LiveStore } from "@timetoalign/tilie-arranger";
import { drawingOf } from "@timetoalign/tilie-arranger";
import type { Block, Manifest } from "@timetoalign/tilie-core";
import { fontMetrics } from "@timetoalign/timetoshare";
import type { MatchClaimTables } from "../matchClaims.svelte.ts";
import { userOf } from "../user.svelte.ts";
import type { Format } from "./formats.svelte.ts";
import type { MatchIndexes, ShownStamp } from "./matchstamps.ts";
import {
  addedMatchStamp,
  claimLines,
  differencesOf,
  hiddenAnchorsNote,
  nameCommand,
  namedComparisons,
  namedStamp,
  potentialStamp,
  renameCommand,
  stampRows,
  stampText,
  stampToName,
} from "./matchstamps.ts";
import { dispatchMatchStamp } from "./stamps/commands.ts";
import { StampDrafts } from "./stamps/drafts.svelte.ts";
import MatchClaimFilter from "./stamps/MatchClaimFilter.svelte";
import MatchClaimList from "./stamps/MatchClaimList.svelte";
import MatchstampActions from "./stamps/MatchstampActions.svelte";
import MatchstampAnchors from "./stamps/MatchstampAnchors.svelte";
import StampCoordinates from "./stamps/StampCoordinates.svelte";
import StampName from "./stamps/StampName.svelte";
import StampPane from "./stamps/StampPane.svelte";
import type { HeldMatch } from "./tabs.ts";

interface Props {
  /** The open workspace's store, read as Svelte state. */
  live: LiveStore;
  /** The block the selection lies in, whose MatchClaims are loaded and filtered while no MatchStamp is shown. */
  block: Block | null;
  /** The MatchStamp shown; `null` while none is. */
  match: HeldMatch | null;
  /** The MatchClaim tables of the workspace's blocks. */
  tables: MatchClaimTables;
  /**
   * The anchor indexes of a block's table under its MatchClaim filter and
   * the user's beliefs (`blockIndexes`), the canvas's and the drawer's
   * too; `null` while the block holds no table.
   */
  indexesOf: (block: string) => MatchIndexes | null;
  /** The MatchStamp shown is now `next`: a potential one named, or `null` once removed. */
  onmatch: (next: HeldMatch | null) => void;
}

let { live, block, match, tables, indexesOf, onmatch }: Props = $props();

const uid = $props.id();
/** The editor's one user, whose beliefs the MatchClaims list. */
const user = userOf();

const HINT =
  "Turn on Show matches (M) and click a match line to pin a potential MatchStamp. With Show matches off, click a named MatchStamp's connector to select it.";
const UNNAMED = "Naming the MatchStamp stores it; then its anchors' display can be set.";
const EMPTY_NAME = "A named MatchStamp keeps a name; Remove deletes it.";

/** The texts typed and the refusals, held for the MatchStamp they were typed for. */
const drafts = new StampDrafts(() => match);

const view = $derived(live.view);
/** The block whose MatchClaims the tab shows: the MatchStamp's, else the selection's. */
const blockId = $derived(match?.block ?? block?.id ?? null);
const shownBlock = $derived(blockId === null ? undefined : view.blocks[blockId]);
const manifest: Manifest | undefined = $derived(shownBlock?.manifest);
/** The manifest's `@context`, under which an actor stands for an IRI. */
const context: unknown = $derived(manifest?.["@context"]);
const loaded = $derived(blockId === null ? null : tables.of(blockId));
const indexes = $derived(blockId === null ? null : indexesOf(blockId));
const drawing = $derived(
  shownBlock === undefined ? null : drawingOf(shownBlock, view.graphical, fontMetrics),
);
/** The named MatchStamp shown, as its manifest holds it. */
const named = $derived.by(() => {
  if (match === null || match.kind !== "named") return null;
  return manifest?.graphical?.matchstamps?.find((item) => item.id === match.id) ?? null;
});
/** The named MatchStamp compared with the current table; `null` without a table. */
const comparison = $derived.by(() => {
  if (named === null || indexes === null || manifest === undefined) return null;
  return (
    namedComparisons(manifest, indexes.compared).find((item) => item.id === named.id)?.comparison ??
    null
  );
});
const stamp: ShownStamp | null = $derived.by(() => {
  if (match === null || manifest === undefined || drawing === null) return null;
  if (match.kind === "potential") {
    return potentialStamp(match.block, match.index, match.matchStamp, drawing);
  }
  return named === null ? null : namedStamp(match.block, manifest, named, comparison, drawing);
});
/**
 * What naming the potential MatchStamp shown stores: the whole MatchStamp
 * the table states under the belief filter (`stampToName`), which a
 * timelines filter only shows a part of; `null` for a named one.
 */
const naming: ShownStamp | null = $derived.by(() => {
  if (stamp === null || stamp.id !== null || drawing === null) return null;
  return indexes === null ? stamp : stampToName(stamp, indexes, drawing);
});
/** Why naming stores more anchors than are shown; `null` when it stores what is shown. */
const hidden = $derived(
  stamp === null || naming === null ? null : hiddenAnchorsNote(stamp, naming),
);
const groups = $derived(
  stamp === null || manifest === undefined ? null : stampRows(manifest, stamp.coordinates),
);
const claims = $derived(
  stamp === null ? [] : claimLines(loaded?.table ?? null, stamp.claims, user.state.user, context),
);
/** The provenance of the MatchClaims the table holds, read through the server; `null` without a server or table. */
const provenance = $derived.by(() => {
  if (stamp === null || manifest === undefined) return null;
  const held = claims.filter((claim) => claim.held).map((claim) => claim.id);
  return held.length === 0 ? null : tables.provenance(stamp.block, manifest, held);
});
const differences = $derived(
  named === null || comparison === null || indexes === null || manifest === undefined
    ? []
    : differencesOf(manifest, named, comparison, indexes.compared),
);
/** The IDs of the hints under the name of a potential MatchStamp: why its controls wait for a name. */
const unnamedHint = $derived(stamp !== null && stamp.id === null ? `${uid}-unnamed` : undefined);

/** A timeline's name, else its ID, in the shown block's manifest. */
function timelineName(id: string): string {
  return groups?.find((group) => group.timeline === id)?.name ?? id;
}

function textOf(format: Format) {
  return stamp === null || manifest === undefined ? null : stampText(format, manifest, stamp);
}

/** Enter or leaving the name field: name a potential MatchStamp, storing it, or rename a named one. */
function commitName(): void {
  const name = drafts.drafts.name;
  if (stamp === null || name === undefined) return;
  const shown = stamp;
  if (shown.id === null) {
    if (name === "" || naming === null) {
      drafts.settled("name");
      return;
    }
    const command = nameCommand(naming, name);
    const before = live.store.view.blocks[shown.block]?.manifest;
    if (!drafts.send("name", () => dispatchMatchStamp(live, shown.block, command))) return;
    const added = addedMatchStamp(before, live.store.view.blocks[shown.block]?.manifest);
    if (added !== null) onmatch({ kind: "named", block: shown.block, id: added.id });
  } else if (name === "") drafts.reverted("name", EMPTY_NAME);
  else if (name === shown.name) drafts.settled("name");
  else {
    const command = renameCommand(shown.block, shown.id, name);
    drafts.send("name", () => dispatchMatchStamp(live, shown.block, command));
  }
}
</script>

<StampPane>
  {#if stamp !== null}
    <StampName
      kind="matchstamp"
      name={stamp.name}
      {drafts}
      describedby={unnamedHint === undefined
        ? undefined
        : hidden === null
          ? unnamedHint
          : `${unnamedHint} ${uid}-hidden`}
      oncommit={commitName}
    >
      {#if unnamedHint !== undefined}
        <p class="hint" id={unnamedHint}>{UNNAMED}</p>
        {#if hidden !== null}
          <p class="hint" id="{uid}-hidden" data-testid="matchstamp-hidden-anchors">{hidden}</p>
        {/if}
      {/if}
    </StampName>
  {/if}

  <StampCoordinates kind="matchstamp" {groups} hint={HINT} {textOf} />

  {#if stamp !== null && match !== null && manifest !== undefined}
    <MatchstampAnchors {live} {stamp} {timelineName} {drafts} describedby={unnamedHint} />
    <MatchClaimList
      {stamp}
      {match}
      {manifest}
      {context}
      {claims}
      {loaded}
      {provenance}
      {tables}
      {indexesOf}
      {onmatch}
    />
    {#if stamp.id !== null}
      <MatchstampActions
        {live}
        {stamp}
        {comparison}
        {differences}
        {indexes}
        {drawing}
        {drafts}
        {onmatch}
      />
    {/if}
  {/if}

  <MatchClaimFilter {live} {blockId} {manifest} {tables} />
</StampPane>
