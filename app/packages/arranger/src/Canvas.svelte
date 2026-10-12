<script lang="ts">
import type { Block, Store, View } from "@timetoalign/tilie-core";
import type { FontMetrics } from "@timetoalign/timeskeleton";
import type { Viewport } from "@xyflow/svelte";
import { SelectionMode, SvelteFlow } from "@xyflow/svelte";
import "@xyflow/svelte/dist/style.css";
import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";
import BlockNode from "./BlockNode.svelte";
import CanvasToolbar from "./CanvasToolbar.svelte";
import type { Visible } from "./commands.ts";
import { moveCommand, nudgeCommand, removeCommand, zOrderCommand } from "./commands.ts";
import { descriptorsOf, drawingOf } from "./drawing.ts";
import type { BlockNode as BlockNodeType } from "./project.ts";
import { project } from "./project.ts";
import ResizeToolbar from "./ResizeToolbar.svelte";
import type { ResizeMode } from "./resize.ts";
import { resizeCommand } from "./resize.ts";
import SnapGuides from "./SnapGuides.svelte";
import type { Selection } from "./selection.ts";
import { click } from "./selection.ts";
import type { Box, Guide } from "./snap.ts";
import { snap } from "./snap.ts";

interface Props {
  /** The workspace store; replacing it shows the new workspace, fitted into view. */
  store: Store;
  metrics: FontMetrics;
  /** The selected addresses: block ids and `<block>/<element id>`. */
  selection: Selection;
  /** While locked, dragging a block pans the canvas instead of moving the block. */
  locked: boolean;
  mode: ResizeMode;
  viewport: Viewport;
}

let {
  store,
  metrics,
  selection = $bindable(),
  locked = $bindable(),
  mode = $bindable(),
  viewport = $bindable(),
}: Props = $props();

/** Above this many blocks only the blocks in view are mounted. */
const CULLING_THRESHOLD = 500;
/** How close, in screen pixels, a dragged block snaps to another block's edge or origin. */
const SNAP_TOLERANCE = 6;
/** Arrow keys move by one grid step; with Shift by this many. */
const LARGE_STEP = 8;

const nodeTypes = { block: BlockNode };
/**
 * Delete and Backspace are ours (`removeCommand`), so Svelte Flow binds no
 * delete key. An empty list rather than `null`: Svelte Flow turns `null`
 * into an empty shortcut, which its shortcut library warns about.
 */
const NO_KEYS: string[] = [];
/**
 * The wheel pans (vertically; with Shift horizontally) and zooms with Ctrl
 * or Cmd held; a touchpad pinch, which browsers report as a wheel with
 * `ctrlKey`, zooms too.
 */
const ZOOM_KEYS = ["Control", "Meta"];
/** Canvas pixels panned per pixel of wheel travel, Svelte Flow's default. */
const PAN_SPEED = 0.5;
/** Firefox reports wheel travel in lines (`deltaMode` 1); Svelte Flow counts a line as 20 px. */
const LINE = 20;
const MAC = typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");

/**
 * Shift+wheel pans horizontally. Svelte Flow, outside macOS, turns a Shift
 * wheel's vertical travel into horizontal travel, but Chromium and Firefox on
 * Linux and Windows already report a Shift wheel as horizontal travel, which
 * Svelte Flow would then discard. Such an event is panned here instead.
 */
function onShiftWheel(event: WheelEvent): void {
  if (MAC || !event.shiftKey || event.ctrlKey || event.metaKey) return;
  if (event.deltaY !== 0 || event.deltaX === 0) return;
  if (event.target instanceof Element && event.target.closest(".nowheel") !== null) return;
  event.preventDefault();
  event.stopPropagation();
  const travel = event.deltaX * (event.deltaMode === 1 ? LINE : 1) * PAN_SPEED;
  setViewport({ x: viewport.x - travel, y: viewport.y, zoom: viewport.zoom });
}

/** Listen before Svelte Flow, and actively: Svelte's own wheel listeners are passive. */
const shiftWheel: Attachment<HTMLElement> = (element) => {
  element.addEventListener("wheel", onShiftWheel, { capture: true, passive: false });
  return () => element.removeEventListener("wheel", onShiftWheel, { capture: true });
};

const translateExtent: [[number, number], [number, number]] = [
  [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
];

/** The store's current view, refreshed through its subscription. */
let view: View = $state.raw(untrack(() => store.view));

$effect(() => {
  const current = store;
  view = current.view;
  return current.subscribe((next) => {
    view = next;
  });
});

let toolbar: ReturnType<typeof CanvasToolbar> | undefined = $state();

/** Show the canvas at `next`; see `CanvasToolbar.setViewport`. */
export function setViewport(next: Viewport): void {
  toolbar?.setViewport(next);
}

/** Whether the open workspace holds any block. */
function hasBlocks(): boolean {
  return Object.keys(view.blocks).length > 0;
}

/**
 * A newly opened workspace is fitted into view once the flow exists, and
 * only then: an empty one is not, since Svelte Flow would hold the fit until
 * the first block appears and move the view when a block is added.
 */
$effect(() => {
  const current = store;
  const flow = toolbar;
  untrack(() => {
    if (flow !== undefined && Object.keys(current.view.blocks).length > 0) flow.fit();
  });
});

/** The block being resized and its previewed values; shown, never stored, until release. */
let preview: { readonly id: string; readonly values: Partial<Block> } | null = $state.raw(null);
let guides: readonly Guide[] = $state.raw([]);
let marquee = $state(false);
/** The last refusal, announced in the status region. */
let hint = $state("");

/**
 * The canvas is mounted only once the bundled face has loaded. `draw`
 * measures text with this face's advance table, and Chromium keeps the
 * layout of SVG text drawn before a face arrives, so the canvas never paints
 * text in any other face: until the face is there it shows that it is
 * loading, and if the face cannot be loaded it shows the error instead.
 * Without a font loading API (jsdom) there is nothing to wait for.
 */
const FACE = '16px "TiLiE DejaVu Sans"';
const fontLoaded: Promise<void> | true =
  typeof document === "undefined" || !("fonts" in document)
    ? true
    : document.fonts.load(FACE).then((faces) => {
        if (faces.length === 0) throw new Error("the face is not declared");
      });

/**
 * The last projection, so an unchanged block keeps its node object. A plain
 * variable on purpose: it is a memo the derivation below reads and writes
 * itself (`project` reuses its unchanged members), not state anything should
 * react to; as state, writing it inside the derivation would be an error.
 */
let projected: BlockNodeType[] = [];

/**
 * The nodes Svelte Flow shows: the projection of the view, with the block
 * under resize drawn at its previewed values. Svelte Flow writes the dragged
 * positions into this value during a gesture; the next change of the view or
 * the selection replaces them with the projection again.
 */
let nodes: BlockNodeType[] = $derived.by(() => {
  projected = project(view, selection, projected, metrics);
  return preview === null ? projected : withPreview(projected, preview.id, preview.values);
});

function withPreview(
  current: BlockNodeType[],
  id: string,
  values: Partial<Block>,
): BlockNodeType[] {
  const block = view.blocks[id];
  if (block === undefined) return current;
  const drawing = drawingOf(block, view.settings, metrics, values);
  const shown: Block = { ...block, ...values };
  const width = drawing.width * shown.scale;
  const height = drawing.height * shown.scale;
  return current.map((node) =>
    node.id === id
      ? {
          ...node,
          position: { x: shown.x, y: shown.y },
          width,
          height,
          measured: { width, height },
          data: { ...node.data, block: shown, drawing, descriptors: descriptorsOf(drawing) },
        }
      : node,
  );
}

/** The single selected block, the one the resize toolbar acts on. */
const resizable = $derived.by(() => {
  if (selection.size !== 1) return undefined;
  const [address] = selection;
  return address === undefined ? undefined : view.blocks[address];
});

const resizableBox = $derived.by(() => {
  const node = resizable === undefined ? undefined : nodes.find(({ id }) => id === resizable.id);
  if (node === undefined) return undefined;
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.width ?? 0,
    height: node.height ?? 0,
  };
});

/** Svelte Flow's own grid snapping, on while the workspace snaps to its grid. */
const snapping: { snapGrid?: [number, number] } = $derived(
  view.settings.grid.snap ? { snapGrid: [view.settings.grid.size, view.settings.grid.size] } : {},
);

/** The selected block ids, without element addresses. */
function selectedBlocks(): string[] {
  return [...selection].filter((address) => Object.hasOwn(view.blocks, address));
}

function dispatch(command: unknown): boolean {
  const error = store.dispatch(command);
  if (error === null) {
    hint = "";
    return true;
  }
  hint = error.message;
  return false;
}

// --- Selection -------------------------------------------------------------

/** A click selects the element under the pointer, or the block when it hits its background. */
/**
 * Whether a click adds to the selection (or removes an item already in it):
 * with Shift, and always while the marquee toggle is on.
 */
function additive(event: { shiftKey: boolean }): boolean {
  return event.shiftKey || marquee;
}

function onnodeclick({ node, event }: { node: BlockNodeType; event: MouseEvent | TouchEvent }) {
  const target = event.target instanceof Element ? event.target : null;
  const element = target?.closest("[data-address]")?.getAttribute("data-address");
  const address = element == null ? node.id : `${node.id}/${element}`;
  selection = click(selection, address, additive(event));
}

function onpaneclick({ event }: { event: MouseEvent }) {
  if (!additive(event)) selection = new Set();
}

/**
 * The marquee's result is the set of blocks Svelte Flow marked while it was
 * drawn. A Shift+drag marquee replaces the selection; while the marquee
 * toggle is on, the result is added to it.
 */
function onselectionend() {
  const marked = nodes.filter((node) => node.selected).map((node) => node.id);
  selection = new Set(marquee ? [...selection, ...marked] : marked);
}

// --- Drag ------------------------------------------------------------------

/** The boxes the dragged blocks snap to, fixed for one gesture. */
let anchors: readonly Box[] = [];

function boxOf(node: BlockNodeType, position = node.position): Box {
  const { drawing, block } = node.data;
  const root = drawing.elements.find((element) => element.type === "timeline");
  return {
    id: node.id,
    x: position.x,
    y: position.y,
    width: node.width ?? drawing.width * block.scale,
    height: node.height ?? drawing.height * block.scale,
    origin: position.x + (root?.type === "timeline" ? root.xs : 0) * block.scale,
  };
}

/** The offset that snaps the dragged nodes, from where Svelte Flow put the leading one. */
function snapOffset(lead: BlockNodeType): { dx: number; dy: number; guides: readonly Guide[] } {
  const snapped = snap(boxOf(lead), anchors, view.settings.grid, SNAP_TOLERANCE / viewport.zoom);
  return {
    dx: snapped.x - lead.position.x,
    dy: snapped.y - lead.position.y,
    guides: snapped.guides,
  };
}

type DragEvent = { targetNode: BlockNodeType | null; nodes: BlockNodeType[] };

function onnodedragstart({ targetNode, nodes: dragged }: DragEvent) {
  const ids = new Set(dragged.map(({ id }) => id));
  anchors = projected.filter(({ id }) => !ids.has(id)).map((node) => boxOf(node));
  // Dragging a block that is not selected selects it, unless the selection is inside it.
  if (targetNode !== null && !selection.has(targetNode.id)) {
    const inside = [...selection].some((address) => address.startsWith(`${targetNode.id}/`));
    if (!inside) selection = new Set(ids);
  }
}

function onnodedrag({ targetNode, nodes: dragged }: DragEvent) {
  const lead = targetNode ?? dragged[0];
  if (lead === undefined) return;
  const offset = snapOffset(lead);
  guides = offset.guides;
  if (offset.dx === 0 && offset.dy === 0) return;
  const ids = new Set(dragged.map(({ id }) => id));
  nodes = nodes.map((node) =>
    ids.has(node.id)
      ? { ...node, position: { x: node.position.x + offset.dx, y: node.position.y + offset.dy } }
      : node,
  );
}

function onnodedragstop({ targetNode, nodes: dragged }: DragEvent) {
  guides = [];
  const lead = targetNode ?? dragged[0];
  if (lead === undefined) return;
  const { dx, dy } = snapOffset(lead);
  anchors = [];
  const moves = dragged.map(({ id, position }) => ({ id, x: position.x + dx, y: position.y + dy }));
  const command = moveCommand(view, moves);
  if (command === null || !dispatch(command)) {
    // Nothing is stored: show the projection again instead of the dragged preview.
    nodes = projected;
  }
}

// --- Resize ----------------------------------------------------------------

function onresize(values: Partial<Block>) {
  if (resizable !== undefined) preview = { id: resizable.id, values };
}

function onresizeend(values: Partial<Block>) {
  preview = null;
  if (resizable === undefined || locked) return;
  const block = resizable;
  // A resize that changes no stored value is no command, like a drag that ends where it began.
  const changes = Object.entries(values).some(
    ([member, value]) => block[member as keyof Block] !== value,
  );
  if (changes) dispatch(resizeCommand(block, values));
}

function onresizecancel() {
  preview = null;
}

// --- Keys ------------------------------------------------------------------

function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

const ARROWS: { readonly [key: string]: readonly [number, number] } = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const MODE_KEYS: { readonly [key: string]: ResizeMode } = { 1: "scale", 2: "box", 3: "stretch" };

/** Run the action a key stands for; `false` when the key means nothing here. */
function handleKey(event: KeyboardEvent): boolean {
  const { key, shiftKey } = event;
  if (event.altKey) return false;
  if (!onCanvas(event.target)) return false;
  // Arrows move between a toolbar's buttons there.
  if (event.target instanceof Element && event.target.closest('[role="toolbar"]') !== null) {
    if (key.startsWith("Arrow") || key === "Home" || key === "End") return false;
  }
  if (event.ctrlKey || event.metaKey) {
    const action =
      event.code === "BracketRight"
        ? shiftKey
          ? "front"
          : "forward"
        : event.code === "BracketLeft"
          ? shiftKey
            ? "back"
            : "backward"
          : undefined;
    if (action === undefined) return false;
    const command = zOrderCommand(view, selectedBlocks(), action);
    if (command !== null) dispatch(command);
    return true;
  }
  const arrow = ARROWS[key];
  if (arrow !== undefined) {
    const ids = selectedBlocks();
    if (ids.length === 0 || locked) return false;
    const step = shiftKey ? LARGE_STEP : 1;
    const command = nudgeCommand(view, ids, arrow[0] * step, arrow[1] * step);
    if (command !== null) dispatch(command);
    return true;
  }
  const chosen = MODE_KEYS[key];
  if (chosen !== undefined) {
    // A locked canvas offers no resize, so its mode is not chosen either.
    if (locked) return false;
    mode = chosen;
    return true;
  }
  switch (key) {
    case "Delete":
    case "Backspace": {
      if (selection.size === 0) return false;
      const command = removeCommand(view, selection);
      if ("refused" in command) hint = command.refused;
      else if (dispatch(command)) selection = new Set();
      return true;
    }
    case "Enter":
    case " ": {
      // The focused block, reached by Tab, is selected as a click on its background would.
      const node =
        event.target instanceof Element
          ? event.target.closest(".svelte-flow__node[data-id]")
          : null;
      const id = node?.getAttribute("data-id");
      if (id == null) return false;
      selection = click(selection, id, additive(event));
      return true;
    }
    case "+":
      toolbar?.zoomIn();
      return true;
    case "-":
      toolbar?.zoomOut();
      return true;
    case "0":
      if (hasBlocks()) toolbar?.fit();
      return true;
    case "l":
    case "L":
      locked = !locked;
      return true;
    case "Escape":
      selection = new Set();
      return true;
    default:
      return false;
  }
}

/** The canvas's root element, the arranger: the flow, its toolbars and the nodes. */
let root: HTMLElement | undefined = $state();

/**
 * Whether a key belongs to the canvas: focus is on the arranger or inside it
 * (a node, a toolbar). Keys pressed anywhere else on the page, the page body
 * and the inspector included, are not the canvas's.
 */
function onCanvas(target: EventTarget | null): boolean {
  return target instanceof Node && root !== undefined && root.contains(target);
}

/** What the canvas shows: the viewport and the arranger's size in screen pixels. */
export function visible(): Visible {
  return {
    x: viewport.x,
    y: viewport.y,
    zoom: viewport.zoom,
    width: root?.clientWidth ?? 0,
    height: root?.clientHeight ?? 0,
  };
}

/** Give the arranger the focus, so the canvas keys apply. */
export function focus(): void {
  root?.focus({ preventScroll: true });
}

/**
 * A press anywhere on the canvas gives it the focus, unless the focus is
 * already inside it: the pane is no focusable element, and WebKit focuses
 * no button on a click.
 */
function onpointerdowncapture() {
  if (root !== undefined && !root.contains(document.activeElement)) focus();
}

/**
 * The canvas keys, read before Svelte Flow sees them, so its own handling
 * of the same keys (arrow moves of selected nodes, Enter and Escape on a
 * focused node) never applies a second time. Undo and redo are the page's,
 * not the canvas's.
 */
function onkeydowncapture(event: KeyboardEvent) {
  if (event.defaultPrevented || isTextInput(event.target)) return;
  if (!handleKey(event)) return;
  event.preventDefault();
  event.stopPropagation();
}
</script>

<svelte:window {onkeydowncapture} />

<!--
  The arranger is one tab stop with keys of its own, an ARIA application;
  Svelte counts that role as non-interactive, so its tab stop is allowed here.
-->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="canvas"
  role="application"
  aria-label="Arranger"
  tabindex="0"
  bind:this={root}
  {onpointerdowncapture}
  {@attach shiftWheel}
>
  {#await fontLoaded}
    <p class="font-state">Loading the font…</p>
  {:then}
    <SvelteFlow
      bind:nodes
      bind:viewport
      edges={[]}
      {nodeTypes}
      minZoom={0.05}
      {translateExtent}
      {...snapping}
      elevateNodesOnSelect={false}
      onlyRenderVisibleElements={Object.keys(view.blocks).length > CULLING_THRESHOLD}
      deleteKey={NO_KEYS}
      selectionKey="Shift"
      selectionMode={SelectionMode.Full}
      selectionOnDrag={marquee}
      panOnDrag={!marquee}
      panOnScroll
      panOnScrollSpeed={PAN_SPEED}
      zoomOnScroll={false}
      zoomActivationKey={ZOOM_KEYS}
      nodesDraggable={!locked}
      nodesConnectable={false}
      proOptions={{ hideAttribution: true }}
      {onnodeclick}
      {onpaneclick}
      {onselectionend}
      {onnodedragstart}
      {onnodedrag}
      {onnodedragstop}
    >
      {#if resizable !== undefined && resizableBox !== undefined}
        <ResizeToolbar
          block={resizable}
          box={resizableBox}
          settings={view.settings}
          {metrics}
          zoom={viewport.zoom}
          {locked}
          bind:mode
          {onresize}
          {onresizeend}
          {onresizecancel}
        />
      {/if}
      <SnapGuides {guides} zoom={viewport.zoom} />
      <CanvasToolbar bind:this={toolbar} bind:locked bind:marquee />
    </SvelteFlow>
  {:catch error}
    <p class="font-state" role="status">
      The canvas cannot be shown: its font, DejaVu Sans, did not load ({error instanceof Error
        ? error.message
        : String(error)}).
    </p>
  {/await}
  <p class="hint" data-testid="hint" role="status" aria-live="polite">{hint}</p>
</div>

<style>
  .canvas {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .canvas:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: -2px;
  }

  .font-state {
    margin: 0;
    padding: 0.5rem;
    color: #555;
  }

  /* Beside the controls panel (15 px margin, 26 px wide). */
  .hint {
    position: absolute;
    left: 3.5rem;
    bottom: 0.5rem;
    margin: 0;
    font-size: 0.85rem;
    color: #8a1c1c;
    pointer-events: none;
  }

  /*
   * The bundled DejaVu Sans 2.37, under a family name of its own, so a system
   * copy of DejaVu Sans, whose outlines may differ, never stands in for it.
   */
  @font-face {
    font-family: "TiLiE DejaVu Sans";
    src: url("@timetoalign/timeskeleton/fonts/DejaVuSans.ttf") format("truetype");
    font-display: block;
  }

  /*
   * The block nodes' drawings. They are styled from here, so `BlockNode` has
   * no style of its own and Svelte adds no scoping class to a drawn element.
   */
  .canvas :global {
    /*
     * Handles and guides sit in the viewport's front layer, which shares a
     * stacking context with the nodes; a node's z-index is its rank among
     * the blocks, so the overlay stacks above any rank.
     */
    .tilie-overlay {
      position: absolute;
      top: 0;
      left: 0;
      z-index: 2147483000;
    }

    .tilie-block svg {
      display: block;
      font-family: "TiLiE DejaVu Sans";
      overflow: visible;
      font-kerning: none;
      font-variant-ligatures: none;
      /*
       * Unhinted advances: Chromium otherwise lays small SVG text out with
       * hinted widths (11 px "Phrase" 35.57 instead of the advance table's
       * 37.37), so names would not fill the widths the drawing measured.
       */
      text-rendering: geometricPrecision;
    }

    /*
     * After a marquee, Svelte Flow lays a rectangle over the selected blocks
     * (its node selection, `.svelte-flow__selection-wrapper`; the marquee
     * drawn during the gesture is another element) that would take their
     * clicks, so a click could neither pick an element nor toggle a block. A
     * selected block is dragged by itself instead, which moves every selected
     * block, so the rectangle is not shown.
     */
    .svelte-flow__selection-wrapper {
      display: none;
    }

    /* An element below a selected one: quieter than the selection itself. */
    .tilie-block [data-affected] {
      filter: drop-shadow(0 0 1px #9cc8ff);
    }

    .tilie-block [data-selected] {
      filter: drop-shadow(0 0 1.5px #0a84ff) drop-shadow(0 0 1.5px #0a84ff);
    }

    .tilie-block[data-contains-selection] {
      outline: 2px dashed #0a84ff;
      outline-offset: 2px;
    }
  }

  .canvas :global(.svelte-flow__node-block.selected) {
    outline: 2px solid #0a84ff;
    outline-offset: 2px;
  }

  .canvas :global(.svelte-flow__node-block:focus-visible) {
    outline: 2px solid #0a84ff;
    outline-offset: 4px;
  }
</style>
