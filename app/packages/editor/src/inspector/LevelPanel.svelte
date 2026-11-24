<script lang="ts">
/**
 * The level tab's panel: the title line (the level's word and the name of
 * what it shows), then the settings of the level. The Arranger tab holds
 * the arrangement of the canvas's blocks, the Bundle tab the arrangement
 * of the edited block's items and how its manifest is written to a file;
 * the Group and Timeline tabs hold the title line alone. The arrangement
 * is the canvas's Arrange menu itself (`ArrangeMenu` over `arrangeMenuOf`),
 * so both controls show one stored state and send one command; the file's
 * switches are the Manifest tab's (`ManifestFileSwitches`), disabled, as
 * there, while that tab's text holds an unapplied edit. A choice the store
 * refuses is posted as information, as the canvas's Arrange menu posts its
 * refusals.
 */
import type { LiveStore } from "@timetoalign/tilie-arranger";
import { ArrangeMenu, arrangeMenuOf } from "@timetoalign/tilie-arranger";
import type { Command } from "@timetoalign/tilie-core";
import { postOf } from "../messages.svelte.ts";
import ManifestFileSwitches from "./ManifestFileSwitches.svelte";
import type { ManifestText } from "./manifestText.svelte.ts";
import { levelTitle } from "./words.ts";

let {
  live,
  manifest,
}: {
  /** The open workspace's store, read as Svelte state. */
  live: LiveStore;
  /** The Manifest tab's text, whose unapplied edit holds the file's switches. */
  manifest: ManifestText;
} = $props();

const uid = $props.id();

const view = $derived(live.view);
/** The innermost open editor, whose level the tab shows. */
const innermost = $derived(live.editing.at(-1));
const title = $derived(levelTitle(view, innermost));

const post = postOf();

/** Store `command`; a refusal goes to the message bar as information. */
function send(command: Command): void {
  const refusal = live.store.dispatch(command);
  if (refusal !== null) post("info", refusal.message);
}

/** The Arrange menu of the level: the canvas's blocks, a bundle editor's items, or none. */
const arrange = $derived(arrangeMenuOf(view, innermost ?? null, false, send));

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

  .hint {
    color: #595959;
  }
</style>
