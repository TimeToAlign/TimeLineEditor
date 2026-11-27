<script lang="ts" generics="Value extends string">
/*
 * A canvas's mode menu: a toolbar of toggle buttons centred above the box
 * `bounds` on the canvas, `MENU_GAP` screen pixels clear of its top at any
 * zoom, placed by the rule Svelte Flow's `NodeToolbar` uses
 * (`getNodeToolbarTransform`) applied to the box, so it follows the box
 * through every pan, zoom and preview. The resize
 * toolbar's modes (one pressed) and a selected elision's gap modes (one or
 * both pressed) are drawn by it, its buttons by `ModeButtons`, which the
 * Arrange menu draws alone; what a press does is its owner's. What its
 * owner gives as `children` (the resize toolbar's flow switch) stands in the
 * same row, right of the buttons, joined to them as one panel; with no
 * entries the row holds that alone.
 */
import { useStore } from "@xyflow/svelte";
import { getNodeToolbarTransform, Position } from "@xyflow/system";
import type { Snippet } from "svelte";
import type { ModeEntry } from "./ModeButtons.svelte";
import ModeButtons from "./ModeButtons.svelte";

interface Props {
  /** The toolbar's accessible name. */
  label: string;
  /** The buttons, in order. */
  entries: readonly ModeEntry<Value>[];
  /** Whether a value's button shows pressed. */
  pressed: (value: Value) => boolean;
  /** While disabled no button takes a press. */
  disabled: boolean;
  /** The box the menu stands above, on the canvas. */
  bounds: { x: number; y: number; width: number; height: number };
  /** The prefix of each button's test ID, followed by its value. */
  testid: string;
  onpress: (value: Value) => void;
  /** What stands right of the buttons in the same row. */
  children?: Snippet;
}

let { label, entries, pressed, disabled, bounds, testid, onpress, children }: Props = $props();

/** How far above the box, in screen pixels, the menu sits: Svelte Flow's `NodeToolbar` default. */
const MENU_GAP = 10;

const flow = useStore();

const transform = $derived(
  getNodeToolbarTransform(bounds, flow.viewport, Position.Top, MENU_GAP, "center"),
);
</script>

<div class="mode-menu" style:transform>
  {#if entries.length > 0}
    <ModeButtons {label} {entries} {pressed} {disabled} {testid} {onpress} />
  {/if}
  {@render children?.()}
</div>

<style>
  /* Above the nodes' renderer (z-index 4), where Svelte Flow's panels lie. */
  .mode-menu {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 5;
    display: flex;
    align-items: stretch;
  }

  /* Panels side by side in the row are drawn as one: one border between them, square inner corners. */
  .mode-menu > :global(.tilie-menu:has(+ .tilie-menu)) {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }

  .mode-menu > :global(.tilie-menu + .tilie-menu) {
    border-left: 0;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }
</style>
