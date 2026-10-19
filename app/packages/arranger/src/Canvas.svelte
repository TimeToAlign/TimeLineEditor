<script lang="ts">
import type { Address, Command, Store } from "@timetoalign/tilie-core";
import type { FontMetrics } from "@timetoalign/timeskeleton";
import type { Viewport } from "@xyflow/svelte";
import { SelectionMode, SvelteFlow } from "@xyflow/svelte";
import "@xyflow/svelte/dist/style.css";
import "./canvas.css";
import { untrack } from "svelte";
import { MediaQuery } from "svelte/reactivity";
import BlockNode from "./BlockNode.svelte";
import { BlockDrag } from "./blockDrag.ts";
import CanvasToolbar from "./CanvasToolbar.svelte";
import type { Visible } from "./commands.ts";
import type { Level } from "./containers.ts";
import { rulesOf } from "./containers.ts";
import type { Editing } from "./editing.ts";
import { EditorFocus } from "./editorFocus.svelte.ts";
import { CLICK_DISTANCE, GestureSlot } from "./gesture.ts";
import { CanvasPointer } from "./gestures/canvas.ts";
import { PAN_SPEED, shiftWheel } from "./gestures/wheel.ts";
import type { KeyContext } from "./keys.ts";
import { handleKey, inToolbar, isTextInput, within } from "./keys.ts";
import type { LiveStore } from "./liveStore.svelte.ts";
import { setNodeActions } from "./nodeActions.ts";
import { CanvasNodes } from "./nodes.svelte.ts";
import type { LivePlacement } from "./project.ts";
import ResizeToolbar from "./ResizeToolbar.svelte";
import type { ResizeMode } from "./resize.ts";
import SnapGuides from "./SnapGuides.svelte";
import type { Selection } from "./selection.ts";
import { DONE, openable, RECENTRE, resizableOf } from "./selectionRules.ts";
import type { Guide } from "./snap.ts";

interface Props {
  /** The workspace store, read through `liveStore`; replacing it shows the new workspace, fitted into view. */
  live: LiveStore;
  metrics: FontMetrics;
  /** The selected addresses: block ids and `<block>/<element address>`. */
  selection: Selection;
  /** While locked, nothing is moved: dragging a block pans the canvas instead. */
  locked: boolean;
  /** A read-only canvas writes nothing: it selects, pans and zooms. */
  readonly?: boolean;
  mode: ResizeMode;
  viewport: Viewport;
  /**
   * Called with the placement of the block a gesture changes, as the canvas
   * shows it before release, with the drawing its node shows, whenever it
   * changes; with `null` once the gesture ends. Only a gesture on a single
   * block or inside one reports one.
   */
  onlive?: (placement: LivePlacement | null) => void;
}

let {
  live,
  metrics,
  selection = $bindable(),
  locked = $bindable(),
  readonly = false,
  mode = $bindable(),
  viewport = $bindable(),
  onlive,
}: Props = $props();

/**
 * This canvas's own id for Svelte Flow, which suffixes the ids of its
 * accessible descriptions with it, so two canvases on one page share none.
 */
const flowId = $props.id();

/** Above this many blocks only the blocks in view are mounted. */
const CULLING_THRESHOLD = 500;
const nodeTypes = { block: BlockNode };
/**
 * Delete, Backspace and Shift+click are the canvas's own (`keys.ts`,
 * `click`), so Svelte Flow binds neither; an empty list, as Svelte Flow turns
 * `null` into an empty shortcut its shortcut library warns about.
 */
const NO_KEYS: string[] = [];
/** The wheel pans; with Ctrl or Cmd held, or a touchpad pinch (a wheel with `ctrlKey`), it zooms. */
const ZOOM_KEYS = ["Control", "Meta"];
const translateExtent: [[number, number], [number, number]] = [
  [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
];

const store: Store = $derived(live.store);
const view = $derived(live.view);
/** The innermost open editor, `null` on the arranger. */
const editing: Editing | null = $derived.by(() => {
  const innermost = live.editing.at(-1);
  return innermost === undefined ? null : { target: innermost.target, kind: innermost.kind };
});
const level: Level = $derived(editing === null ? "arranger" : editing.kind);
/** What the canvas allows now: the one answer every key and pointer path asks. */
const rules = $derived(rulesOf(editing, { locked, readonly }));

let toolbar: ReturnType<typeof CanvasToolbar> | undefined = $state();
let root: HTMLElement | undefined = $state();
let guides: readonly Guide[] = $state.raw([]);
let marquee = $state(false);
/** The last refusal, announced in the status region. */
let hint = $state("");
/** The gesture in progress inside a drawing or on a resize handle, which Escape ends. */
const gestures = new GestureSlot();
const reducedMotion = new MediaQuery("(prefers-reduced-motion: reduce)");

const nodes = new CanvasNodes(() => ({ view, selection, metrics, editing }));

const editorFocus = new EditorFocus({
  store: () => store,
  viewport: () => viewport,
  show: (next, duration) => toolbar?.setViewport(next, duration),
  nodes: () => nodes.byId,
  metrics: () => metrics,
  root: () => root,
  reducedMotion: () => reducedMotion.current,
});

const drag = new BlockDrag({
  view: () => view,
  metrics: () => metrics,
  zoom: () => viewport.zoom,
  projected: () => nodes.projected,
  shown: () => nodes.nodes,
  show: (next) => (nodes.nodes = next),
  selection: () => selection,
  select: (next) => (selection = next),
  guides: (next) => (guides = next),
  dispatch,
  report: (placement) => onlive?.(placement),
});

/** Show the canvas at `next`; see `CanvasToolbar.setViewport`. */
export function setViewport(next: Viewport): void {
  editorFocus.moved();
  toolbar?.setViewport(next);
}

/** What the canvas shows: the viewport and the arranger's size in screen pixels. */
export function visible(): Visible {
  const { x, y, zoom } = viewport;
  return { x, y, zoom, width: root?.clientWidth ?? 0, height: root?.clientHeight ?? 0 };
}

/** Give the arranger the focus, so the canvas keys apply. */
export function focus(): void {
  root?.focus({ preventScroll: true });
}

/**
 * The canvas is mounted only once the bundled face has loaded: `draw`
 * measures text with its advance table, and Chromium keeps the layout of SVG
 * text drawn before a face arrives. Without a font loading API (jsdom) there
 * is nothing to wait for.
 */
const FACE = '16px "TiLiE DejaVu Sans"';
const fontLoaded: Promise<void> | true =
  typeof document === "undefined" || !("fonts" in document)
    ? true
    : document.fonts.load(FACE).then((faces) => {
        if (faces.length === 0) throw new Error("the face is not declared");
      });

// A newly opened workspace is fitted into view once the flow exists, and only then: an empty
// one is not, since Svelte Flow would hold the fit until the first block appears.
$effect(() => {
  const current = store;
  const flow = toolbar;
  untrack(() => {
    if (flow !== undefined && Object.keys(current.view.blocks).length > 0) flow.fit();
  });
});

function dispatch(command: unknown): boolean {
  const error = store.dispatch(command);
  hint = error === null ? "" : error.message;
  return error === null;
}

function openEditor(target: Address): void {
  const error = store.open(target);
  hint = error === null ? "" : error.message;
}

setNodeActions({
  dispatch(command: Command) {
    dispatch(command);
  },
  select(address) {
    selection = new Set([address]);
  },
  preview(block, shown) {
    if (shown !== null) nodes.preview = { id: block, view: shown.view };
    else if (nodes.preview?.id === block) nodes.preview = null;
    onlive?.(nodes.live(null));
  },
  get metrics() {
    return metrics;
  },
  view: () => view,
  zoom: () => viewport.zoom,
  rules: () => rules,
  reducedMotion: () => reducedMotion.current,
  gestures,
});

/** What the resize toolbar acts on (`resizableOf`). */
const resizable = $derived(resizableOf(selection, nodes.byId, editing, level));

/** The resized box on the canvas as shown: the block's node, or its frame or card, previewed. */
const resizableBounds = $derived(
  resizable === undefined ? undefined : nodes.boundsOf(resizable.block, resizable.box),
);

/** Svelte Flow's own grid snapping, on while the workspace snaps to its grid. */
const snapping: { snapGrid?: [number, number] } = $derived(
  view.settings.grid.snap ? { snapGrid: [view.settings.grid.size, view.settings.grid.size] } : {},
);

/** The canvas's own pointer: clicks, the marquee, a double-click and a double tap. */
const pointer = new CanvasPointer({
  view: () => view,
  metrics: () => metrics,
  nodes,
  selection: () => selection,
  select: (next) => (selection = next),
  editing: () => editing,
  rules: () => rules,
  marquee: () => marquee,
  toCanvas: (client) => toolbar?.toCanvas(client),
  act(action) {
    if (action === DONE) store.done();
    else if (action === RECENTRE) {
      if (editing !== null) void editorFocus.focusOn(editing.target);
    } else if (rules.open) openEditor(action);
  },
});

/** A press records itself and gives the canvas the focus, unless the focus is already inside it. */
function onpointerdowncapture(event: PointerEvent) {
  pointer.pointerdowncapture(event);
  if (root !== undefined && !root.contains(document.activeElement)) focus();
}

// --- Keys ------------------------------------------------------------------

/** The canvas as the key `event` acts on it. */
function keyContext(event: KeyboardEvent): KeyContext {
  return {
    view,
    selection,
    editing,
    rules,
    metrics,
    editors: live.editing.length,
    select: (next) => (selection = next),
    dispatch,
    refuse: (message) => (hint = message),
    setMode: (next) => (mode = next),
    toggleLock: () => (locked = !locked),
    zoomIn: () => toolbar?.zoomIn(),
    zoomOut: () => toolbar?.zoomOut(),
    fit: () => toolbar?.fit(),
    abortGesture: () => gestures.abort(),
    done: () => store.done(),
    open: openEditor,
    openable: () => openable(view, selection, nodes.byId, editing),
    // The focused block, reached by Tab, is selected as a click on its background would.
    pressed: () => pointer.pressedBy(event),
  };
}

/**
 * The canvas keys, read before Svelte Flow sees them, so its own handling of
 * the same keys never applies a second time; only keys whose target lies in
 * the canvas are its own. Undo and redo are the page's.
 */
function onkeydowncapture(event: KeyboardEvent) {
  if (event.defaultPrevented || isTextInput(event.target)) return;
  if (!within(root, event.target) || inToolbar(event)) return;
  if (!handleKey(keyContext(event), event)) return;
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
  class="tilie-canvas"
  role="application"
  aria-label="Arranger"
  tabindex="0"
  bind:this={root}
  style:--tilie-zoom={viewport.zoom}
  bind:clientWidth={null, () => editorFocus.resized()}
  bind:clientHeight={null, () => editorFocus.resized()}
  {onpointerdowncapture}
  onpointerupcapture={pointer.pointerupcapture}
  ondblclick={pointer.dblclick}
  {@attach shiftWheel((dx) => setViewport({ ...viewport, x: viewport.x + dx }))}
>
  {#await fontLoaded}
    <p class="tilie-font-state">Loading the font…</p>
  {:then}
    <SvelteFlow
      id={flowId}
      bind:nodes={nodes.nodes}
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
      multiSelectionKey={NO_KEYS}
      paneClickDistance={CLICK_DISTANCE}
      selectionMode={SelectionMode.Full}
      selectionOnDrag={marquee}
      panOnDrag={!marquee}
      panOnScroll
      panOnScrollSpeed={PAN_SPEED}
      zoomOnScroll={false}
      zoomOnDoubleClick={false}
      zoomActivationKey={ZOOM_KEYS}
      nodesDraggable={rules.move}
      nodesConnectable={false}
      proOptions={{ hideAttribution: true }}
      onnodeclick={pointer.nodeclick}
      onpaneclick={pointer.paneclick}
      onselectionend={pointer.selectionend}
      onnodedragstart={(event) => drag.start(event)}
      onnodedrag={(event) => drag.drag(event)}
      onnodedragstop={(event) => drag.stop(event)}
    >
      {#if resizable !== undefined && resizableBounds !== undefined}
        {@const block = view.blocks[resizable.block]}
        {#if block !== undefined}
          <ResizeToolbar
            {block}
            box={resizable.box}
            {level}
            bounds={resizableBounds}
            zoom={viewport.zoom}
            locked={!rules.resize}
            bind:mode
          />
        {/if}
      {/if}
      <SnapGuides {guides} zoom={viewport.zoom} />
      <CanvasToolbar bind:this={toolbar} bind:locked bind:marquee lockable={rules.lock} />
    </SvelteFlow>
  {:catch error}
    <p class="tilie-font-state" role="status">
      The canvas cannot be shown: its font, DejaVu Sans, did not load ({error instanceof Error
        ? error.message
        : String(error)}).
    </p>
  {/await}
  <p class="tilie-hint" data-testid="hint" role="status" aria-live="polite">{hint}</p>
</div>
