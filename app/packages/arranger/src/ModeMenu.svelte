<script lang="ts" generics="Value extends string">
/*
 * A canvas's mode menu: a toolbar of toggle buttons. Given `bounds` it is
 * centred above that box on the canvas, `MENU_GAP` screen pixels clear of
 * its top at any zoom, placed by the rule Svelte Flow's `NodeToolbar` uses
 * (`getNodeToolbarTransform`) applied to the box, so it follows the box
 * through every pan, zoom and preview; without, it lies where its parent
 * puts it (the Arrange menu, beside the canvas toolbar). The resize
 * toolbar's modes (one pressed), a selected elision's gap modes (one or
 * both pressed) and the arrangements (one pressed) are all drawn by it;
 * what a press does is its owner's.
 */
import { useStore } from "@xyflow/svelte";
import { getNodeToolbarTransform, Position } from "@xyflow/system";
import type { Snippet } from "svelte";
import "./menu.css";
import { roving } from "./roving.ts";

/** One button: the value it presses, its label, its key and what it does. */
interface Entry {
  readonly value: Value;
  readonly label: string;
  /** The key choosing it; none where no key does. */
  readonly key?: string;
  readonly hint: string;
  /** Why this one button takes no press; absent where it takes one. */
  readonly refused?: string;
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
  /** The box the menu stands above, on the canvas; absent, the menu lies where its parent puts it. */
  bounds?: { x: number; y: number; width: number; height: number };
  /** The prefix of each button's test ID, followed by its value. */
  testid: string;
  onpress: (value: Value) => void;
  /** What follows the buttons inside the menu's panel. */
  children?: Snippet;
}

let { label, entries, pressed, disabled, bounds, testid, onpress, children }: Props = $props();

/** How far above the box, in screen pixels, the menu sits: Svelte Flow's `NodeToolbar` default. */
const MENU_GAP = 10;

const flow = useStore();

const transform = $derived(
  bounds === undefined
    ? undefined
    : getNodeToolbarTransform(bounds, flow.viewport, Position.Top, MENU_GAP, "center"),
);

/** A button's title: its label and what it does, with its key; a refused one says why instead. */
function titleOf(entry: Entry): string {
  if (entry.refused !== undefined) return `${entry.label}: ${entry.refused}`;
  return `${entry.label}: ${entry.hint}${entry.key === undefined ? "" : ` (${entry.key})`}`;
}
</script>

<div class={bounds === undefined ? undefined : "mode-menu"} style:transform>
  <div class="tilie-menu" role="toolbar" aria-label={label} {@attach roving}>
    {#each entries as entry (entry.value)}
      <button
        type="button"
        class="tilie-menu-item"
        data-testid="{testid}-{entry.value}"
        aria-pressed={pressed(entry.value)}
        title={titleOf(entry)}
        disabled={disabled || entry.refused !== undefined}
        onclick={() => onpress(entry.value)}>{entry.label}</button
      >
    {/each}
  </div>
  {@render children?.()}
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
