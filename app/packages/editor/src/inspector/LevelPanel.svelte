<script lang="ts">
/**
 * The level tab's panel: the title line (the level's word and the name of
 * what it shows), then the settings of the level. The Arranger tab holds
 * the arrangement of the canvas's blocks, the Bundle tab the arrangement
 * of the edited block's items and how its manifest is written to a file;
 * the Group and Timeline tabs hold the title line alone. The Children tab
 * of a children editor lists the timeline's children (`children.ts`), each
 * row selecting its child on the canvas; the Flow control tab of a
 * flow-control editor adds flow-control elements and lists those of the
 * root's tree (`FlowControlPanel`). The arrangement
 * is the canvas's Arrange menu itself (`ArrangeMenu` over `arrangeMenuOf`),
 * so both controls show one stored state and send one command; the file's
 * switches are the Manifest tab's (`ManifestFileSwitches`), disabled, as
 * there, while that tab's text holds an unapplied edit. The arrangement
 * follows the canvas's lock as the canvas's menu does: disabled while the
 * canvas is locked. A choice the store
 * refuses is posted as information, as the canvas's Arrange menu posts its
 * refusals.
 */
import type { LiveStore, Selection } from "@timetoalign/tilie-arranger";
import { ArrangeMenu, arrangeMenuOf } from "@timetoalign/tilie-arranger";
import type { Address, Command } from "@timetoalign/tilie-core";
import { addressKey } from "@timetoalign/tilie-core";
import { postOf } from "../messages.svelte.ts";
import { childrenOf } from "./children.ts";
import FlowControlPanel from "./FlowControlPanel.svelte";
import { flowControlOf } from "./flowControl.ts";
import ManifestFileSwitches from "./ManifestFileSwitches.svelte";
import type { ManifestText } from "./manifestText.svelte.ts";
import { levelTitle } from "./words.ts";

let {
  live,
  manifest,
  locked,
  selection,
  onselect = () => {},
}: {
  /** The open workspace's store, read as Svelte state. */
  live: LiveStore;
  /** The canvas's selection, whose rows are marked. */
  selection: Selection;
  /** Select `addresses` on the canvas: a listed child or flow-control element. */
  onselect?: (addresses: readonly Address[]) => void;
  /** The Manifest tab's text, whose unapplied edit holds the file's switches. */
  manifest: ManifestText;
  /** Whether the canvas is locked, which disables the arrangement here as on the canvas. */
  locked: boolean;
} = $props();

const uid = $props.id();

const view = $derived(live.view);
/** The innermost open editor, whose level the tab shows. */
const innermost = $derived(live.editing.at(-1));
const title = $derived(levelTitle(view, innermost));

const post = postOf();

/** The selected addresses, in order. */
const selected = $derived([...selection.values()]);

/** A children editor's children; `null` at other levels. */
const children = $derived(childrenOf(view, innermost));

/** A flow-control editor's tree and its flow control; `null` at other levels. */
const flow = $derived(flowControlOf(view, innermost));

/** Store `command`; a refusal goes to the message bar as information. */
function send(command: Command): void {
  const refusal = live.store.dispatch(command);
  if (refusal !== null) post("info", refusal.message);
}

/** The Arrange menu of the level: the canvas's blocks, a bundle editor's items, or none. */
const arrange = $derived(arrangeMenuOf(view, innermost ?? null, locked, send));

/** The block a bundle editor edits, whose manifest file the Bundle tab states; `null` at other levels. */
const bundle = $derived(
  innermost?.kind === "bundle" && innermost.target.block !== undefined
    ? (view.blocks[innermost.target.block] ?? null)
    : null,
);
</script>

<!-- A console field: the level's word, then the name of what it shows. -->
<p class="title-line" data-testid="level-title">
  <span class="word">{title.word}</span>
  <span class="name">{title.name}</span>
</p>

{#if arrange !== null}
  <section class="area" aria-labelledby="{uid}-arrangement" data-testid="level-arrangement">
    <h3 id="{uid}-arrangement">Arrangement</h3>
    <ArrangeMenu {...arrange} />
  </section>
{/if}

{#if children !== null}
  <section class="area" aria-labelledby="{uid}-children" data-testid="level-children">
    <h3 id="{uid}-children">Children</h3>
    {#if children.rows.length === 0}
      <p class="hint">No children.</p>
    {:else}
      <ul class="rows">
        {#each children.rows as row (row.id)}
          {@const pressed = selection.has(addressKey(row.address))}
          <li class={{ row: true, selected: pressed }} data-testid="child-row">
            <button
              type="button"
              class="select"
              aria-pressed={pressed}
              onclick={() => onselect([row.address])}
            >
              <span class="name">{row.name}</span>
              <span class="at">
                at {row.offset}{row.offsetUnit === "" ? "" : ` ${row.offsetUnit}`}{row.length === ""
                  ? ""
                  : `, ${row.length}${row.unit === "" ? "" : ` ${row.unit}`} long`}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

{#if flow !== null}
  <FlowControlPanel store={live.store} shown={flow} {selected} {onselect} />
{/if}

{#if bundle !== null}
  <section class="area" aria-labelledby="{uid}-file" data-testid="level-manifest-file">
    <h3 id="{uid}-file">Manifest file</h3>
    <ManifestFileSwitches
      block={bundle}
      {view}
      store={live.store}
      disabled={manifest.dirty}
      describedby={manifest.dirty ? `${uid}-file-hint` : undefined}
    />
    {#if manifest.dirty}
      <p class="hint" id="{uid}-file-hint">Apply or Revert the Manifest tab's text to switch</p>
    {/if}
  </section>
{/if}

<style>
  /* The title line's typewriter face, bundled so that it looks the same everywhere. */
  @font-face {
    font-family: "TiLiE Plex Mono";
    font-style: normal;
    font-weight: 400;
    font-display: swap;
    src: url("../../fonts/IBMPlexMono-Regular.woff2") format("woff2");
  }

  p {
    margin: 0;
  }

  /* A console field: an inset, recessed line set in the typewriter face. */
  .title-line {
    display: flex;
    align-items: baseline;
    gap: 1ch;
    min-width: 0;
    padding: 0.5rem 0.75rem 0.45rem;
    border: 1px solid #c8c2b4;
    border-radius: 4px;
    background: #f5f3ee;
    box-shadow:
      inset 0 1px 3px rgba(40, 32, 16, 0.14),
      inset 0 0 0 1px rgba(255, 255, 255, 0.6);
    color: #23201b;
    font-family: "TiLiE Plex Mono", ui-monospace, monospace;
    line-height: 1.3;
  }

  /* The level's word: capitals, spaced out, quieter than the name. */
  .title-line .word {
    flex: none;
    color: #665d4e;
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .title-line .name {
    overflow: hidden;
    font-size: 0.95rem;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .area {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  h3 {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .hint,
  .at {
    color: #595959;
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* One child, barred at its left while selected. */
  .row {
    border: 1px solid #d0d0d0;
    border-left: 3px solid transparent;
    border-radius: 4px;
  }

  .row.selected {
    border-left-color: #1a1a1a;
  }

  .select {
    display: flex;
    flex-wrap: wrap;
    gap: 0 0.5rem;
    width: 100%;
    padding: 0.2rem 0.4rem;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .select[aria-pressed="true"] .name {
    font-weight: 600;
  }

  .name {
    overflow-wrap: anywhere;
  }
</style>
