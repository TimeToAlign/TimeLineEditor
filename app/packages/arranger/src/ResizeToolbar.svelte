<script lang="ts">
/*
 * The resize handles are our own elements in a viewport portal rather than
 * Svelte Flow's `NodeResizeControl`s: a resize control writes its own width
 * and height into the node, while the size of a block during a resize is
 * whatever its drawing at the previewed placement measures. With our own
 * handles the pointer only yields a delta in canvas units, `resize` (for a
 * block) or `itemResizeValues` (for an item) turns it into new values, and
 * the canvas draws the block at those values, so the preview is exactly what
 * the command will store.
 */
import type { Block, SetCommand, View } from "@timetoalign/tilie-core";
import type { FontMetrics } from "@timetoalign/timeskeleton";
import { useStore, ViewportPortal } from "@xyflow/svelte";
import { calcAutoPan, getNodeToolbarTransform, Position } from "@xyflow/system";
import type { Level } from "./editors.ts";
import type { ResizedItem } from "./gestures.svelte.ts";
import { resizeModes } from "./gestures.svelte.ts";
import { itemHandlesFor, itemResizeCommand, itemResizeValues, placesAfter } from "./items.ts";
import type { Delta, Handle, ResizeMode } from "./resize.ts";
import "./menu.css";
import { handlesFor, resize, resizeCommand } from "./resize.ts";
import { roving } from "./roving.ts";

interface Props {
  /** The selected block as stored, or the block of the item resized. */
  block: Block;
  /**
   * The box of the block's drawing resized, a group's frame, an ungrouped
   * root's card or a member's card; absent, the block itself is.
   */
  item?: ResizedItem | undefined;
  /** The level the resize is made at: the arranger, or the open editor's kind. */
  level?: Level;
  /** The box resized on the canvas as currently shown (the preview during a resize). */
  box: { x: number; y: number; width: number; height: number };
  /** The view the block lies in. */
  view: View;
  metrics: FontMetrics;
  zoom: number;
  /** While the canvas is locked the mode buttons are disabled and no handle is shown. */
  locked: boolean;
  /** The chosen mode; one the level does not offer shows as the first it does. */
  mode: ResizeMode;
  /** A new preview of the block's values during a resize. */
  onresize: (values: Partial<Block>) => void;
  /**
   * The resize is complete: the block's values as previewed last, and the
   * command storing them, `null` when it would change nothing.
   */
  onresizeend: (values: Partial<Block>, command: SetCommand | null) => void;
  /** The resize ended without a change. */
  onresizecancel: () => void;
}

let {
  block,
  item,
  level = "arranger",
  box,
  view,
  metrics,
  zoom,
  locked,
  mode = $bindable(),
  onresize,
  onresizeend,
  onresizecancel,
}: Props = $props();

const MODES: readonly { mode: ResizeMode; label: string; key: string }[] = [
  { mode: "scale", label: "Scale", key: "1" },
  { mode: "box", label: "Box", key: "2" },
  { mode: "stretch", label: "Stretch", key: "3" },
];

/**
 * What a mode does, said in its button's title: a member's card scales its
 * whole group and stretches every member along time, its own card alone
 * vertically.
 */
function hintOf(chosen: ResizeMode): string {
  const member = item?.kind === "member";
  if (chosen === "scale")
    return member ? "scale the whole group" : "scale everything, proportions kept";
  if (chosen === "box") return "resize the box, the content stays";
  return member
    ? "stretch every member's length, this card's distances"
    : "stretch lengths and distances";
}

/** The modes offered, in the order of `MODES`, and the one shown. */
const offered = $derived(resizeModes(level, item?.kind ?? "block"));
const shown = $derived(offered.includes(mode) ? mode : offered[0]);

/** The handles of `chosen` on the block or on the item. */
function handlesOf(chosen: ResizeMode): readonly Handle[] {
  return item === undefined ? handlesFor(chosen) : itemHandlesFor(chosen, item.kind, level);
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
  const x = handle.endsWith("left") ? 0 : handle.endsWith("right") ? box.width : box.width / 2;
  const y = handle.startsWith("top")
    ? 0
    : handle.startsWith("bottom")
      ? box.height
      : box.height / 2;
  return { x: box.x + x, y: box.y + y };
}

const flow = useStore();

/**
 * Where the mode menu sits: centred above the resized box, `MENU_GAP` screen
 * pixels clear of its top, at any zoom. It is placed by the rule Svelte
 * Flow's `NodeToolbar` uses (`getNodeToolbarTransform`), applied to the box
 * rather than to a node, so the menu sits above the block or above the item
 * resized (a group's frame, a card) alike, and follows it through a move, a
 * resize and every pan or zoom.
 */
const menuTransform = $derived(
  getNodeToolbarTransform(box, flow.viewport, Position.Top, MENU_GAP, "center"),
);

/**
 * The resize in progress: its mode, where the pointer went down and is now
 * (client pixels), and the viewport's pan when it went down. The delta in
 * canvas units is the pointer's travel less the viewport's, over the zoom.
 */
let gesture: {
  pointer: number;
  mode: ResizeMode;
  handle: Handle;
  start: { x: number; y: number };
  client: { x: number; y: number };
  pan: { x: number; y: number };
  moved: boolean;
  frame: number;
} | null = null;

/** The values and the command of the resize in progress, the pointer where it is now. */
function result(): { values: Partial<Block>; command: SetCommand | null } {
  if (gesture === null) return { values: {}, command: null };
  const { mode: chosen, handle, start, client, pan } = gesture;
  const { x, y, zoom: z } = flow.viewport;
  const delta: Delta = {
    dx: (client.x - start.x - (x - pan.x)) / z,
    dy: (client.y - start.y - (y - pan.y)) / z,
  };
  if (item === undefined) {
    const { values } = resize(block, view.settings, metrics, chosen, handle, delta);
    // A resize that changes no stored value is no command, like a drag that ends where it began.
    const changes = Object.entries(values).some(
      ([member, value]) => block[member as keyof Block] !== value,
    );
    return { values, command: changes ? resizeCommand(block, values) : null };
  }
  const places = itemResizeValues(
    block,
    view.settings,
    metrics,
    level,
    item,
    chosen,
    handle,
    delta,
  );
  const command = itemResizeCommand(view, block.id, places, level, metrics);
  return { values: command === null ? {} : { places: placesAfter(block, command) }, command };
}

/**
 * While the pointer is in the pane's edge band, pan at Svelte Flow's
 * auto-pan speed every frame and redraw the preview where the pointer now
 * is on the canvas, as Svelte Flow does for a node drag.
 */
function autoPan(): void {
  const current = gesture;
  if (current === null) return;
  const pane = flow.domNode?.getBoundingClientRect();
  if (pane !== undefined) {
    const [x = 0, y = 0] = calcAutoPan(
      { x: current.client.x - pane.left, y: current.client.y - pane.top },
      { width: pane.width, height: pane.height },
      flow.autoPanSpeed,
    );
    if (x !== 0 || y !== 0) {
      void flow.panBy({ x, y }).then((panned) => {
        if (panned && gesture === current) onresize(result().values);
      });
    }
  }
  current.frame = requestAnimationFrame(autoPan);
}

function stop(): void {
  if (gesture !== null) cancelAnimationFrame(gesture.frame);
  gesture = null;
}

// A resize still in progress when the toolbar goes away ends with it, without a command.
$effect(() => stop);

function start(event: PointerEvent, handle: Handle): void {
  if (event.button !== 0 || shown === undefined) return;
  event.stopPropagation();
  event.preventDefault();
  (event.currentTarget as Element).setPointerCapture(event.pointerId);
  const at = { x: event.clientX, y: event.clientY };
  gesture = {
    pointer: event.pointerId,
    mode: shown,
    handle,
    start: at,
    client: at,
    pan: { x: flow.viewport.x, y: flow.viewport.y },
    moved: false,
    frame: 0,
  };
}

function move(event: PointerEvent): void {
  if (gesture === null || event.pointerId !== gesture.pointer) return;
  if (!gesture.moved && event.clientX === gesture.start.x && event.clientY === gesture.start.y) {
    return;
  }
  gesture.client = { x: event.clientX, y: event.clientY };
  if (!gesture.moved) {
    gesture.moved = true;
    gesture.frame = requestAnimationFrame(autoPan);
  }
  onresize(result().values);
}

function end(event: PointerEvent): void {
  if (gesture === null || event.pointerId !== gesture.pointer) return;
  gesture.client = { x: event.clientX, y: event.clientY };
  const ended = gesture.moved ? result() : null;
  stop();
  if (ended === null) onresizecancel();
  else onresizeend(ended.values, ended.command);
}

/** End a resize in progress without a command; `false` when none is in progress. */
export function abort(): boolean {
  if (gesture === null) return false;
  stop();
  onresizecancel();
  return true;
}

function cancel(event: PointerEvent): void {
  if (gesture === null || event.pointerId !== gesture.pointer) return;
  stop();
  onresizecancel();
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
      onpointerdown={(event) => start(event, handle)}
      onpointermove={move}
      onpointerup={end}
      onpointercancel={cancel}
      onlostpointercapture={cancel}
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
