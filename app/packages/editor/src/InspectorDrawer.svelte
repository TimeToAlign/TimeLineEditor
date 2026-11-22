<script lang="ts">
/**
 * The inspector drawer at the canvas's right edge: the `«` tab opens it, its
 * `»` button closes it, and the choice is remembered under `storageKey`
 * when one is given. Beside its heading it names what is selected; below,
 * the inspector, rendered only while the drawer is open. What the inspector
 * holds between showings (unapplied text, drafts, the tab chosen, the
 * pinned timestamp) is kept here, so closing the drawer loses none of it;
 * an editor opened while it is closed has the level tab shown when it
 * opens, and a timestamp pinned while it is closed opens it, as does
 * selecting exactly one named timestamp, or exactly one start or end mark
 * of a timeline, which pins that position. An unnamed pin is dropped, the
 * tab kept, once its block's manifest or the granularity changes or its
 * block is deleted; a named timestamp's pin is read anew from the view
 * after every change, and dropped once the timestamp is gone. A pin keeps
 * the line of the canvas it was read on, and so does the timestamp named
 * from it: both are read on that line while it is a place of their
 * position, as the flag read there (the arranger's `timelinePin`); a
 * timestamp selected or reloaded is read at its first place. An unnamed
 * pin held while an editor opens or closes is read again under the
 * ancestor card raised then and by the group a fresh reading then reads
 * (`heldPinOf`). A potential
 * MatchStamp pinned on the canvas, or exactly one named MatchStamp (or one
 * of its anchors) selected, is shown in the Matchstamp tab, opening the
 * drawer; a potential one is shown while its block's anchor index is the
 * one it was read from (no longer once its table, its filter or the user
 * changed), a named one while it exists. The editor gives the drawer the
 * MatchClaim tables and the one function reading their indexes, which the
 * canvas reads too.
 */
import type {
  Editing,
  KnotsOf,
  LivePlacement,
  LiveStore,
  MatchStampPin,
  Selection,
} from "@timetoalign/tilie-arranger";
import type { Address, Pin } from "@timetoalign/tilie-core";
import { fontMetrics } from "@timetoalign/timetoshare";
import { tick, untrack } from "svelte";
import Inspector from "./inspector/Inspector.svelte";
import { ManifestText } from "./inspector/manifestText.svelte.ts";
import type { MatchIndexes } from "./inspector/matchstamps.ts";
import { PropertyDrafts } from "./inspector/propertyDrafts.svelte.ts";
import type { HeldMatch, Picked, ShownMatch, ShownPin } from "./inspector/tabs.ts";
import {
  heldOf,
  initialPick,
  matchOutlived,
  matchPinned,
  namedMatchStampOf,
  namesTimestamp,
  outlived,
  pinned,
  toggled,
} from "./inspector/tabs.ts";
import type { ReadOn } from "./inspector/timestamp.ts";
import {
  boundaryPinOf,
  heldPinOf,
  namedAddress,
  namedPinOf,
  raisedOf,
} from "./inspector/timestamp.ts";
import { inspectedSubject } from "./inspector/words.ts";
import type { MatchClaimTables } from "./matchClaims.svelte.ts";

interface Props {
  live: LiveStore;
  selection: Selection;
  /** The placement a gesture on the canvas shows before release. */
  placement: LivePlacement | null;
  /** Where the open or closed state is remembered (`localStorage`); `null` remembers nothing. */
  storageKey: string | null;
  /**
   * The expanded MeasureMaps of a manifest as the canvas reads them, which
   * a named timestamp and the Matchstamp tab's coordinates are read with,
   * read again when they arrive; without it no server expands them.
   */
  knotsOf?: KnotsOf | undefined;
  /** The MatchClaim tables of the workspace's blocks; none read without a server. */
  tables: MatchClaimTables;
  /**
   * The anchor indexes of block `block`'s table under its MatchClaim filter
   * and the user's beliefs (`blockIndexes`): the one the overlay draws and
   * the Matchstamp tab reads a potential MatchStamp from (`shown`), and the
   * one named MatchStamps are compared with; `null` while no table is loaded.
   */
  indexesOf: (block: string) => MatchIndexes | null;
}

let { live, selection, placement, storageKey, knotsOf, tables, indexesOf }: Props = $props();

const id = $props.id();

/** The remembered state; closed when nothing is remembered or storage is unavailable. */
function remembered(key: string | null): boolean {
  if (key === null) return false;
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

/** The viewer's own state, never written to the workspace; read from storage once, at mount. */
let open = $state(untrack(() => remembered(storageKey)));
let tab: HTMLButtonElement | undefined = $state();
let close: HTMLButtonElement | undefined = $state();
/** What the selection names, shown beside the heading. */
const subject = $derived(inspectedSubject(live.view, selection));

/** The inspector's state between showings: its typed text, its drafts and the tab chosen. */
const manifest = new ManifestText();
const drafts = new PropertyDrafts();
let picked: Picked = $state.raw(untrack(() => initialPick(live.editing.length, live.openings)));
let pin = $state.raw<ShownPin | null>(null);
/**
 * Where the pin held was read: the canvas's line (`null` where unknown, as
 * for a selected timestamp) and the root raised then. The line stays with
 * the timestamp named from the pin and with the pin moved or named in the
 * tab; another pin sets both.
 */
let readOn = $state.raw<ReadOn>({ line: null, raised: null });
/** The MatchStamp last shown, with the tab shown before it; `null` for none. */
let heldMatch = $state.raw<ShownMatch | null>(null);
/** The MatchStamp the Matchstamp tab shows: the one held, while it holds in the view and the indexes. */
const match: ShownMatch | null = $derived(
  heldMatch !== null &&
    matchOutlived(heldMatch, live.view, indexesOf(heldMatch.block)?.shown ?? null)
    ? null
    : heldMatch,
);
let inspector: ReturnType<typeof Inspector> | undefined = $state();

/** The innermost open editor, whose raised ancestor cards the canvas shows; `null` on the arranger. */
const editing: Editing | null = $derived(live.editing.at(-1) ?? null);

/**
 * The pin of the timestamp shown: an unnamed pin as held, read again once
 * the open editor raises another ancestor card or a fresh reading reads
 * the group otherwise (`heldPinOf`), a named
 * timestamp's read anew from the view with the canvas's MeasureMap rows,
 * on the lines the canvas shows under the open editor; both on the line
 * they were read on while it is a place of their position.
 */
const timestamp: Pin | null = $derived.by(() => {
  if (pin === null) return null;
  const address = namedAddress(pin.pin);
  if (address === null) return heldPinOf(live.view, pin.pin, fontMetrics, editing, readOn);
  return namedPinOf(live.view, address, fontMetrics, knotsOf, editing, readOn.line);
});

/**
 * Hold `next`, a pin the inspector derived from the one shown (moved or
 * named in the Timestamp tab) or `null`: a new pin keeps the line and is
 * read under the root raised now.
 */
function hold(next: ShownPin | null): void {
  if (next !== null && next.pin !== pin?.pin) {
    readOn = { line: readOn.line, raised: raisedOf(live.view, next.pin, editing) };
  }
  pin = next;
}

/** The pin of the timestamp the Timestamp tab shows, which the canvas marks; `null` for none. */
export function shownPin(): Pin | null {
  return timestamp;
}

/** Whether the drawer is open. */
export function isOpen(): boolean {
  return open;
}

/** Open or close the drawer and remember the choice; the focus stays where it is. */
export function setOpen(next: boolean): void {
  if (next !== open) picked = toggled(picked, live.openings, next);
  open = next;
  if (storageKey === null) return;
  try {
    localStorage.setItem(storageKey, String(next));
  } catch {
    // Without storage the choice holds until the editor goes.
  }
}

/**
 * Pin `next` in the Timestamp tab, read on the canvas's line keyed `line`
 * (`null` where it was not read on the canvas), opening the drawer and
 * selecting the tab, or clear the pin (`null`), showing again the tab
 * shown before the first pin.
 */
export function pinTimestamp(next: Pin | null, line: string | null = null): void {
  const held = next === null ? null : heldOf(live.view, next);
  if (held !== null && !open) setOpen(true);
  if (held !== null) {
    heldMatch = null;
    readOn = { line, raised: raisedOf(live.view, held.pin, editing) };
  }
  ({ picked, pin } = pinned({ picked, pin }, held));
}

/** Show `next` in the Matchstamp tab, opening the drawer and selecting the tab, or let it go (`null`). */
function showMatch(next: HeldMatch | null): void {
  if (next !== null && !open) setOpen(true);
  if (next !== null) pin = null;
  ({ picked, match: heldMatch } = matchPinned({ picked, match }, next));
}

/**
 * Pin the potential MatchStamp `pin` (its block and its number in that
 * block's shown index, `indexesOf`) in the Matchstamp tab, or let a pinned
 * one go (`null`).
 */
export function pinMatchStamp(pin: MatchStampPin | null): void {
  const index = pin === null ? null : (indexesOf(pin.block)?.shown ?? null);
  if (pin === null || index === null) {
    if (match?.kind === "potential") showMatch(null);
    return;
  }
  showMatch({ kind: "potential", block: pin.block, index, matchStamp: pin.matchStamp });
}

/** The MatchStamp the Matchstamp tab shows; `null` for none. */
export function shownMatch(): HeldMatch | null {
  return match;
}

/**
 * The selection changed to `addresses`: exactly one named timestamp is
 * shown in the Timestamp tab, opening the drawer, and exactly one start or
 * end mark of a timeline pins that position there, unnamed
 * (`boundaryPinOf`); any other selection clears a named timestamp shown, an
 * unnamed pin staying. A selection names addresses only, never the line a
 * drawn wedge was pressed on, so a timestamp selected is read at its first
 * place, but for the one shown, which keeps its line.
 */
export function selected(addresses: readonly Address[]): void {
  const [only, ...others] = addresses;
  const one = only !== undefined && others.length === 0 ? only : null;
  const shown =
    one === null
      ? null
      : namesTimestamp(live.view, one)
        ? namedPinOf(live.view, one, fontMetrics, knotsOf, editing)
        : boundaryPinOf(live.view, one, fontMetrics, knotsOf, editing);
  const matchStamp = one === null ? null : namedMatchStampOf(live.view, one);
  if (one !== null && one.block !== undefined && matchStamp !== null) {
    showMatch({ kind: "named", block: one.block, id: matchStamp });
  } else if (match !== null && match.kind === "named") showMatch(null);
  const again =
    shown?.named !== undefined &&
    shown.named !== null &&
    shown.spec.block === pin?.pin.spec.block &&
    shown.named.id === pin.pin.named?.id;
  if (shown !== null) pinTimestamp(shown, again ? readOn.line : null);
  else if (pin !== null && pin.pin.named !== null) pinTimestamp(null);
}

// A pin is dropped, the tab kept, once it no longer holds: its values were read from another manifest or granularity.
$effect(() => {
  if (pin !== null && outlived(pin, live.view)) pin = null;
});

/** A click in the editor outside the canvas at `target`: clears the pin unless it lies in the tab list or the shown panel. */
export function clickedAt(target: EventTarget | null): void {
  if (pin !== null && !(inspector?.holds(target) ?? false)) pinTimestamp(null);
}

/** Open or close the drawer and move the focus to the control that undoes it. */
async function show(next: boolean): Promise<void> {
  setOpen(next);
  await tick();
  (next ? close : tab)?.focus();
}
</script>

{#if !open}
  <button
    type="button"
    class="tab"
    aria-expanded="false"
    aria-controls="{id}-drawer"
    aria-label="Open inspector"
    title="Open inspector"
    bind:this={tab}
    onclick={() => show(true)}>«</button
  >
{/if}
<aside
  id="{id}-drawer"
  class="inspector"
  data-testid="inspector"
  aria-labelledby="{id}-heading"
  aria-describedby={subject === null ? undefined : `${id}-subject`}
  hidden={!open}
>
  <div class="head">
    <div class="title">
      <h2 id="{id}-heading">Inspector</h2>
      {#if subject !== null}
        <p id="{id}-subject" class="subject" data-testid="inspector-subject">
          {#if subject.name !== null}
            {subject.words} {subject.name}
          {:else if subject.id !== null}
            {subject.words} <code>{subject.id}</code>
          {:else}
            {subject.words}
          {/if}
        </p>
      {/if}
    </div>
    <button
      type="button"
      aria-expanded={open}
      aria-controls="{id}-drawer"
      aria-label="Close inspector"
      title="Close inspector"
      bind:this={close}
      onclick={() => show(false)}>»</button
    >
  </div>
  {#if open}
    <Inspector
      bind:this={inspector}
      {live}
      {selection}
      {placement}
      {manifest}
      {drafts}
      bind:picked
      bind:pin={() => pin, hold}
      {timestamp}
      bind:match={() => match, (next) => (heldMatch = next)}
      {tables}
      {indexesOf}
      {knotsOf}
    />
  {/if}
</aside>

<style>
  button {
    font: inherit;
    color: inherit;
    cursor: pointer;
  }

  button:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }

  /* The closed drawer's tab, protruding from the canvas's right edge near the top. */
  .tab {
    position: absolute;
    top: 0.75rem;
    right: 0;
    z-index: 10;
    padding: 0.4rem 0.35rem;
    border: 1px solid #d0d0d0;
    border-right: none;
    border-radius: 4px 0 0 4px;
    background: #fefefe;
    box-shadow: 0 0 2px 1px rgba(0, 0, 0, 0.08);
  }

  .tab:hover,
  .head button:hover {
    background: #f4f4f4;
  }

  /* A share of the editor's width; the arranger takes the rest. */
  .inspector {
    display: flex;
    flex: none;
    flex-direction: column;
    width: clamp(22rem, 32cqw, 40rem);
    max-width: 60cqw;
    border-left: 1px solid #d0d0d0;
    background: #fff;
    overflow: auto;
  }

  .inspector[hidden] {
    display: none;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.25rem 0.5rem 0.25rem 0.75rem;
  }

  /* The heading, and beside it what is being inspected. */
  .title {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    min-width: 0;
  }

  h2 {
    flex: none;
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #595959;
  }

  .subject {
    margin: 0;
    overflow: hidden;
    font-size: 0.8rem;
    color: #1a1a1a;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .subject code {
    font-family: ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace;
  }

  .head button {
    padding: 0.2rem 0.45rem;
    border: 1px solid transparent;
    border-radius: 3px;
    background: none;
  }
</style>
