<script lang="ts">
/**
 * The Flow control tab's own part (`flowControl.ts`): "Add flow control",
 * the kind (`FLOW_KINDS`, grouped), the timeline of the root's tree, the
 * jump's position on its axis (proposed from the selection,
 * `proposedPosition`, typed text kept until the selection proposes
 * another), and what the kind asks for beside it: each destination chosen
 * among the timeline's elements or created at a position of its own
 * (`slotOptions`), each second position typed; then Add, which adds every
 * element of the kind (`flowPlan`, `addFlowElements`) and selects them all
 * on the canvas; then the tree's flow-control elements, each row selecting
 * its element, the selected ones marked. A refusal, before dispatch or by
 * the store, stands in the status line below Add.
 */
import type { Address, Store } from "@timetoalign/tilie-core";
import { addressKey } from "@timetoalign/tilie-core";
import type { FlowControlShown, FlowSlotKey, SlotInput } from "./flowControl.ts";
import {
  addFlowElements,
  defaultPick,
  FLOW_GROUPS,
  FLOW_KINDS,
  FLOW_SLOTS,
  flowPlan,
  PICK_NEW,
  proposedPosition,
  slotOptions,
} from "./flowControl.ts";

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
  /** Select `addresses` on the canvas: a row's element, the elements added. */
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
let kind: string = $state(FLOW_KINDS[0]?.key ?? "");
let timeline = $derived(proposedTimeline);
let text = $derived(proposedText);

/** The options chosen and the positions typed for the slots, by slot. */
let picks: { [key in FlowSlotKey]?: string } = $state({});
let slotTexts: { [key in FlowSlotKey]?: string } = $state({});

const chosen = $derived(FLOW_KINDS.find((item) => item.key === kind));

/** The chosen kind's slots in the form's order: each with its options and the option it holds. */
const slots = $derived(
  (chosen?.slots ?? []).map((key) => {
    const options = slotOptions(shown, timeline, key);
    const asked = picks[key];
    const pick = options.some((option) => option.value === asked)
      ? (asked ?? "")
      : defaultPick(options);
    return { slot: FLOW_SLOTS[key], options, pick };
  }),
);

/** The unit of the chosen timeline's axis. */
const unit = $derived(shown.timelines.find((item) => item.id === timeline)?.unit ?? "");

/** The refusal of the last Add; `null` after one that was stored. */
let problem: string | null = $state(null);

/** Add the chosen kind's elements, then select them. */
function add(): void {
  const given: { [key in FlowSlotKey]?: SlotInput } = {};
  for (const { slot, pick } of slots) given[slot.key] = { pick, text: slotTexts[slot.key] ?? "" };
  const plan = flowPlan(shown, { kind, timeline, text, slots: given });
  if (!plan.ok) {
    problem = plan.problems[0]?.message ?? "the element cannot be added";
    return;
  }
  const added = addFlowElements(store, shown.block.id, plan.value);
  if (!added.ok) {
    problem = added.problems[0]?.message ?? "the element cannot be added";
    return;
  }
  problem = null;
  slotTexts = {};
  onselect(added.value);
}
</script>

{#snippet position(label: string, value: string, oninput: (value: string) => void)}
  <label class="field">
    <span>{label}</span>
    <span class="value">
      <input
        type="text"
        inputmode="decimal"
        bind:value={() => value, oninput}
        aria-invalid={problem !== null}
        aria-describedby="{uid}-problem"
      />
      {#if unit !== ""}<span class="unit">{unit}</span>{/if}
    </span>
  </label>
{/snippet}

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
        {#each FLOW_GROUPS as entry (entry.group)}
          <optgroup label={entry.group}>
            {#each entry.kinds as item (item.key)}
              <option value={item.key}>{item.label}</option>
            {/each}
          </optgroup>
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
    {@render position(chosen?.at ?? "Position", text, (value) => (text = value))}
    {#each slots as { slot, options, pick } (slot.key)}
      {#if slot.kind === "choice"}
        <label class="field">
          <span>{slot.label}</span>
          <select bind:value={() => pick, (next) => (picks[slot.key] = next)}>
            {#each options as option (option.value)}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        </label>
        {#if pick === PICK_NEW}
          {@render position(
            `New ${slot.noun} at`,
            slotTexts[slot.key] ?? "",
            (value) => (slotTexts[slot.key] = value),
          )}
        {/if}
      {:else}
        {@render position(
          slot.label,
          slotTexts[slot.key] ?? "",
          (value) => (slotTexts[slot.key] = value),
        )}
      {/if}
    {/each}
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
