<script lang="ts">
/*
 * The resize handles are our own elements in a viewport portal rather than
 * Svelte Flow's `NodeResizeControl`s: a resize control writes its own width
 * and height into the node, while the size of a block during a resize is
 * whatever its drawing at the previewed placement measures. With our own
 * handles the pointer only yields a delta in canvas units, `resize` turns it
 * into the block's new values, and the canvas draws the block at those
 * values, so the preview is exactly what the command will store.
 */
import type { Block, WorkspaceSettings } from "@timetoalign/tilie-core";
import type { FontMetrics } from "@timetoalign/timeskeleton";
import { NodeToolbar, useStore, ViewportPortal } from "@xyflow/svelte";
import { calcAutoPan } from "@xyflow/system";
import type { Handle, ResizeMode } from "./resize.ts";
import { handlesFor, resize } from "./resize.ts";
import { roving } from "./roving.ts";

interface Props {
  /** The selected block as stored. */
  block: Block;
  /** The block's box on the canvas as currently shown (the preview during a resize). */
  box: { x: number; y: number; width: number; height: number };
  settings: WorkspaceSettings;
  metrics: FontMetrics;
  zoom: number;
  /** While the canvas is locked the mode buttons are disabled and no handle is shown. */
  locked: boolean;
  mode: ResizeMode;
  /** A new preview of the block's values during a resize. */
  onresize: (values: Partial<Block>) => void;
  /** The resize is complete with these values. */
  onresizeend: (values: Partial<Block>) => void;
  /** The resize ended without a change. */
  onresizecancel: () => void;
}

let {
  block,
  box,
  settings,
  metrics,
  zoom,
  locked,
  mode = $bindable(),
  onresize,
  onresizeend,
  onresizecancel,
}: Props = $props();

const MODES: readonly { mode: ResizeMode; label: string; key: string; hint: string }[] = [
  { mode: "scale", label: "Scale", key: "1", hint: "scale everything, proportions kept" },
  { mode: "box", label: "Box", key: "2", hint: "resize the box, the content stays" },
  { mode: "stretch", label: "Stretch", key: "3", hint: "stretch lengths and distances" },
];

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

function values(): Partial<Block> {
  if (gesture === null) return {};
  const { mode: chosen, handle, start, client, pan } = gesture;
  const { x, y, zoom: z } = flow.viewport;
  const delta = {
    dx: (client.x - start.x - (x - pan.x)) / z,
    dy: (client.y - start.y - (y - pan.y)) / z,
  };
  return resize(block, settings, metrics, chosen, handle, delta).values;
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
        if (panned && gesture === current) onresize(values());
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
  if (event.button !== 0) return;
  event.stopPropagation();
  event.preventDefault();
  (event.currentTarget as Element).setPointerCapture(event.pointerId);
  const at = { x: event.clientX, y: event.clientY };
  gesture = {
    pointer: event.pointerId,
    mode,
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
  onresize(values());
}

function end(event: PointerEvent): void {
  if (gesture === null || event.pointerId !== gesture.pointer) return;
  gesture.client = { x: event.clientX, y: event.clientY };
  const result = gesture.moved ? values() : null;
  stop();
  if (result === null) onresizecancel();
  else onresizeend(result);
}

function cancel(event: PointerEvent): void {
  if (gesture === null || event.pointerId !== gesture.pointer) return;
  stop();
  onresizecancel();
}
</script>

<NodeToolbar nodeId={block.id} isVisible>
  <div class="modes" role="toolbar" aria-label="Resize mode" {@attach roving}>
    {#each MODES as item (item.mode)}
      <button
        type="button"
        data-testid="mode-{item.mode}"
        aria-pressed={mode === item.mode}
        title="{item.label}: {item.hint} ({item.key})"
        disabled={locked}
        onclick={() => (mode = item.mode)}>{item.label}</button
      >
    {/each}
  </div>
</NodeToolbar>

{#if !locked}
<ViewportPortal target="front" class="tilie-overlay">
  {#each handlesFor(mode) as handle (handle)}
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

<style>
  .modes {
    display: flex;
    gap: 2px;
    padding: 2px;
    background: #fff;
    border: 1px solid #d0d0d0;
    border-radius: 4px;
  }

  button {
    min-width: 32px;
    min-height: 32px;
    padding: 0 0.6rem;
    border: 1px solid transparent;
    border-radius: 3px;
    background: none;
    font: inherit;
    font-size: 0.85rem;
    color: inherit;
    cursor: pointer;
  }

  button:hover {
    background: #f0f0f0;
  }

  button:disabled {
    cursor: default;
    opacity: 0.5;
  }

  button[aria-pressed="true"] {
    background: #dcebff;
    border-color: #0a84ff;
  }

  button:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
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
