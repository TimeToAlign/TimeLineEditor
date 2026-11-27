<script lang="ts">
/**
 * The Flow control tab's own part (`flowControl.ts`): "Add flow control",
 * the kind of element, the timeline of the root's tree and the position on
 * its axis (proposed from the selection, `proposedPosition`, typed text
 * kept until the selection proposes another), and Add, which sends one
 * `add` and selects the element it gave on the canvas; then the tree's
 * flow-control elements, each row selecting its element, the selected ones
 * marked. A refusal, before dispatch or by the store, stands in the status
 * line below Add.
 */
import type { Address, Store } from "@timetoalign/tilie-core";
import { addressKey } from "@timetoalign/tilie-core";
import type { FlowControlShown } from "./flowControl.ts";
import { addedFlowElement, addFlowCommand, FLOW_KINDS, proposedPosition } from "./flowControl.ts";

let {
  store,
  shown,
  selected,
  onselect = () => {},
}: {
  store: Store;
  /** The edited root's tree and its flow-control elements. */
  shown: FlowControlShown;
  /** The selected addresses, in order. */
  selected: readonly Address[];
  /** Select `addresses` on the canvas: a row's element, an added element. */
  onselect?: (addresses: readonly Address[]) => void;
} = $props();

const uid = $props.id();

/** The keys of the selected addresses, which mark their rows. */
const marked = $derived(new Set(selected.map(addressKey)));

/** Where the selection proposes the new element. */
const proposed = $derived(proposedPosition(shown, selected));
const proposedTimeline = $derived(proposed.timeline);
const proposedText = $derived(proposed.text);

/** The kind, timeline and position chosen; the latter two follow the selection until typed over. */
let kind = $state(FLOW_KINDS[0]?.key ?? "");
let timeline = $derived(proposedTimeline);
let text = $derived(proposedText);

/** The unit of the chosen timeline's axis. */
const unit = $derived(shown.timelines.find((item) => item.id === timeline)?.unit ?? "");

/** The refusal of the last Add; `null` after one that was stored. */
let problem: string | null = $state(null);

/** Add the chosen element, then select it. */
function add(): void {
  const command = addFlowCommand(shown, kind, { timeline, text });
  if (!command.ok) {
    problem = command.problems[0]?.message ?? "the element cannot be added";
    return;
  }
  const before = store.view.blocks[shown.block.id]?.manifest;
  const refusal = store.dispatch(command.value);
  problem = refusal?.message ?? null;
  const after = store.view.blocks[shown.block.id]?.manifest;
  if (refusal !== null || before === undefined || after === undefined) return;
  const added = addedFlowElement(shown.block.id, before, after, timeline);
  if (added !== null) onselect([added]);
}
</script>

<section class="area" aria-labelledby="{uid}-add" data-testid="flow-control-add">
  <h3 id="{uid}-add">Add flow control</h3>
  <form
    class="add"
    onsubmit={(event) => {
      event.preventDefault();
      add();
    }}
  >
    <label class="field">
      <span>Element</span>
      <select bind:value={kind}>
        {#each FLOW_KINDS as item (item.key)}
          <option value={item.key}>{item.label}</option>
        {/each}
      </select>
    </label>
    {#if shown.timelines.length > 1}
      <label class="field">
        <span>Timeline</span>
        <select bind:value={timeline}>
          {#each shown.timelines as item (item.id)}
            <option value={item.id}>{item.label}</option>
          {/each}
        </select>
      </label>
    {/if}
    <label class="field">
      <span>Position</span>
      <span class="value">
        <input
          type="text"
          inputmode="decimal"
          bind:value={text}
          aria-invalid={problem !== null}
          aria-describedby="{uid}-problem"
        />
        {#if unit !== ""}<span class="unit">{unit}</span>{/if}
      </span>
    </label>
    <button type="submit">Add</button>
  </form>
  <p class="problem" id="{uid}-problem" role="status">{problem ?? ""}</p>
</section>

<section class="area" aria-labelledby="{uid}-elements" data-testid="flow-control-elements">
  <h3 id="{uid}-elements">Flow-control elements</h3>
  {#if shown.rows.length === 0}
    <p class="hint">No flow control.</p>
  {:else}
    <ul class="rows">
      {#each shown.rows as row (row.id)}
        {@const pressed = marked.has(addressKey(row.address))}
        <li class={{ row: true, selected: pressed }} data-testid="flow-control-row">
          <button
            type="button"
            class="select"
            aria-pressed={pressed}
            onclick={() => onselect([row.address])}
          >
            <span class="words">{row.words}</span>
            <span class="name">{row.name}</span>
            <span class="at">
              {row.position}{row.unit === "" ? "" : ` ${row.unit}`}{shown.timelines.length > 1
                ? `, ${row.timeline}`
                : ""}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
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

  p {
    margin: 0;
  }

  .hint,
  .field > span:first-child,
  .at {
    color: #595959;
  }

  /* Element, timeline and position side by side while they fit, Add after them. */
  .add {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.25rem 0.5rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }

  .value {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .value input {
    width: 7rem;
    min-width: 0;
  }

  input,
  select,
  button {
    font: inherit;
  }

  .problem {
    color: #b00020;
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* One element, barred at its left while selected. */
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
    text-align: start;
    cursor: pointer;
  }

  .select[aria-pressed="true"] .words {
    font-weight: 600;
  }

  .name {
    overflow-wrap: anywhere;
  }
</style>
