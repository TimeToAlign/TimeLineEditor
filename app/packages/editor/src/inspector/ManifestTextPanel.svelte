<script lang="ts">
/**
 * The Manifest tab: the format and options, the text, Apply and Revert,
 * the problems and the warnings. Its state is the inspector's
 * `ManifestText`, which it follows while it is shown.
 */
import type { Block, Store } from "@timetoalign/tilie-core";
import { unknownKeys } from "@timetoalign/tilie-core";
import { FORMAT_LABELS, FORMATS } from "./formats.svelte.ts";
import type { ManifestText } from "./manifestText.svelte.ts";
import { manifestOf } from "./manifestText.ts";
import ProblemList from "./ProblemList.svelte";
import { problemPlace, problemPointer } from "./problems.ts";

let {
  manifest,
  block,
  store,
}: {
  /** The tab's state, kept while another tab is shown. */
  manifest: ManifestText;
  /** The block the whole selection lies in; `null` for none. */
  block: Block | null;
  store: Store;
} = $props();

const uid = $props.id();

// Follow the selection, the manifest and the choice while the text holds no unapplied edit.
$effect.pre(() => manifest.follow(block));

/** The keys of the block's manifest no definition declares: warnings, which never stop editing. */
const warnings = $derived(block === null ? [] : unknownKeys(manifestOf(block)));

function onTextKey(event: KeyboardEvent): void {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    if (manifest.dirty) manifest.apply(store);
  }
}
</script>

<div class="options">
  <div
    class="formats"
    role="radiogroup"
    aria-label="Manifest format"
    aria-describedby={manifest.dirty ? `${uid}-switch-hint` : undefined}
  >
    {#each FORMATS as item (item)}
      <label class={["segment", { checked: manifest.format === item }]}>
        <input
          type="radio"
          name="{uid}-format"
          value={item}
          bind:group={manifest.format}
          disabled={manifest.dirty}
        />
        {FORMAT_LABELS[item]}
      </label>
    {/each}
  </div>
  <div class="toggles">
    <label>
      <input
        type="checkbox"
        bind:checked={manifest.includeStyling}
        disabled={manifest.dirty}
        aria-describedby={manifest.dirty ? `${uid}-switch-hint` : undefined}
      />
      Include styling
    </label>
    <label>
      <input
        type="checkbox"
        bind:checked={manifest.minimal}
        disabled={manifest.dirty}
        aria-describedby={manifest.dirty ? `${uid}-switch-hint` : undefined}
      />
      Minimal
    </label>
  </div>
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
  <textarea
    id="{uid}-text"
    spellcheck="false"
    autocomplete="off"
    rows="20"
    bind:value={manifest.text}
    onkeydown={onTextKey}
    aria-invalid={manifest.problems.length > 0}
    aria-describedby={manifest.problems.length > 0 ? `${uid}-problems` : undefined}
  ></textarea>

  <div class="actions">
    <button type="button" onclick={() => manifest.apply(store)} disabled={!manifest.dirty}>Apply</button>
    <button type="button" onclick={() => manifest.revert(block)} disabled={!manifest.dirty}
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

{#if warnings.length > 0}
  <ul class="warnings" aria-label="Warnings">
    {#each warnings as warning (`${problemPointer(warning)}\u0000${warning.key}`)}
      {@const place = problemPlace(warning)}
      <li>
        Unknown key <code>{warning.key}</code>
        <span class="where"
          >at {#if "pointer" in place && place.pointer !== null}<code>{place.pointer}</code
            >{:else}the top level{/if}</span
        >
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

  .formats {
    display: inline-flex;
    border: 1px solid #b0b0b0;
    border-radius: 4px;
    overflow: hidden;
  }

  .segment {
    position: relative;
    padding: 0.15rem 0.5rem;
    cursor: pointer;
  }

  .segment + .segment {
    border-left: 1px solid #b0b0b0;
  }

  .segment.checked {
    background: #1a1a1a;
    color: #fff;
  }

  /* The radio itself is invisible but stays focusable; the segment shows its state. */
  .segment input {
    position: absolute;
    opacity: 0;
    inset: 0;
    margin: 0;
    cursor: inherit;
  }

  .segment:has(input:focus-visible) {
    outline: 2px solid #0a84ff;
    outline-offset: -2px;
  }

  /* Disabled while the text holds an edit: greyed like the checkboxes beside
     it, the checked format still filled. */
  .formats:has(input:disabled),
  .formats:has(input:disabled) .segment + .segment {
    border-color: #d0d0d0;
  }

  .segment:has(input:disabled) {
    color: #595959;
    cursor: not-allowed;
  }

  .segment.checked:has(input:disabled) {
    background: #595959;
    color: #fff;
  }

  .toggles {
    display: flex;
    gap: 0.75rem;
  }

  /* Disabled while the text holds an edit: the label greys with its box. */
  .toggles label:has(input:disabled),
  .toggles input:disabled {
    color: #595959;
    cursor: not-allowed;
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

  textarea {
    box-sizing: border-box;
    width: 100%;
    resize: vertical;
    font-family: ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace;
    font-size: 0.8rem;
    line-height: 1.35;
    tab-size: 2;
    white-space: pre;
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
