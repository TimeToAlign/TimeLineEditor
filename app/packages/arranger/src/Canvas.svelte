<script lang="ts">
import type {
  Address,
  Command,
  Granularity,
  Manifest,
  MeasureKnots,
  Pin,
  Store,
} from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import type { FontMetrics } from "@timetoalign/timetoshare";
import type { Viewport } from "@xyflow/svelte";
import { SelectionMode, SvelteFlow } from "@xyflow/svelte";
import "@xyflow/svelte/dist/style.css";
import "./canvas.css";
import { untrack } from "svelte";
import { MediaQuery } from "svelte/reactivity";
import BlockNode from "./BlockNode.svelte";
import { BlockDrag, type NodeDrag } from "./blockDrag.ts";
import CanvasToolbar from "./CanvasToolbar.svelte";
import CoordinateFlag from "./CoordinateFlag.svelte";
import CoordinateMarks from "./CoordinateMarks.svelte";
import type { Visible } from "./commands.ts";
import type { Level } from "./containers.ts";
import { levelOf, rulesOf } from "./containers.ts";
import type { KnotsOf, MarkPlace, PlacedMarks } from "./coordinates.ts";
import {
  FrameCoalescer,
  MeasureKnotsSource,
  pinnedPlace,
  placeText,
  readingAt,
} from "./coordinates.ts";
import type { Editing } from "./editing.ts";
import { EditorFocus } from "./editorFocus.svelte.ts";
import { CLICK_DISTANCE, GestureSlot, listen, type Point } from "./gesture.ts";
import { CanvasPointer } from "./gestures/canvas.ts";
import { PAN_SPEED, shiftWheel } from "./gestures/wheel.ts";
import type { KeyContext } from "./keys.ts";
import { handleKey, inToolbar, isTextInput, within } from "./keys.ts";
import type { LiveStore } from "./liveStore.svelte.ts";
import type { LivePlacement } from "./node.ts";
import { setNodeActions } from "./nodeActions.ts";
import { CanvasNodes } from "./nodes.svelte.ts";
import { pickable } from "./picking.ts";
import ResizeToolbar from "./ResizeToolbar.svelte";
import type { ResizeMode } from "./resize.ts";
import SnapGuides from "./SnapGuides.svelte";
import { type Selection, selectionOf } from "./selection.ts";
import { DONE, hitAt, openable, RECENTRE, resizableOf } from "./selectionRules.ts";
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
  /**
   * How finely "Show coordinates" picks positions and shows floats; the
   * workspace's granularity setting when not given.
   */
  granularity?: Granularity;
  /**
   * The pinned timestamp: an unnamed one is marked with its wedge and its
   * cross-section line at its position, which follow a replaced pin; a
   * named one is drawn by its block's drawing, so nothing more is marked.
   */
  pinned?: Pin | null;
  /**
   * While "Show coordinates" is on, called with the pin a click on a line
   * or a map makes, and with `null` on any other click on the canvas;
   * called with `null` when "Show coordinates" is turned off.
   */
  oncoordinatepin?: (pin: Pin | null) => void;
  /**
   * The expanded MeasureMaps of a manifest, given its text (the server's
   * measure-maps route), or `unsupported` when the server cannot expand
   * them; without it (`undefined`: no server), until it answers, or when
   * it fails, measure views say why their rows are missing.
   */
  measureMaps?:
    | ((manifest: string) => Promise<readonly MeasureKnots[] | "unsupported">)
    | undefined;
  /**
   * While set, the canvas picks instead of selecting: a press on a
   * timeline (its line, card, band or a part of it) or a region
   * (`pickable`) calls it with `{block, id}` and does nothing else, a
   * press on anything else in a block does nothing, Escape is left to the
   * caller, and the pointer is a crosshair; `null` (the default) selects.
   */
  picking?: ((address: Address) => void) | null;
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
  granularity,
  pinned = null,
  oncoordinatepin,
  measureMaps,
  picking = null,
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
const level: Level = $derived(levelOf(editing));
/** What the canvas allows now: the one answer every key and pointer path asks. */
const rules = $derived(rulesOf(editing, { locked, readonly }));

let toolbar: ReturnType<typeof CanvasToolbar> | undefined = $state();
let root: HTMLElement | undefined = $state();
let guides: readonly Guide[] = $state.raw([]);
let marquee = $state(false);
/**
 * Whether "Show coordinates" is on: hovering a line shows its coordinate
 * and its maps' values, a click pins, and named timestamps take no pointer.
 */
let coordinates = $state(false);
/** The pointer over the canvas, in pixels from its top-left corner; `null` while it is elsewhere. */
let hover: Point | null = $state.raw(null);
/** Bumped when a manifest's expanded MeasureMaps arrive, so the reading is made again with them. */
let knotsArrived = $state(0);
/** The last refusal, announced in the status region. */
let hint = $state("");
/**
 * Whether boxes are being moved: a block dragged by Svelte Flow, or a
 * gesture inside a drawing that moves an item, a held card or a band. The
 * resize toolbar is hidden meanwhile, so no handle is left behind at the
 * bounds the move started from.
 */
let moving = $state(false);
/** The gesture in progress inside a drawing or on a resize handle, which Escape ends. */
const gestures = new GestureSlot((next) => (moving = next));
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

/**
 * The block drag under way: the blocks Svelte Flow drags, and the stop of
 * the window listeners that hear its press end; `null` while none is.
 */
let blockDrag: { readonly blocks: readonly string[]; readonly unlisten: () => void } | null = null;

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

/**
 * Svelte Flow has started dragging the blocks of `event`: the resize toolbar
 * is hidden, and the end of the press is heard on the window, in the capture
 * phase, so no handler stops it from arriving.
 */
function startBlockDrag({ nodes: dragged }: NodeDrag): void {
  endBlockDrag();
  const capture = { capture: true };
  const stops = ["pointerup", "pointercancel"].map((type) =>
    listen(window, type, endBlockDrag, capture),
  );
  blockDrag = {
    blocks: dragged.map(({ id }) => id),
    unlisten: () => {
      for (const stop of stops) stop();
    },
  };
  moving = true;
}

/**
 * The block drag has ended, once: the resize toolbar returns, the snap
 * guides and the live placement are withdrawn. Svelte Flow says so with
 * `onnodedragstop`, except when it aborts the drag itself (a second touch,
 * the dragged node removed); the press's end and a dragged block leaving
 * the view therefore end it too. Every press ends with a `pointerup` or a
 * `pointercancel`, the touch's included, and a stop that follows it still
 * stores the move.
 */
function endBlockDrag(): void {
  if (blockDrag === null) return;
  blockDrag.unlisten();
  blockDrag = null;
  moving = false;
  guides = [];
  onlive?.(null);
}

// A dragged block gone from the view ends its drag: Svelte Flow aborts it without a stop.
$effect(() => {
  const { blocks } = view;
  if (moving && blockDrag?.blocks.some((id) => blocks[id] === undefined)) untrack(endBlockDrag);
});

// Unmounted mid-drag, the canvas leaves no listener on the window.
$effect(() => endBlockDrag);

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
 * The bundled faces the drawing's text is set in, as `canvas.css` declares
 * them: DejaVu Sans, then Noto Music for what DejaVu Sans does not map.
 */
const FACES = ["TiLiE DejaVu Sans", "TiLiE Noto Music"] as const;

/**
 * The canvas is mounted only once both bundled faces have loaded: `draw`
 * measures text with their advance table, and Chromium keeps the layout of
 * SVG text drawn before a face arrives. Without a font loading API (jsdom)
 * there is nothing to wait for.
 */
const fontLoaded: Promise<void> | true =
  typeof document === "undefined" || !("fonts" in document)
    ? true
    : Promise.all(
        FACES.map((family) =>
          document.fonts.load(`16px "${family}"`).then((faces) => {
            if (faces.length === 0) throw new Error(`the face "${family}" is not declared`);
          }),
        ),
      ).then(() => undefined);

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
    selection = selectionOf([address]);
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
  coordinates: () => coordinates,
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

// --- Show coordinates -------------------------------------------------------

/** Pointer moves, one reading per animation frame. */
const frames = new FrameCoalescer<Point | null>((point) => (hover = point));

const knots = $derived(
  measureMaps === undefined ? undefined : new MeasureKnotsSource(measureMaps, () => knotsArrived++),
);

/**
 * The expanded MeasureMaps of `manifest` as this canvas's readings take
 * them: asked of `measureMaps` once per manifest object and kept, `undefined`
 * for a manifest without MeasureMaps or without `measureMaps`. Read in a
 * reaction, it is read again when an answer arrives.
 */
export function knotsOf(manifest: Manifest): ReturnType<KnotsOf> {
  void knotsArrived;
  return knots?.knotsOf(manifest);
}

/** The reading of the canvas pixel `point` (from the canvas's top-left corner), or `null`. */
function readingOf(point: Point) {
  const { x, y, zoom } = viewport;
  return readingAt(
    nodes.nodes,
    { x: (point.x - x) / zoom, y: (point.y - y) / zoom },
    {
      zoom,
      ratio: typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
      granularity: granularity ?? view.settings.granularity,
      knotsOf,
    },
  );
}

/** What the pointer reads now; nothing while boxes move or "Show coordinates" is off. */
const reading = $derived(!coordinates || moving || hover === null ? null : readingOf(hover));

/** What a screen reader hears when a click pins a timestamp; the moving flag is not announced. */
let announced = $state("");

/** The flag's place in canvas pixels, from the shown node of the read block. */
const flag = $derived.by(() => {
  const node = reading === null ? undefined : nodes.shown(reading.block);
  if (reading === null || node === undefined) return null;
  const { x, y, zoom } = viewport;
  const { scale } = node.data.block;
  const screen = (dx: number, dy: number) => ({
    x: x + (node.position.x + dx * scale) * zoom,
    y: y + (node.position.y + dy * scale) * zoom,
  });
  const at = screen(reading.at.x, reading.at.y);
  return { x: at.x, y: at.y, top: screen(reading.at.x, reading.top).y };
});

/** The pointer in canvas pixels from the canvas's top-left corner. */
function pixelOf(event: MouseEvent): Point | null {
  const box = root?.getBoundingClientRect();
  return box === undefined ? null : { x: event.clientX - box.left, y: event.clientY - box.top };
}

/** A move with no button held is read; one dragging something reads nothing. */
function onpointermove(event: PointerEvent) {
  if (!coordinates) return;
  frames.push(event.buttons === 0 ? pixelOf(event) : null);
}

function onpointerleave() {
  frames.cancel();
  hover = null;
}

/** Where the last primary press on the canvas began, in client pixels; `null` after a button's. */
let pinPress: Point | null = null;

/** A press records where it began, for `pinOnRelease`. */
function pinOnPress(event: PointerEvent) {
  const onButton = event.target instanceof Element && event.target.closest("button") !== null;
  pinPress =
    event.isPrimary && event.button === 0 && !onButton
      ? { x: event.clientX, y: event.clientY }
      : null;
}

/**
 * While "Show coordinates" is on, a click on the canvas (a primary press
 * released within the click distance) pins the timestamp of the hovered
 * line or map, read at the release itself, and clears the pin anywhere
 * else; a press on a button (the toolbars) does neither, and with
 * "Show coordinates" off a click pins nothing.
 */
function pinOnRelease(event: PointerEvent) {
  const press = pinPress;
  pinPress = null;
  if (!coordinates || press === null || !event.isPrimary) return;
  if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > CLICK_DISTANCE) return;
  const point = pixelOf(event);
  const read = point === null ? null : readingOf(point);
  pinnedLine = read?.hit.key ?? null;
  announced = read === null ? "" : `Pinned ${placeText(read.pin.timestamp)}`;
  oncoordinatepin?.(read?.pin ?? null);
}

/** Turn "Show coordinates" on or off; turned off, the pin is cleared. */
function setCoordinates(next: boolean): void {
  if (next === coordinates) return;
  coordinates = next;
  if (next) return;
  frames.cancel();
  hover = null;
  announced = "";
  oncoordinatepin?.(null);
}

/** The line a click last pinned on, so a pinned timestamp stays marked on that card's line. */
let pinnedLine: string | null = $state(null);

/** The node of block `id` as Svelte Flow shows it now, a dragged block's at its dragged place. */
function shownNode(id: string) {
  return nodes.nodes.find((node) => node.id === id);
}

/**
 * The marks drawn: the pinned unnamed timestamp's (`pinnedPlace`), then
 * the hovered position's on the hovered line.
 */
const marks: readonly PlacedMarks[] = $derived.by(() => {
  const found: PlacedMarks[] = [];
  const mark = (
    kind: PlacedMarks["kind"],
    block: string,
    place: (drawing: Drawing) => MarkPlace | null,
  ) => {
    const node = shownNode(block);
    const at = node === undefined ? null : place(node.data.drawing);
    if (node === undefined || at === null) return;
    const { drawing, block: shown } = node.data;
    found.push({ kind, ...at, drawing, origin: node.position, scale: shown.scale });
  };
  if (pinned !== null && pinned.named === null) {
    const pin = pinned;
    mark("pin", pin.spec.block, (drawing) => pinnedPlace(drawing, pin, pinnedLine));
  }
  if (reading !== null) {
    const { hit, at } = reading;
    mark("hover", reading.block, () => ({ key: hit.key, x: at.x }));
  }
  return found;
});

// Unmounted, the canvas leaves no frame waiting.
$effect(() => () => frames.cancel());

// --- Picking ---------------------------------------------------------------

/** Text the status line shows after a press that picks nothing. */
const NOT_PICKABLE = "Pick a timeline or a region; Escape cancels.";

/** Whether the current press was taken by picking, so its release and click do nothing more. */
let picked = false;

/**
 * While picking, a primary press on a block is taken before anything inside
 * sees it: a press on what `pickable` maps calls `picking` with it, any other
 * says what can be picked. Preventing the press keeps the mouse events that
 * would start Svelte Flow's drag or pan from following it.
 */
function pickOnPress(event: PointerEvent): boolean {
  picked = false;
  if (picking === null || !event.isPrimary || event.button !== 0) return false;
  const pressed = pointer.pressedAt(event.target, { x: event.clientX, y: event.clientY });
  if (pressed.node === undefined) return false;
  event.preventDefault();
  event.stopPropagation();
  picked = true;
  const hit = hitAt(pressed, editing);
  const address = hit === null ? null : pickable(hit, pressed.node.data.block.manifest);
  hint = address === null ? NOT_PICKABLE : "";
  if (address !== null) picking(address);
  return true;
}

/** The click that ends a press taken by picking reaches nothing inside the canvas. */
function onclickcapture(event: MouseEvent) {
  if (!picked) return;
  picked = false;
  event.stopPropagation();
}

/** A press records itself and gives the canvas the focus, unless the focus is already inside it. */
function onpointerdowncapture(event: PointerEvent) {
  if (pickOnPress(event)) return;
  pointer.pointerdowncapture(event);
  pinOnPress(event);
  if (root !== undefined && !root.contains(document.activeElement)) focus();
}

/** A release ends the canvas pointer's press and may pin a reading, before anything inside stops it. */
function onpointerupcapture(event: PointerEvent) {
  if (picked) return;
  pointer.pointerupcapture(event);
  pinOnRelease(event);
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
    toggleCoordinates: () => setCoordinates(!coordinates),
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
  if (picking !== null && event.key === "Escape") return;
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
  data-reading={reading === null ? undefined : ""}
  data-picking={picking === null ? undefined : ""}
  bind:clientWidth={null, () => editorFocus.resized()}
  bind:clientHeight={null, () => editorFocus.resized()}
  {onpointerdowncapture}
  {onpointerupcapture}
  {onclickcapture}
  ondblclick={pointer.dblclick}
  onpointermovecapture={onpointermove}
  {onpointerleave}
  {@attach shiftWheel((dx) => setViewport({ ...viewport, x: viewport.x + dx }))}
>
  {#await fontLoaded}
    <p class="tilie-font-state">Loading the fonts…</p>
  {:then}
    <SvelteFlow
      id={flowId}
      bind:nodes={nodes.nodes}
      bind:viewport
      edges={[]}
      {nodeTypes}
      minZoom={0.05}
      maxZoom={256}
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
      nodesDraggable={rules.move && picking === null}
      nodesConnectable={false}
      proOptions={{ hideAttribution: true }}
      onnodeclick={pointer.nodeclick}
      onpaneclick={pointer.paneclick}
      onselectionend={pointer.selectionend}
      onnodedragstart={(event) => {
        startBlockDrag(event);
        drag.start(event);
      }}
      onnodedrag={(event) => drag.drag(event)}
      onnodedragstop={(event) => {
        endBlockDrag();
        drag.stop(event);
      }}
    >
      {#if !moving && resizable !== undefined && resizableBounds !== undefined}
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
      <CoordinateMarks {marks} />
      <CanvasToolbar
        bind:this={toolbar}
        bind:locked
        bind:marquee
        bind:coordinates={() => coordinates, setCoordinates}
        lockable={rules.lock}
      />
    </SvelteFlow>
  {:catch error}
    <p class="tilie-font-state" role="status">
      The canvas cannot be shown: its fonts, DejaVu Sans and Noto Music, did not load ({error instanceof Error
        ? error.message
        : String(error)}).
    </p>
  {/await}
  {#if reading !== null && flag !== null}
    <CoordinateFlag
      pin={reading.pin}
      hovered={reading.row}
      x={flag.x}
      y={flag.y}
      top={flag.top}
      width={root?.clientWidth ?? 0}
    />
  {/if}
  <p class="tilie-hint" data-testid="hint" role="status" aria-live="polite">{hint}</p>
  <p class="tilie-announced" data-testid="coordinate-pinned" role="status">{announced}</p>
</div>
