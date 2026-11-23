<script lang="ts" generics="Value extends string">
/*
 * A canvas's mode menu: a toolbar of toggle buttons centred above a box on
 * the canvas, `MENU_GAP` screen pixels clear of its top at any zoom, placed
 * by the rule Svelte Flow's `NodeToolbar` uses (`getNodeToolbarTransform`)
 * applied to the box, so it follows the box through every pan, zoom and
 * preview. The resize toolbar's modes (one pressed) and a selected
 * elision's gap modes (one or both pressed) are both drawn by it; what a
 * press does is its owner's.
 */
import { useStore } from "@xyflow/svelte";
import { getNodeToolbarTransform, Position } from "@xyflow/system";
import "./menu.css";
import { roving } from "./roving.ts";

/** One button: the value it presses, its label, its key and what it does. */
interface Entry {
  readonly value: Value;
  readonly label: string;
  readonly key: string;
  readonly hint: string;
}

interface Props {
  /** The toolbar's accessible name. */
  label: string;
  /** The buttons, in order. */
  entries: readonly Entry[];
  /** Whether a value's button shows pressed. */
  pressed: (value: Value) => boolean;
  /** While disabled no button takes a press. */
  disabled: boolean;
  /** The box the menu stands above, on the canvas. */
  bounds: { x: number; y: number; width: number; height: number };
  /** The prefix of each button's test ID, followed by its value. */
  testid: string;
  onpress: (value: Value) => void;
}

let { label, entries, pressed, disabled, bounds, testid, onpress }: Props = $props();

/** How far above the box, in screen pixels, the menu sits: Svelte Flow's `NodeToolbar` default. */
const MENU_GAP = 10;

const flow = useStore();

const transform = $derived(
  getNodeToolbarTransform(bounds, flow.viewport, Position.Top, MENU_GAP, "center"),
);
</script>

<div class="mode-menu" style:transform>
  <div class="tilie-menu" role="toolbar" aria-label={label} {@attach roving}>
    {#each entries as entry (entry.value)}
      <button
        type="button"
        class="tilie-menu-item"
        data-testid="{testid}-{entry.value}"
        aria-pressed={pressed(entry.value)}
        title="{entry.label}: {entry.hint} ({entry.key})"
        {disabled}
        onclick={() => onpress(entry.value)}>{entry.label}</button
      >
    {/each}
  </div>
</div>

<style>
  /* Above the nodes' renderer (z-index 4), where Svelte Flow's panels lie. */
  .mode-menu {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 5;
  }
</style>
