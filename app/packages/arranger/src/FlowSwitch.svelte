<script lang="ts">
/*
 * The flow switch of a selected card (`flowSwitch.ts`): "As written" and
 * each FlowMap of the card's root once. It stands in the resize toolbar's
 * row, right of the resize modes (`ModeMenu` places the row above the
 * box). Choosing one sends the `style` command setting the property `flow`
 * (`flowCommands`); the drawing then shows the card on the chosen virtual
 * axis. The list is `SWITCH_WIDTH` wide whatever the names: the chosen name
 * is cut with an ellipsis where it is longer, and every name is shown whole
 * on hover (the list's and each entry's `title`).
 */
import type { Block } from "@timetoalign/tilie-core";
import type { DrawnBox } from "@timetoalign/tilie-layout";
import { tick } from "svelte";
import type { FlowChoice } from "./flowSwitch.ts";
import { chosenFlow, flowCommands, SWITCH_WIDTH } from "./flowSwitch.ts";
import "./menu.css";
import { getNodeActions } from "./nodeActions.ts";

interface Props {
  /** The block holding the card, as stored. */
  block: Block;
  /** The selected card of the block's drawing. */
  box: DrawnBox;
  /** The list to choose from (`flowChoices`): "As written" first. */
  choices: readonly FlowChoice[];
  /** While the canvas is locked or read-only nothing can be chosen. */
  locked: boolean;
}

let { block, box, choices, locked }: Props = $props();

const actions = getNodeActions();

/** The index of the entry shown chosen. */
const chosen = $derived.by(() => {
  const shown = chosenFlow(block.manifest, box);
  return Math.max(
    0,
    choices.findIndex((choice) => choice.flow === shown.flow),
  );
});

/** Send the command of the entry at the select's value, then show what the store holds. */
function onchange(event: Event & { currentTarget: HTMLSelectElement }) {
  const select = event.currentTarget;
  const choice = choices[Number(select.value)];
  if (choice === undefined) return;
  for (const command of flowCommands(block.id, block.manifest, box, choice)) {
    actions.dispatch(command);
  }
  void tick().then(() => {
    select.value = String(chosen);
  });
}
</script>

<label class="tilie-menu">
  <span class="name">Flow</span>
  <select
    class="tilie-menu-item nodrag nopan nowheel"
    data-testid="flow-switch"
    style:width={SWITCH_WIDTH}
    title={choices[chosen]?.label}
    disabled={locked}
    value={String(chosen)}
    {onchange}
  >
    {#each choices as choice, index (choice.flow)}
      <option value={String(index)} title={choice.label}>{choice.label}</option>
    {/each}
  </select>
</label>

<style>
  .tilie-menu {
    align-items: center;
  }

  .name {
    padding: 0 0.4rem;
    font-size: 0.85rem;
  }

  /* A name wider than the list is cut, never widening it. */
  select {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
</style>
