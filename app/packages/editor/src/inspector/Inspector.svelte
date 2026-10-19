<script lang="ts">
/**
 * The inspector: the editing bar, then a tab list over four panels:
 * Editor (while an editor is open), Properties, Manifest and Journal. Only
 * the shown panel is rendered; what the Properties and Manifest tabs hold
 * between visits (typed text, a chosen format) lives in their state objects,
 * which a host keeping them while the inspector is not shown passes in, with
 * the tab chosen.
 */
import type { LivePlacement, LiveStore } from "@timetoalign/tilie-arranger";
import { resolveSelection } from "@timetoalign/tilie-arranger";
import { fontMetrics } from "@timetoalign/timeskeleton";
import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";
import EditingBar from "./EditingBar.svelte";
import JournalPanel from "./JournalPanel.svelte";
import { journalRows } from "./journal.ts";
import ManifestTextPanel from "./ManifestTextPanel.svelte";
import { ManifestText } from "./manifestText.svelte.ts";
import PropertiesPanel from "./PropertiesPanel.svelte";
import { PropertyDrafts } from "./propertyDrafts.svelte.ts";
import { selectedBlock } from "./selection.ts";
import type { Picked, Tab } from "./tabs.ts";
import { initialPick, nextTab, shownTab, TAB_LABELS, tabsOf } from "./tabs.ts";
import { editorName, kindWord } from "./words.ts";

let {
  live,
  selection,
  placement = null,
  manifest = new ManifestText(),
  drafts = new PropertyDrafts(),
  picked = $bindable(untrack(() => initialPick(live.editing.length, live.openings))),
}: {
  /** The open workspace's store, read as Svelte state. */
  live: LiveStore;
  selection: ReadonlySet<string>;
  /** The placement a canvas gesture shows before release; the form shows it for its block. */
  placement?: LivePlacement | null;
  /** The Manifest tab's text, kept while another tab is shown. */
  manifest?: ManifestText;
  /** The Properties tab's drafts, kept while another tab is shown. */
  drafts?: PropertyDrafts;
  /** The tab last chosen, and how many editors had been opened then. */
  picked?: Picked;
} = $props();

const uid = $props.id();

const view = $derived(live.view);
const editing = $derived(live.editing);
const depth = $derived(editing.length); // changes only when an editor opens or closes
/** The innermost open editor, which the Editor tab names. */
const innermost = $derived(editing.at(-1));

/** How many editors the store has opened. */
const openings = $derived(live.openings);

const tabs = $derived(tabsOf(depth));
const tab: Tab = $derived(shownTab(picked, openings, depth));

function choose(next: Tab): void {
  picked = { tab: next, openings };
}

/** The tab buttons, to move the focus with the keys: each kept while it is mounted. */
const tabButtons: { [tab in Tab]?: HTMLElement } = {};
const registered =
  (tab: Tab): Attachment<HTMLElement> =>
  (button) => {
    tabButtons[tab] = button;
    return () => delete tabButtons[tab];
  };

function onTabKey(event: KeyboardEvent, from: Tab): void {
  const next = nextTab(tabs, from, event);
  if (next === undefined) return;
  event.preventDefault();
  choose(next);
  tabButtons[next]?.focus();
}

/** The selection, resolved once for the panels. */
const subjects = $derived(resolveSelection(view, selection, fontMetrics));
const block = $derived(selectedBlock(view, subjects));

/** Without a block, and without unapplied text, the Properties and Manifest tabs show only a hint. */
const hinted = $derived(block === null && !manifest.dirty);
</script>

<!-- Full width above the tabs, while an editor is open. -->
<EditingBar {live} />

<div class="inspector-body">
  <div class="tabs" role="tablist" aria-label="Inspector sections">
    {#each tabs as item (item)}
      <button
        type="button"
        role="tab"
        id="{uid}-tab-{item}"
        aria-controls="{uid}-panel-{item}"
        aria-selected={tab === item}
        tabindex={tab === item ? 0 : -1}
        {@attach registered(item)}
        onclick={() => choose(item)}
        onkeydown={(event) => onTabKey(event, item)}>{TAB_LABELS[item]}</button
      >
    {/each}
  </div>

  {#each tabs as item (item)}
    <div
      class="panel"
      role="tabpanel"
      id="{uid}-panel-{item}"
      aria-labelledby="{uid}-tab-{item}"
      hidden={tab !== item}
    >
      {#if tab !== item}
        <!-- A hidden panel renders nothing. -->
      {:else if item === "editor"}
        {#if innermost !== undefined}
          <p>{kindWord(innermost.kind)} editor: {editorName(view, innermost.target)}</p>
        {/if}
      {:else if item === "journal"}
        <JournalPanel rows={journalRows(live, view)} />
      {:else if hinted}
        <p class="hint">Select a block to inspect its manifest.</p>
      {:else if item === "manifest"}
        <ManifestTextPanel {manifest} {block} store={live.store} />
      {:else if block !== null}
        <PropertiesPanel
          {view}
          store={live.store}
          {block}
          {subjects}
          level={innermost?.kind ?? "arranger"}
          {placement}
          {drafts}
        />
      {/if}
    </div>
  {/each}
</div>

<style>
  p {
    margin: 0;
  }

  .hint {
    color: #595959;
  }

  .inspector-body {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0 0.75rem 0.75rem;
    font-size: 0.85rem;
  }

  .tabs {
    display: flex;
    border-bottom: 1px solid #b0b0b0;
  }

  .tabs button {
    margin-bottom: -1px;
    padding: 0.2rem 0.75rem;
    border: 1px solid transparent;
    border-radius: 4px 4px 0 0;
    background: none;
    color: #595959;
    font: inherit;
    cursor: pointer;
  }

  .tabs button[aria-selected="true"] {
    border-color: #b0b0b0 #b0b0b0 #fff;
    background: #fff;
    color: #1a1a1a;
  }

  .tabs button:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: -2px;
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* `display` above would otherwise show the panel the tabs hide. */
  .panel[hidden] {
    display: none;
  }
</style>
