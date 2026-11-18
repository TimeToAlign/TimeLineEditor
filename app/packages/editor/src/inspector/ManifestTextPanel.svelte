<script lang="ts">
/**
 * The Manifest tab: the format and options, the text, Apply and Revert,
 * the problems and the warnings (unknown keys, unregistered terms). Its state is the inspector's
 * `ManifestText`, which it follows while it is shown. The options, Include
 * styling and Minimal, are how the block's manifest is written to a file,
 * kept in the workspace's settings and changed there (`configure`).
 */
import type { Block, ManifestFile, Store, View } from "@timetoalign/tilie-core";
import {
  manifestFileOf,
  NEW_MANIFEST_FILE,
  unknownKeys,
  unregisteredTerms,
} from "@timetoalign/tilie-core";
import FormatSwitch from "./FormatSwitch.svelte";
import { FORMAT_LABELS, FORMATS } from "./formats.svelte.ts";
import type { ManifestText } from "./manifestText.svelte.ts";
import { manifestOf } from "./manifestText.ts";
import ProblemList from "./ProblemList.svelte";
import type { InspectorProblem } from "./problems.ts";
import { problemPlace, problemPointer } from "./problems.ts";

let {
  manifest,
  block,
  view,
  store,
}: {
  /** The tab's state, kept while another tab is shown. */
  manifest: ManifestText;
  /** The block the whole selection lies in; `null` for none. */
  block: Block | null;
  /** The workspace as shown, whose settings hold the block's manifest file. */
  view: View;
  store: Store;
} = $props();

const uid = $props.id();

/** How the block's manifest is written to a file: the options the text shows. */
const file: ManifestFile = $derived(
  block === null ? NEW_MANIFEST_FILE : manifestFileOf(view.settings, block.id),
);
const options = $derived({ includeStyling: file.styling, minimal: file.minimal });

// Follow the selection, the manifest and the choice while the text holds no unapplied edit.
$effect.pre(() => manifest.follow(block, options));

/** Write one member of the block's manifest file to the settings. */
function configure(change: Partial<ManifestFile>): void {
  if (block === null) return;
  const refused = store.configure({ manifests: { [block.id]: { ...file, ...change } } });
  if (refused !== null) throw new Error(`a manifest file is refused: ${refused.message}`);
}

/**
 * The keys of the block's manifest no definition declares, then the terms of
 * its links outside their registered words: warnings, which never stop editing.
 */
const warnings = $derived(block === null ? [] : unknownKeys(manifestOf(block)));
const terms = $derived(block === null ? [] : unregisteredTerms(manifestOf(block)));

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
  <div class="toggles">
    <label>
      <input
        type="checkbox"
        bind:checked={() => file.styling, (styling) => configure({ styling })}
        disabled={manifest.dirty || block === null}
        aria-describedby={manifest.dirty ? `${uid}-switch-hint` : undefined}
      />
      Include styling
    </label>
    <label>
      <input
        type="checkbox"
        bind:checked={() => file.minimal, (minimal) => configure({ minimal })}
        disabled={manifest.dirty || block === null}
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

{#if warnings.length + terms.length > 0}
  <ul class="warnings" aria-label="Warnings">
    {#each warnings as warning (`${problemPointer(warning)}\u0000${warning.key}`)}
      <li>
        Unknown key <code>{warning.key}</code>
        {@render where(warning)}
      </li>
    {/each}
    {#each terms as term (problemPointer(term))}
      <li>
        Unregistered term <code>{term.term}</code>
        {@render where(term)}
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
