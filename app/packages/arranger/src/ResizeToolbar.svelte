<script lang="ts">
/*
 * The resize handles are our own elements in a viewport portal rather than
 * Svelte Flow's `NodeResizeControl`s: a resize control writes its own width
 * and height into the node, while the size of a block during a resize is
 * whatever its drawing at the previewed placement measures. Each handle is
 * the canvas's one pointer gesture with the resize strategy: the pointer
 * yields a delta in canvas units, the strategy turns it into the command,
 * and the canvas draws the block as that command leaves it, so the preview
 * is exactly what the release stores.
 */
import type { Block } from "@timetoalign/tilie-core";
import type { DrawnBox } from "@timetoalign/tilie-layout";
import { useStore, ViewportPortal } from "@xyflow/svelte";
import { calcAutoPan, getNodeToolbarTransform, Position } from "@xyflow/system";
import type { Attachment } from "svelte/attachments";
import { isHeld } from "./boxes.ts";
import type { Level } from "./containers.ts";
import { resizeModes } from "./containers.ts";
import type { GestureOptions } from "./gesture.ts";
import { pointerGesture } from "./gesture.ts";
import type { ResizeHost } from "./gestures/resize.ts";
import { resizeGesture } from "./gestures/resize.ts";
import { itemHandlesFor } from "./items.ts";
import { getNodeActions } from "./nodeActions.ts";
import type { Handle, ResizeMode } from "./resize.ts";
import "./menu.css";
import { handlesFor } from "./resize.ts";
import { roving } from "./roving.ts";

interface Props {
  /** The block resized, or holding the frame or card resized, as stored. */
  block: Block;
  /** The box of the block's drawing resized: its own box, a group's frame or a card. */
  box: DrawnBox;
  /** The level the resize is made at: the arranger, or the open editor's kind. */
  level?: Level;
  /** The resized box on the canvas as currently shown (the preview during a resize). */
  bounds: { x: number; y: number; width: number; height: number };
  zoom: number;
  /** While the canvas is locked or read-only the mode buttons are disabled and no handle is shown. */
  locked: boolean;
  /** The chosen mode; one the level does not offer shows as the first it does. */
  mode: ResizeMode;
}

let { block, box, level = "arranger", bounds, zoom, locked, mode = $bindable() }: Props = $props();

const actions = getNodeActions();

const MODES: readonly { mode: ResizeMode; label: string; key: string }[] = [
  { mode: "scale", label: "Scale", key: "1" },
  { mode: "box", label: "Box", key: "2" },
  { mode: "stretch", label: "Stretch", key: "3" },
];

/**
 * What a mode does, said in its button's title: a held card scales its
 * whole group and stretches every member along time, its own card alone
 * vertically.
 */
function hintOf(chosen: ResizeMode): string {
  const held = isHeld(box);
  if (chosen === "scale")
    return held ? "scale the whole group" : "scale everything, proportions kept";
  if (chosen === "box") return "resize the box, the content stays";
  return held
    ? "stretch every member's length, this card's distances"
    : "stretch lengths and distances";
}

/** The modes offered, in the order of `MODES`, and the one shown. */
const offered = $derived(resizeModes(box, level));
const shown = $derived(offered.includes(mode) ? mode : offered[0]);

/** The handles of `chosen` on the block or on a frame or card. */
function handlesOf(chosen: ResizeMode): readonly Handle[] {
  return box.kind === "block" ? handlesFor(chosen) : itemHandlesFor(chosen, box, level);
}

const CURSORS: { readonly [handle in Handle]: string } = {
  "top-left": "nwse-resize",
  top: "ns-resize",
  "top-right": "nesw-resize",
  right: "ew-resize",
  "bottom-right": "nwse-resize",
  bottom: "ns-resize",
  "bottom-left": "nesw-resize",
  left: "ew-resize",
};

/** The hit area of a handle and its visible square, in screen pixels. */
const HIT = 24;
const MARK = 9;
/** How far above the resized box, in screen pixels, the mode menu sits: Svelte Flow's `NodeToolbar` default. */
const MENU_GAP = 10;

function anchor(handle: Handle): { x: number; y: number } {
  const x = handle.endsWith("left")
    ? 0
    : handle.endsWith("right")
      ? bounds.width
      : bounds.width / 2;
  const y = handle.startsWith("top")
    ? 0
    : handle.startsWith("bottom")
      ? bounds.height
      : bounds.height / 2;
  return { x: bounds.x + x, y: bounds.y + y };
}

const flow = useStore();

/**
 * Where the mode menu sits: centred above the resized box, `MENU_GAP` screen
 * pixels clear of its top, at any zoom. It is placed by the rule Svelte
 * Flow's `NodeToolbar` uses (`getNodeToolbarTransform`), applied to the box
 * rather than to a node, so the menu sits above the block or above the
 * frame or card resized alike, and follows it through a resize and every
 * pan or zoom. While boxes are moved the canvas does not show the toolbar
 * at all; it is shown again at the bounds the move leaves.
 */
const menuTransform = $derived(
  getNodeToolbarTransform(bounds, flow.viewport, Position.Top, MENU_GAP, "center"),
);

/** The toolbar's side of a resize: every member read when the gesture needs it. */
const host: ResizeHost = {
  actions,
  target: () => ({ block, box }),
  level: () => level,
  mode: () => shown,
  locked: () => locked,
  viewport: () => flow.viewport,
  autoPan(screen) {
    const pane = flow.domNode?.getBoundingClientRect();
    if (pane === undefined) return Promise.resolve(false);
    const [x = 0, y = 0] = calcAutoPan(
      { x: screen.x - pane.left, y: screen.y - pane.top },
      { width: pane.width, height: pane.height },
      flow.autoPanSpeed,
    );
    return x === 0 && y === 0 ? Promise.resolve(false) : flow.panBy({ x, y });
  },
};

const options: GestureOptions = {
  dispatch: (command) => actions.dispatch(command),
  slot: actions.gestures,
};

/** One gesture per handle, made once, so a redraw of the handles leaves a resize in progress. */
const gestures = new Map<Handle, Attachment<Element>>();

function gestureOf(handle: Handle): Attachment<Element> {
  let found = gestures.get(handle);
  if (found === undefined) {
    found = pointerGesture(resizeGesture(host, handle), options);
    gestures.set(handle, found);
  }
  return found;
}
</script>

{#if shown !== undefined}
<div class="mode-menu" style:transform={menuTransform}>
  <div class="tilie-menu" role="toolbar" aria-label="Resize mode" {@attach roving}>
    {#each MODES.filter((entry) => offered.includes(entry.mode)) as entry (entry.mode)}
      <button
        type="button"
        class="tilie-menu-item"
        data-testid="mode-{entry.mode}"
        aria-pressed={shown === entry.mode}
        title="{entry.label}: {hintOf(entry.mode)} ({entry.key})"
        disabled={locked}
        onclick={() => (mode = entry.mode)}>{entry.label}</button
      >
    {/each}
  </div>
</div>

{#if !locked}
<ViewportPortal target="front" class="tilie-overlay">
  {#each handlesOf(shown) as handle (handle)}
    {@const at = anchor(handle)}
    <div
      class="handle nodrag nopan nowheel"
      aria-hidden="true"
      data-testid="handle-{handle}"
      style:left="{at.x}px"
      style:top="{at.y}px"
      style:width="{HIT / zoom}px"
      style:height="{HIT / zoom}px"
      style:cursor={CURSORS[handle]}
      style:--mark="{MARK / zoom}px"
      style:--line="{1 / zoom}px"
      {@attach gestureOf(handle)}
    ></div>
  {/each}
</ViewportPortal>
{/if}
{/if}

<style>
  /* Above the nodes' renderer (z-index 4), where Svelte Flow's panels lie. */
  .mode-menu {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 5;
  }

  .handle {
    position: absolute;
    transform: translate(-50%, -50%);
    touch-action: none;
    pointer-events: all;
  }

  .handle::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    width: var(--mark);
    height: var(--mark);
    transform: translate(-50%, -50%);
    box-sizing: border-box;
    background: #fff;
    border: var(--line) solid #0a84ff;
  }
</style>
