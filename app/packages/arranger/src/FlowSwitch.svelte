<script lang="ts">
/*
 * The flow switch above a selected card or frame (`flowSwitch.ts`): "As
 * written" and every FlowMap and virtual timeline of the card's root, a
 * frame's members' one after the other. Choosing one sends the `style`
 * commands setting the property `flow` (`flowCommands`), a frame's as one
 * edit of its group, undone in one step; the drawing then shows the card
 * on the chosen virtual axis. It stands centred above the
 * box, `offset` screen pixels clear of its top, above the resize modes.
 * The list is `SWITCH_WIDTH` wide whatever the names: the chosen name is
 * cut with an ellipsis where it is longer, and every name is shown whole
 * on hover (the list's and each entry's `title`).
 */
import type { Block } from "@timetoalign/tilie-core";
import type { DrawnBox } from "@timetoalign/tilie-layout";
import { useStore } from "@xyflow/svelte";
import { getNodeToolbarTransform, Position } from "@xyflow/system";
import { tick } from "svelte";
import type { FlowChoice } from "./flowSwitch.ts";
import { chosenFlow, flowCommands, SWITCH_WIDTH } from "./flowSwitch.ts";
import "./menu.css";
import { getNodeActions } from "./nodeActions.ts";

interface Props {
  /** The block holding the box, as stored. */
  block: Block;
  /** The selected card or frame of the block's drawing. */
  box: DrawnBox;
  /** The list to choose from (`flowChoices`): "As written" first. */
  choices: readonly FlowChoice[];
  /** The box on the canvas as currently shown. */
  bounds: { x: number; y: number; width: number; height: number };
  /** How far above the box, in screen pixels, the switch's bottom stands. */
  offset: number;
  /** While the canvas is locked or read-only nothing can be chosen. */
  locked: boolean;
}

let { block, box, choices, bounds, offset, locked }: Props = $props();

const actions = getNodeActions();
const flow = useStore();

const transform = $derived(
  getNodeToolbarTransform(bounds, flow.viewport, Position.Top, offset, "center"),
);

/** The index of the entry shown chosen. */
const chosen = $derived.by(() => {
  const shown = chosenFlow(block.manifest, box);
  return Math.max(
    0,
    choices.findIndex((choice) => choice.timeline === shown.timeline && choice.flow === shown.flow),
  );
});

/** Send the commands of the entry at the select's value, then show what the store holds. */
function onchange(event: Event & { currentTarget: HTMLSelectElement }) {
  const select = event.currentTarget;
  const choice = choices[Number(select.value)];
  if (choice === undefined) return;
  const commands = flowCommands(block.id, block.manifest, box, choice);
  // A card's choice sends at most one command; a frame's are one edit of its group.
  const group = box.kind === "frame" ? box.address.id : undefined;
  if (group !== undefined) actions.edit({ block: block.id, id: group }, commands);
  else for (const command of commands) actions.dispatch(command);
  void tick().then(() => {
    select.value = String(chosen);
  });
}
</script>

<div class="flow-switch" style:transform>
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
      {#each choices as choice, index (`${choice.timeline} ${choice.flow}`)}
        <option value={String(index)} title={choice.label}>{choice.label}</option>
      {/each}
    </select>
  </label>
</div>

<style>
  /* Above the nodes' renderer (z-index 4), where Svelte Flow's panels and the mode menu lie. */
  .flow-switch {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 5;
  }

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
