<script lang="ts">
/**
 * The inspector: the editing bar, then a tab list over nine panels: the
 * level tab (named by the level: Arranger, Bundle, Group, Timeline,
 * Children or Flow control, its
 * panel the level's title line and settings, `LevelPanel`), Properties,
 * Regions, Metadata, Manifest, Journal, Timestamp, Matchstamp and Elisions. The tabs that do
 * not fit the inspector's width start another row, so the tab list never
 * makes the inspector scroll sideways. Only the shown
 * panel is rendered; what the Properties, Regions, Elisions and Manifest tabs hold
 * between visits (typed text, open blocks, a chosen format) lives in their
 * state objects, which a host
 * keeping them while the inspector is not shown passes in, with the tab
 * chosen, the pinned timestamp and the MatchStamp shown. The Metadata and
 * Matchstamp tabs take the user from the editor's context, the Metadata
 * tab the lookup too. The top stays put: the editing bar and the tab list
 * never scroll, only the panels do, in their own scroll container, where a
 * stamp tab keeps its name header at the top.
 */
import type { KnotsOf, LivePlacement, LiveStore, Selection } from "@timetoalign/tilie-arranger";
import { resolveSelection } from "@timetoalign/tilie-arranger";
import type { Address, Pin } from "@timetoalign/tilie-core";
import { fontMetrics } from "@timetoalign/timetoshare";
import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";
import { MatchClaimTables } from "../matchClaims.svelte.ts";
import { paneOf } from "../pane.ts";
import EditingBar from "./EditingBar.svelte";
import ElisionsPanel from "./ElisionsPanel.svelte";
import JournalPanel from "./JournalPanel.svelte";
import { journalRows } from "./journal.ts";
import LevelPanel from "./LevelPanel.svelte";
import ManifestTextPanel from "./ManifestTextPanel.svelte";
import MatchstampPanel from "./MatchstampPanel.svelte";
import MetadataPanel from "./MetadataPanel.svelte";
import { ManifestText } from "./manifestText.svelte.ts";
import type { MatchIndexes } from "./matchstamps.ts";
import PropertiesPanel from "./PropertiesPanel.svelte";
import { PropertyDrafts } from "./propertyDrafts.svelte.ts";
import RegionsPanel from "./RegionsPanel.svelte";
import { selectedBlock } from "./selection.ts";
import TimestampPanel from "./TimestampPanel.svelte";
import type { HeldMatch, Picked, ShownMatch, ShownPin, Tab } from "./tabs.ts";
import {
  chosen,
  heldOf,
  initialPick,
  matchPinned,
  nextTab,
  pinned,
  TABS,
  tabLabel,
} from "./tabs.ts";

let {
  live,
  selection,
  placement = null,
  manifest = new ManifestText(),
  drafts = new PropertyDrafts(),
  picked = $bindable(untrack(() => initialPick(live.editing.length, live.openings))),
  pin = $bindable(null),
  timestamp = null,
  match = $bindable(null),
  tables = new MatchClaimTables(null),
  indexesOf = () => null,
  knotsOf,
  onselect = () => {},
  locked = false,
}: {
  /** The open workspace's store, read as Svelte state. */
  live: LiveStore;
  selection: Selection;
  /** The placement a canvas gesture shows before release; the form shows it for its block. */
  placement?: LivePlacement | null;
  /** The Manifest tab's text, kept while another tab is shown. */
  manifest?: ManifestText;
  /** The drafts of the Properties, Regions and Elisions tabs and the Elisions tab's open blocks, kept while another tab is shown. */
  drafts?: PropertyDrafts;
  /** The tab last chosen, and how many editors had been opened then. */
  picked?: Picked;
  /** The pinned timestamp and the tab shown before it; `null` while none is pinned. */
  pin?: ShownPin | null;
  /** The pin of the timestamp shown: `pin`'s own, or its named timestamp's read from the view. */
  timestamp?: Pin | null;
  /** The MatchStamp the Matchstamp tab shows and the tab shown before it; `null` while none is. */
  match?: ShownMatch | null;
  /** The MatchClaim tables of the workspace's blocks; none read without a server. */
  tables?: MatchClaimTables;
  /** The anchor indexes of a block's table (`blockIndexes`); none without tables. */
  indexesOf?: (block: string) => MatchIndexes | null;
  /**
   * The expanded MeasureMap rows of a manifest (the canvas's), with which
   * the Matchstamp tab evaluates its conversion-map rows; without it no
   * measure view gives a value.
   */
  knotsOf?: KnotsOf | undefined;
  /** Select `addresses` on the canvas: a row of the Regions or Elisions tab, a jump's destination. */
  onselect?: ((addresses: readonly Address[]) => void) | undefined;
  /** Whether the canvas is locked: the level tab's arrangement is then disabled, as the canvas's is. */
  locked?: boolean;
} = $props();

const uid = $props.id();

const view = $derived(live.view);
/** The innermost open editor, whose level names the level tab. */
const innermost = $derived(live.editing.at(-1));
const level = $derived(innermost?.kind ?? "arranger");

/** How many editors the store has opened. */
const openings = $derived(live.openings);

/** The tab shown: the one chosen; the drawer chooses the level tab when an editor opened while it was closed. */
const tab: Tab = $derived(picked.tab);

/** Choose a tab; any but Timestamp clears the pin, any but Matchstamp the MatchStamp shown. */
function choose(next: Tab): void {
  ({ picked, pin } = chosen({ picked, pin }, next, openings));
  if (next !== "matchstamp") match = null;
}

/** The MatchStamp shown is now `next`: a potential one named; or none once removed, the tab kept. */
function rematched(next: HeldMatch | null): void {
  if (next === null) match = null;
  else ({ picked, match } = matchPinned({ picked, match }, next));
}

/** The shown timestamp is now `next`: an unnamed one moved, or named. */
function repinned(next: Pin): void {
  ({ picked, pin } = pinned({ picked, pin }, heldOf(live.store.view, next)));
}

/** The tab list and the panels, where a click keeps a pinned timestamp. */
let body: HTMLElement | undefined = $state();

/** Whether `target` lies in the tab list or the shown panel, where a click keeps a pinned timestamp. */
export function holds(target: EventTarget | null): boolean {
  return body !== undefined && target instanceof Node && body.contains(target);
}

/** The tab buttons, to move the focus with the keys: each kept while it is mounted. */
const tabButtons: { [tab in Tab]?: HTMLElement } = {};
const registered =
  (tab: Tab): Attachment<HTMLElement> =>
  (button) => {
    tabButtons[tab] = button;
    return () => delete tabButtons[tab];
  };

/** Move the focus to the button of tab `tab`, the tab shown or about to be. */
export function focusTab(tab: Tab): void {
  tabButtons[tab]?.focus();
}

function onTabKey(event: KeyboardEvent, from: Tab): void {
  const next = nextTab(from, event);
  if (next === undefined) return;
  event.preventDefault();
  choose(next);
  tabButtons[next]?.focus();
}

/** The selection, resolved once for the panels. */
/** The canvas's pane, which every drawing read here is drawn at. */
const pane = paneOf();
const subjects = $derived(resolveSelection(view, selection, innermost ?? null, fontMetrics, pane));
const block = $derived(selectedBlock(view, subjects));

/** Without a block, and without unapplied text, the Manifest tab shows only a hint. */
const hinted = $derived(block === null && !manifest.dirty);
</script>

<!-- Full width above the tabs, while an editor is open. -->
<EditingBar {live} />

<div class="inspector-body" bind:this={body}>
  <div class="tabs" role="tablist" aria-label="Inspector sections">
    {#each TABS as item (item)}
      <button
        type="button"
        role="tab"
        id="{uid}-tab-{item}"
        aria-controls="{uid}-panel-{item}"
        aria-selected={tab === item}
        tabindex={tab === item ? 0 : -1}
        {@attach registered(item)}
        onclick={() => choose(item)}
        onkeydown={(event) => onTabKey(event, item)}>{tabLabel(item, level)}</button
      >
    {/each}
  </div>

  <!-- The panels scroll here, below the tab list. -->
  <div class="panels">
    {#each TABS as item (item)}
      <div
        class="panel"
        role="tabpanel"
        id="{uid}-panel-{item}"
        aria-labelledby="{uid}-tab-{item}"
        hidden={tab !== item}
      >
        {#if tab !== item}
          <!-- A hidden panel renders nothing. -->
        {:else if item === "level"}
          <LevelPanel {live} {manifest} {locked} {selection} {onselect} />
        {:else if item === "journal"}
          <JournalPanel rows={journalRows(live, view)} />
        {:else if item === "timestamp"}
          <TimestampPanel {live} pin={timestamp} onpin={repinned} />
        {:else if item === "matchstamp"}
          <MatchstampPanel
            {live}
            {block}
            {match}
            {tables}
            {indexesOf}
            {knotsOf}
            onmatch={rematched}
          />
        {:else if item === "metadata"}
          <MetadataPanel {view} store={live.store} {subjects} editing={innermost ?? null} />
        {:else if item === "properties"}
          <PropertiesPanel
            {view}
            store={live.store}
            {block}
            {subjects}
            editing={innermost ?? null}
            {placement}
            {drafts}
            {onselect}
          />
        {:else if item === "regions"}
          <RegionsPanel store={live.store} {block} {subjects} {drafts} {onselect} />
        {:else if item === "elisions"}
          <ElisionsPanel
            {view}
            store={live.store}
            {block}
            {subjects}
            editing={innermost ?? null}
            {placement}
            {drafts}
            {onselect}
          />
        {:else if hinted}
          <p class="hint">Select a block to inspect its manifest.</p>
        {:else}
          <ManifestTextPanel {manifest} {block} {subjects} {view} store={live.store} />
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  p {
    margin: 0;
  }

  .hint {
    color: #595959;
  }

  /*
   * Body and shown panel fill the drawer's height, so a panel can keep a
   * line at its bottom; the body never grows past it, so that only the
   * panels scroll and the tab list above them stays.
   */
  .inspector-body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 0.5rem;
    min-height: 0;
    padding: 0 0 0.75rem;
    font-size: 0.85rem;
  }

  /*
   * One tab strip, wrapping: the tabs that do not fit start another row,
   * in reading order, and the strip's one bottom border runs under its last
   * row. The selected tab is marked by its underline wherever its row lies.
   */
  .tabs {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    margin: 0 0.75rem;
    border-bottom: 1px solid #b0b0b0;
  }

  /* The scroll container of the panels, padded inside so that a focus ring is never cut. */
  .panels {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    min-height: 0;
    padding: 0 0.75rem;
    overflow: auto;
  }

  /* Padded as one row of tabs; those that do not fit wrap into the next. */
  .tabs button {
    padding: 0.2rem 0.6rem;
    border: none;
    border-bottom: 2px solid transparent;
    background: none;
    color: #595959;
    font: inherit;
    white-space: nowrap;
    cursor: pointer;
  }

  .tabs button[aria-selected="true"] {
    border-bottom-color: #1a1a1a;
    color: #1a1a1a;
  }

  .tabs button:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: -2px;
  }

  .panel {
    display: flex;
    flex: 1 0 auto;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* `display` above would otherwise show the panel the tabs hide. */
  .panel[hidden] {
    display: none;
  }
</style>
