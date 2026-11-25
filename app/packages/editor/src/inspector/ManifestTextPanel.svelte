<script lang="ts">
/**
 * The Manifest tab: the format and options, the text, Apply and Revert,
 * the problems and the warnings (unknown keys, then the manifest's own
 * warnings, such as statements without a subject ID). Its state is the
 * inspector's `ManifestText`, which it follows while it is shown. The options, Include
 * styling and Minimal, are how the block's manifest is written to a file
 * (`ManifestFileSwitches`, which the Bundle tab shows too); the format is
 * this tab's own choice, kept in its `ManifestText` and stored nowhere.
 * While the text shows the manifest as written (no unapplied edit), the
 * lines holding the selected elements are marked (`selectionPaths`,
 * `locateText`), and selecting scrolls the text to the first of them, one
 * line above it left in view (`scrollTopFor`).
 */
import type { Subject } from "@timetoalign/tilie-arranger";
import type { Block, Store, View } from "@timetoalign/tilie-core";
import {
  manifestFileOf,
  manifestWarnings,
  NEW_MANIFEST_FILE,
  unknownKeys,
} from "@timetoalign/tilie-core";
import type { FileForm } from "@timetoalign/timetoshare";
import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";
import FormatSwitch from "./FormatSwitch.svelte";
import { FORMAT_LABELS, FORMATS, locateText } from "./formats.svelte.ts";
import ManifestFileSwitches from "./ManifestFileSwitches.svelte";
import type { ManifestText } from "./manifestText.svelte.ts";
import ProblemList from "./ProblemList.svelte";
import type { InspectorProblem } from "./problems.ts";
import { problemPlace, problemPointer } from "./problems.ts";
import type { Lines } from "./textPlace.ts";
import { scrollTopFor, selectionPaths } from "./textPlace.ts";

let {
  manifest,
  block,
  subjects,
  view,
  store,
}: {
  /** The tab's state, kept while another tab is shown. */
  manifest: ManifestText;
  /** The block the whole selection lies in; `null` for none. */
  block: Block | null;
  /** The selection, resolved, whose lines the text marks. */
  subjects: readonly Subject[];
  /** The workspace as shown, whose settings hold the block's manifest file. */
  view: View;
  store: Store;
} = $props();

const uid = $props.id();

/** How the block's manifest is written to a file: the options the text shows. */
const file: FileForm = $derived(
  block === null ? NEW_MANIFEST_FILE : manifestFileOf(view.settings, block.id),
);
const options = $derived({ includeStyling: file.styling, minimal: file.minimal });

// Follow the selection, the manifest and the choice while the text holds no unapplied edit.
$effect.pre(() => manifest.follow(block, options));

/**
 * The keys of the block's manifest no definition declares (core's
 * `unknownKeys`), then the manifest's own warnings (core's
 * `manifestWarnings`), both read as a file writes the manifest, with the
 * format's context, which core does not hold. Warnings never stop editing.
 */
const warnings = $derived(block === null ? [] : unknownKeys(block.manifest));
const notes = $derived(block === null ? [] : manifestWarnings(block.manifest));

/** The places of the selection in the manifest file, in selection order. */
const paths = $derived(selectionPaths(subjects));

/** The lines of the selection in the text, while it shows the manifest as written. */
const marks: readonly Lines[] = $derived(
  !manifest.ready || manifest.dirty || block === null
    ? []
    : paths.flatMap((path) => locateText(manifest.format, manifest.text, path) ?? []),
);

/** The first line marked, which the text scrolls to; `null` without a mark. */
const firstMarked = $derived(marks[0]?.first ?? null);

/** How far the text is scrolled, which the marks follow: its scroll events tell. */
let scrolled = $state(0);

/**
 * Scroll the text to the first line marked whenever that line changes (a
 * new selection, another format): one line above it left in view, the
 * text's rows equally tall.
 */
const scrolledToSelection: Attachment<HTMLTextAreaElement> = (area) => {
  if (firstMarked === null) return;
  const rows = untrack(() => manifest.text).split("\n").length;
  area.scrollTop = scrollTopFor(firstMarked, area.scrollHeight / rows);
};

function onTextKey(event: KeyboardEvent): void {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    if (manifest.dirty) manifest.apply(store);
  }
}
</script>

<div class="options">
  <FormatSwitch
    options={FORMATS.map((value) => ({ value, label: FORMAT_LABELS[value] }))}
    bind:value={manifest.format}
    label="Manifest format"
    disabled={manifest.dirty}
    describedby={manifest.dirty ? `${uid}-switch-hint` : undefined}
  />
  <ManifestFileSwitches
    {block}
    {view}
    {store}
    disabled={manifest.dirty}
    describedby={manifest.dirty ? `${uid}-switch-hint` : undefined}
  />
  {#if manifest.dirty}
    <p class="switch-hint" id="{uid}-switch-hint">Apply or Revert to switch</p>
  {/if}
</div>

{#if manifest.stale}
  <p class="notice" role="status">The manifest changed; Revert to see it</p>
{/if}

{#if !manifest.ready}
  {#if manifest.loadFailure}
    <p class="load-failure" role="alert">{manifest.loadFailure}</p>
  {:else}
    <p class="loading" role="status">Loading {FORMAT_LABELS[manifest.format]}…</p>
  {/if}
{:else}
  <label class="manifest-label" for="{uid}-text">Manifest ({FORMAT_LABELS[manifest.format]})</label>
  <div class="text">
    <textarea
      id="{uid}-text"
      spellcheck="false"
      autocomplete="off"
      rows="20"
      bind:value={manifest.text}
      {@attach scrolledToSelection}
      onkeydown={onTextKey}
      onscroll={(event) => (scrolled = event.currentTarget.scrollTop)}
      aria-invalid={manifest.problems.length > 0}
      aria-describedby={manifest.problems.length > 0 ? `${uid}-problems` : undefined}
    ></textarea>
    {#each marks as mark (`${mark.first}-${mark.last}`)}
      <div
        class="mark"
        aria-hidden="true"
        data-testid="text-mark"
        data-first={mark.first}
        data-last={mark.last}
        style:--first={mark.first - 1}
        style:--count={mark.last - mark.first + 1}
        style:--scrolled="{scrolled}px"
      ></div>
    {/each}
  </div>

  <div class="actions">
    <button type="button" onclick={() => manifest.apply(store)} disabled={!manifest.dirty}>Apply</button>
    <button type="button" onclick={() => manifest.revert(block, options)} disabled={!manifest.dirty}
      >Revert</button
    >
  </div>

  <ProblemList
    problems={manifest.problems}
    id="{uid}-problems"
    label="Problems"
    live
    --problem-color="#b00020"
  />
{/if}

{#snippet where(warning: Pick<InspectorProblem, "path">)}
  {@const place = problemPlace(warning)}
  <span class="where"
    >at {#if "pointer" in place && place.pointer !== null}<code>{place.pointer}</code
      >{:else}the top level{/if}</span
  >
{/snippet}

{#if warnings.length + notes.length > 0}
  <ul class="warnings" aria-label="Warnings">
    {#each warnings as warning (`${problemPointer(warning)}\u0000${warning.key}`)}
      <li>
        Unknown key <code>{warning.key}</code>
        {@render where(warning)}
      </li>
    {/each}
    {#each notes as note (`${problemPointer(note)}\u0000${note.code}`)}
      <li>
        <span class="note">{note.message.charAt(0).toUpperCase()}{note.message.slice(1)}</span>
        {@render where(note)}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .options {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .switch-hint {
    flex-basis: 100%;
    margin: 0;
    color: #595959;
  }

  .notice {
    margin: 0;
    padding: 0.25rem 0.5rem;
    border-left: 3px solid #8a6d00;
    background: #fff8e1;
  }

  .loading,
  .load-failure {
    margin: 0;
    color: #595959;
  }

  .load-failure {
    color: #b00020;
  }

  .manifest-label {
    color: #595959;
  }

  /* The text and its marks share one font size, so a row is 1.35em in both. */
  .text {
    position: relative;
    overflow: hidden;
    font-size: 0.8rem;
  }

  textarea {
    display: block;
    box-sizing: border-box;
    width: 100%;
    margin: 0;
    padding: 2px;
    border: 1px solid #767676;
    resize: vertical;
    font-family: ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace;
    font-size: 1em;
    line-height: 1.35em;
    tab-size: 2;
    white-space: pre;
  }

  /* A band over the marked lines, below the border and padding (3px), moved as the text scrolls. */
  .mark {
    position: absolute;
    left: 1px;
    right: 1px;
    top: calc(3px + var(--first) * 1.35em - var(--scrolled));
    height: calc(var(--count) * 1.35em);
    background: rgb(255 193 7 / 0.25);
    border-left: 3px solid #8a6d00;
    pointer-events: none;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  .actions button {
    font: inherit;
    padding: 0.15rem 0.75rem;
  }

  .warnings {
    margin: 0;
    padding: 0.25rem 0.5rem;
    list-style: none;
    border-left: 3px solid #8a6d00;
    background: #fff8e1;
  }

  .warnings li + li {
    margin-top: 0.25rem;
  }

  .warnings code {
    font-family: ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace;
  }
</style>
