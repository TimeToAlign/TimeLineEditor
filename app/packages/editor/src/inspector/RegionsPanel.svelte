<script lang="ts">
/**
 * The Regions tab (`regions.ts`): the regions of the selected timeline,
 * then each descendant's under its name, one row per region with its ID
 * and type, its name, start and end; a press on the row's head selects the
 * region on the canvas, and the selected regions' rows are marked; the
 * list stays on its timeline while the selection names regions it lists
 * (`regionsOf`), so a region is pressed and renamed in place. Name,
 * start and end are edited as the Properties tab edits its fields: typed
 * text is a draft of the inspector's `PropertyDrafts`, Enter or leaving
 * the field commits it as one `set`, Escape drops it, a refusal stands
 * below the field. Remove and Add region each send one command, a refusal
 * shown in the status line below the list. An atomic section's row is
 * read only. With no timeline selected, one line says what to select.
 */
import type { Subject } from "@timetoalign/tilie-arranger";
import type { Address, Block, Command, Manifest, Store } from "@timetoalign/tilie-core";
import type { PropertyDrafts } from "./propertyDrafts.svelte.ts";
import type { Listed, RegionField, RegionRow } from "./regions.ts";
import { regionFieldCommand, regionsOf } from "./regions.ts";

let {
  store,
  block,
  subjects,
  drafts,
  onselect = () => {},
}: {
  store: Store;
  /** The block the whole selection lies in; `null` for no selection or one in several blocks. */
  block: Block | null;
  /** The selection, resolved. */
  subjects: readonly Subject[];
  drafts: PropertyDrafts;
  /** Select `addresses` on the canvas: a row's region. */
  onselect?: (addresses: readonly Address[]) => void;
} = $props();

const uid = $props.id();

/**
 * The timeline the tab listed last, which a selection of its regions
 * keeps; read and written only by `shown`, so it is no state of its own.
 */
let listed: Listed | null = null;

/** What the tab lists; `null` without one selected timeline. */
const shown = $derived.by(() => {
  const next = regionsOf(block, subjects, listed);
  listed = next === null ? null : { block: next.block.id, timeline: next.timeline.id };
  return next;
});

/** What the tab says when no timeline is selected. */
const HINT = "Select a timeline, its card or one of its regions to list its regions.";

/** The words of the three fields. */
const LABELS: { readonly [field in RegionField]: string } = {
  name: "Name",
  start: "Start",
  end: "End",
};

/** The store's refusal of the last Add region or Remove, with the timeline and manifest it was refused in. */
let refusal = $state.raw<{
  readonly timeline: string;
  readonly manifest: Manifest;
  readonly message: string;
} | null>(null);

/** The refusal, while the same timeline is listed from the same manifest. */
const actionProblem = $derived(
  refusal !== null &&
    shown !== null &&
    refusal.timeline === shown.timeline.id &&
    refusal.manifest === shown.block.manifest
    ? refusal.message
    : null,
);

/** Dispatch Add region or Remove, keeping the store's refusal for the status line. */
function send(command: Command | null): void {
  if (command === null || shown === null) return;
  const message = store.dispatch(command)?.message;
  refusal =
    message === undefined
      ? null
      : { timeline: shown.timeline.id, manifest: shown.block.manifest, message };
}

/** The edit of `field` of `row` from typed text. */
const editOf = (row: RegionRow, field: RegionField) => (text: string) =>
  regionFieldCommand(row, field, text);

function onFieldKey(event: KeyboardEvent, row: RegionRow, field: RegionField): void {
  if (event.key === "Enter") {
    event.preventDefault();
    drafts.commitField(row, field, store, editOf(row, field));
  } else if (event.key === "Escape") {
    drafts.discardField(row, field);
  }
}
</script>

{#snippet field(row: RegionRow, name: RegionField)}
  {@const problem = drafts.fieldProblem(row, name)}
  {@const problemId = `${uid}-${row.id}-${name}-problem`}
  <label class="field">
    <span>{LABELS[name]}</span>
    <span class="value">
      <input
        type="text"
        inputmode={name === "name" ? undefined : "decimal"}
        {name}
        value={drafts.fieldValue(row, name, row[name])}
        aria-invalid={problem !== undefined}
        aria-describedby={problem !== undefined ? problemId : undefined}
        oninput={(event) => drafts.typeField(row, name, event.currentTarget.value)}
        onkeydown={(event) => onFieldKey(event, row, name)}
        onblur={() => drafts.commitField(row, name, store, editOf(row, name))}
      />
      {#if name !== "name" && row.unit !== ""}<span class="unit">{row.unit}</span>{/if}
    </span>
  </label>
  {#if problem !== undefined}
    <p class="problem" id={problemId}>{problem}</p>
  {/if}
{/snippet}

{#snippet stated(row: RegionRow, name: RegionField)}
  <div class="field">
    <dt>{LABELS[name]}</dt>
    <dd>{name === "name" || row.unit === "" ? row[name] : `${row[name]} ${row.unit}`}</dd>
  </div>
{/snippet}

{#if shown === null}
  <p class="hint">{HINT}</p>
{:else}
  {@const list = shown}
  {#each list.sections as section (section.timeline)}
    <section class="section" aria-labelledby={section.heading === null ? undefined : `${uid}-${section.timeline}`}>
      {#if section.heading !== null}
        <h3 id="{uid}-{section.timeline}">{section.heading}</h3>
      {/if}
      {#if section.rows.length === 0}
        <p class="hint">No regions.</p>
      {:else}
        <ul class="regions">
          {#each section.rows as row (row.id)}
            {@const selected = list.selected.has(row.id)}
            <li class={{ region: true, selected }} data-testid="region-row">
              <div class="head">
                <button
                  type="button"
                  class="select"
                  aria-pressed={selected}
                  onclick={() => onselect([row.address])}
                >
                  <span class="id">{row.id}</span>
                  {#if row.type !== ""}<span class="type">{row.type}</span>{/if}
                </button>
                {#if row.remove !== null}
                  {@const remove = row.remove}
                  <button
                    type="button"
                    class="remove"
                    aria-label="Remove region {row.name === '' ? row.id : row.name}"
                    onclick={() => send(remove)}>×</button
                  >
                {/if}
              </div>
              {#if row.readOnly}
                <dl class="fields">
                  {@render stated(row, "name")}
                  {@render stated(row, "start")}
                  {@render stated(row, "end")}
                </dl>
              {:else}
                <div class="fields">
                  {@render field(row, "name")}
                  {@render field(row, "start")}
                  {@render field(row, "end")}
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/each}
  <button type="button" class="add" disabled={list.add === null} onclick={() => send(list.add)}
    >Add region</button
  >
  <p class="problem" role="status">{actionProblem ?? ""}</p>
{/if}

<style>
  .hint {
    margin: 0;
    color: #595959;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  h3 {
    margin: 0.5rem 0 0;
    font: inherit;
    font-weight: 600;
  }

  .regions {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* One region: its head above its three fields, barred at its left while selected. */
  .region {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.25rem 0.4rem;
    border: 1px solid #d0d0d0;
    border-left: 3px solid transparent;
    border-radius: 4px;
  }

  .region.selected {
    border-left-color: #1a1a1a;
  }

  .head {
    display: flex;
    gap: 0.25rem;
  }

  .select {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    gap: 0.5rem;
    min-width: 0;
    text-align: start;
  }

  .select[aria-pressed="true"] {
    font-weight: 600;
  }

  .id {
    overflow-wrap: anywhere;
  }

  .type {
    color: #595959;
  }

  /*
   * Three columns sharing the row's width whatever the fields' own width
   * (`minmax(0, 1fr)`), so the panel never scrolls sideways.
   */
  .fields {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.25rem 0.5rem;
    margin: 0;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }

  .field > span:first-child,
  dt {
    color: #595959;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .value {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .value input {
    flex: 1;
    min-width: 0;
    font: inherit;
  }

  .problem {
    grid-column: 1 / -1;
    margin: 0;
    color: #b00020;
  }

  button {
    font: inherit;
  }

  .add {
    align-self: flex-start;
    margin-top: 0.5rem;
  }
</style>
