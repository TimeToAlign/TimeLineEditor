<script lang="ts">
import type { Address, Command, Granularity, Manifest, Pin, Store } from "@timetoalign/tilie-core";
import { findTimeline } from "@timetoalign/tilie-core";
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
import type { KnotsOf, MarkPlace, MeasureMapsAnswer, PlacedMarks } from "./coordinates.ts";
import {
  FrameCoalescer,
  HIT_TOLERANCE,
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
import MatchFlag from "./MatchFlag.svelte";
import MatchOverlay from "./MatchOverlay.svelte";
import type { MatchHit, MatchLayer, MatchOverlayInput, Screen } from "./matches.ts";
import {
  matchFlag,
  matchHitAt,
  matchLinesOf,
  NO_MATCHES,
  overlayOf,
  staleAnchors,
  stampOverlay,
} from "./matches.ts";
import type { LivePlacement } from "./node.ts";
import { setNodeActions } from "./nodeActions.ts";
import { CanvasNodes } from "./nodes.svelte.ts";
import { pickable } from "./picking.ts";
import ResizeToolbar from "./ResizeToolbar.svelte";
import type { ResizeMode } from "./resize.ts";
import SnapGuides from "./SnapGuides.svelte";
import { type Selection, selectionOf } from "./selection.ts";
import type { Pressed } from "./selectionRules.ts";
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
   * measure-maps route), or why the server gave none (`MeasureMapsAnswer`);
   * without it (`undefined`: no server), until it answers, or when it
   * fails, measure views say why their rows are missing.
   */
  measureMaps?: ((manifest: string) => Promise<MeasureMapsAnswer>) | undefined;
  /**
   * While set, the canvas picks instead of selecting: a press on a
   * timeline (its line, card, band or a part of it) or a region
   * (`pickable`), or Enter or Space on such a focused element, calls it
   * with `{block, id}` and does nothing else; a press on anything else in
   * a block or on the pane, and Enter or Space on anything else, selects
   * nothing and says what can be picked; Escape is left to the caller, and
   * the pointer is a crosshair; `null` (the default) selects.
   */
  picking?: ((address: Address) => void) | null;
  /**
   * What "Show matches" draws: the anchor index of the loaded MatchClaim
   * table, over every block drawing a timeline it names, and the named
   * MatchStamps compared with it, whose alignment anchors no longer stated
   * are drawn red; `null` (the default) without a server or a loaded table,
   * when "Show matches" says so and nothing is drawn red.
   */
  matches?: MatchOverlayInput | null;
  /** The pinned potential MatchStamp, a set number of `matches.index`, drawn blue; `null` for none. */
  pinnedMatchStamp?: number | null;
  /**
   * While "Show matches" is on, called with the potential MatchStamp a click
   * on its line or connector pins, and with `null` on any other click on the
   * canvas; called with `null` when "Show matches" is turned off.
   */
  onmatchstamppin?: (set: number | null) => void;
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
  matches = null,
  pinnedMatchStamp = null,
  onmatchstamppin,
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
/**
 * Whether "Show matches" is on: the potential MatchStamps are drawn, hovering
 * one shows its flag, a click pins it, and named MatchStamps take no pointer.
 * It and "Show coordinates" take turns.
 */
let showMatches = $state(false);
/** The canvas's size in pixels: what "Show matches" draws follows the view. */
let canvasWidth = $state(0);
let canvasHeight = $state(0);
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
  matches: () => showMatches,
  staleAnchors: (block) => staleByBlock.get(block) ?? NONE_STALE,
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
  if (!coordinates && !showMatches) return;
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
  if (!(coordinates || showMatches) || press === null || !event.isPrimary) return;
  if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > CLICK_DISTANCE) return;
  const point = pixelOf(event);
  if (showMatches) {
    pinMatchStamp(point);
    return;
  }
  const read = point === null ? null : readingOf(point);
  pinnedLine = read?.hit.key ?? null;
  announced = read === null ? "" : `Pinned ${placeText(read.pin.timestamp)}`;
  oncoordinatepin?.(read?.pin ?? null);
}

/** Turn "Show coordinates" on or off, "Show matches" off with it on; turned off, the pin is cleared. */
function setCoordinates(next: boolean): void {
  if (next === coordinates) return;
  coordinates = next;
  if (next) {
    setMatches(false);
    return;
  }
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

// --- Show matches ----------------------------------------------------------

/** No anchor drawn red. */
const NONE_STALE: ReadonlySet<string> = new Set();

/** The device pixels per CSS pixel. */
function deviceRatio(): number {
  return typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
}

/** The canvas as seen, for what "Show matches" draws. */
const screen: Screen = $derived({
  x: viewport.x,
  y: viewport.y,
  zoom: viewport.zoom,
  width: canvasWidth,
  height: canvasHeight,
  ratio: deviceRatio(),
});

/**
 * The address keys of each block's alignment anchors the table no longer
 * states (`staleAnchors`): with a table, for every block whose manifest holds
 * a timeline the table names; none without one.
 */
const staleByBlock: ReadonlyMap<string, ReadonlySet<string>> = $derived.by(() => {
  if (matches === null) return new Map();
  const { index, named } = matches;
  const timelines = [...index.timelineNumbers.keys()];
  return new Map(
    Object.values(view.blocks).flatMap((block) => {
      if (!timelines.some((id) => findTimeline(block.manifest, id) !== undefined)) return [];
      const stale = staleAnchors(block.manifest, named);
      return stale.size === 0 ? [] : [[block.id, stale] as const];
    }),
  );
});

/** Per shown block drawing a timeline of the table, its lines and what it draws in view. */
const matchBlocks = $derived.by(() => {
  if (!showMatches || matches === null) return [];
  const { index } = matches;
  return nodes.nodes.flatMap((node) => {
    const { block, drawing } = node.data;
    const lines = matchLinesOf(drawing, index);
    if (lines.all.length === 0) return [];
    const placed = { origin: node.position, scale: block.scale };
    return [{ node, lines, placed, overlay: overlayOf(index, lines, placed, screen) }];
  });
});

/** The potential MatchStamp the pointer hovers, with the block it is hovered in; nothing while boxes move. */
const matchHover: { readonly block: string; readonly hit: MatchHit } | null = $derived.by(() =>
  !showMatches || moving || hover === null ? null : matchHitOf(hover),
);

/**
 * What the canvas pixel `point` hovers among the potential MatchStamps:
 * of every block's hit (`matchHitAt`, `HIT_TOLERANCE` device pixels around),
 * the nearest in device pixels, a later block on a tie; `null` where none.
 */
function matchHitOf(point: Point): { readonly block: string; readonly hit: MatchHit } | null {
  if (matches === null) return null;
  const { index } = matches;
  const { x, y, zoom } = viewport;
  const canvas = { x: (point.x - x) / zoom, y: (point.y - y) / zoom };
  let found: { block: string; hit: MatchHit; devicePixels: number } | null = null;
  for (const { node, lines, placed, overlay } of matchBlocks) {
    const devicePixels = zoom * placed.scale * screen.ratio;
    const local = {
      x: (canvas.x - placed.origin.x) / placed.scale,
      y: (canvas.y - placed.origin.y) / placed.scale,
    };
    const hit = matchHitAt(index, lines, overlay.connectors, local, HIT_TOLERANCE / devicePixels);
    if (
      hit !== null &&
      (found === null || hit.distance * devicePixels <= found.hit.distance * found.devicePixels)
    ) {
      found = { block: node.id, hit, devicePixels };
    }
  }
  return found === null ? null : { block: found.block, hit: found.hit };
}

/** What the overlay draws: per block the potential MatchStamps, the hovered and the pinned one. */
const matchLayers: readonly MatchLayer[] = $derived.by(() => {
  if (matches === null) return [];
  const { index } = matches;
  const hovered = matchHover?.hit.stamp ?? null;
  const pinned = pinnedMatchStamp;
  return matchBlocks.map(({ node, lines, placed, overlay }) => ({
    block: node.id,
    width: node.data.drawing.width,
    height: node.data.drawing.height,
    origin: placed.origin,
    scale: placed.scale,
    potential: overlay,
    hovered: hovered === null || hovered === pinned ? null : stampOverlay(index, lines, hovered),
    pinned: pinned === null ? null : stampOverlay(index, lines, pinned),
  }));
});

/** The hovered MatchStamp's flag: its groups and its place in canvas pixels. */
const matchFlagShown = $derived.by(() => {
  const hovered = matchHover;
  if (hovered === null || matches === null) return null;
  const shown = matchBlocks.find(({ node }) => node.id === hovered.block);
  if (shown === undefined) return null;
  const { node, lines, placed } = shown;
  const { x, y, zoom } = viewport;
  const screenOf = (dx: number, dy: number) => ({
    x: x + (placed.origin.x + dx * placed.scale) * zoom,
    y: y + (placed.origin.y + dy * placed.scale) * zoom,
  });
  const { at, stamp } = hovered.hit;
  const foot = screenOf(at.x, at.y);
  const decimals = (granularity ?? view.settings.granularity).decimals;
  return {
    groups: matchFlag(matches.index, node.data.block.manifest, lines, stamp, decimals),
    x: foot.x,
    y: foot.y,
    top: screenOf(at.x, at.top).y,
  };
});

/**
 * A click with "Show matches" on pins the potential MatchStamp under the
 * canvas pixel `point`, read at the release itself, and clears the pin
 * anywhere else; without a table it pins nothing.
 */
function pinMatchStamp(point: Point | null): void {
  if (matches === null) return;
  const read = point === null ? null : matchHitOf(point);
  announced = read === null ? "" : "Pinned a MatchStamp";
  onmatchstamppin?.(read?.hit.stamp ?? null);
}

/** Turn "Show matches" on or off, "Show coordinates" off with it on; turned off, the pin is cleared. */
function setMatches(next: boolean): void {
  if (next === showMatches) return;
  showMatches = next;
  if (next) {
    setCoordinates(false);
    return;
  }
  frames.cancel();
  hover = null;
  announced = "";
  onmatchstamppin?.(null);
}

// --- Picking ---------------------------------------------------------------

/** Text the status line shows after a press that picks nothing. */
const NOT_PICKABLE = "Pick a timeline or a region; Escape cancels.";

/** Whether the current press was taken by picking, so its release and click do nothing more. */
let picked = false;

/**
 * Pick what `pressed` hit: call `picking` with what `pickable` maps it to,
 * or say what can be picked (on the pane, the block itself and anything
 * else `pickable` maps to nothing).
 */
function pickAt(pressed: Pressed, pick: (address: Address) => void): void {
  const hit = hitAt(pressed, editing);
  const address =
    hit === null || pressed.node === undefined
      ? null
      : pickable(hit, pressed.node.data.block.manifest);
  hint = address === null ? NOT_PICKABLE : "";
  if (address !== null) pick(address);
}

/**
 * While picking, a primary press on a block or on the pane is taken before
 * anything inside sees it (`pickAt`), so it neither selects nor deselects.
 * Preventing the press keeps the mouse events that would start Svelte
 * Flow's drag, pan or marquee from following it. A press elsewhere (the
 * toolbars) acts as ever.
 */
function pickOnPress(event: PointerEvent): boolean {
  picked = false;
  if (picking === null || !event.isPrimary || event.button !== 0) return false;
  const pressed = pointer.pressedAt(event.target, { x: event.clientX, y: event.clientY });
  if (pressed.node === undefined && !pressed.pane) return false;
  event.preventDefault();
  event.stopPropagation();
  picked = true;
  pickAt(pressed, picking);
  return true;
}

/**
 * The click that ends a press taken by picking reaches nothing inside the
 * canvas; while picking, neither does any click on a block or the pane, so
 * Svelte Flow selects and deselects nothing.
 */
function onclickcapture(event: MouseEvent) {
  const taken = picked;
  picked = false;
  if (!taken && picking === null) return;
  const pressed = taken ? null : pointer.pressedAt(event.target);
  if (taken || pressed?.node !== undefined || pressed?.pane === true) event.stopPropagation();
}

/**
 * While picking, Enter or Space on the focused element of the canvas picks
 * it, as a press on it would (`pickAt`), and selects nothing.
 */
function pickOnKey(event: KeyboardEvent): boolean {
  if (picking === null) return false;
  const plain = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
  if (!plain || (event.key !== "Enter" && event.key !== " ")) return false;
  pickAt(pointer.pressedAt(event.target), picking);
  return true;
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
    toggleMatches: () => setMatches(!showMatches),
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
  if (!pickOnKey(event) && !handleKey(keyContext(event), event)) return;
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
  data-reading={reading === null && matchHover === null ? undefined : ""}
  data-picking={picking === null ? undefined : ""}
  bind:clientWidth={null,
  (next) => {
    canvasWidth = next ?? 0;
    editorFocus.resized();
  }}
  bind:clientHeight={null,
  (next) => {
    canvasHeight = next ?? 0;
    editorFocus.resized();
  }}
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
      <MatchOverlay layers={matchLayers} />
      <CanvasToolbar
        bind:this={toolbar}
        bind:locked
        bind:marquee
        bind:coordinates={() => coordinates, setCoordinates}
        bind:matches={() => showMatches, setMatches}
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
  {#if matchFlagShown !== null}
    <MatchFlag
      groups={matchFlagShown.groups}
      x={matchFlagShown.x}
      y={matchFlagShown.y}
      top={matchFlagShown.top}
      width={root?.clientWidth ?? 0}
    />
  {/if}
  {#if showMatches && matches === null}
    <p class="tilie-matches-state" data-testid="matches-state" role="status">{NO_MATCHES}</p>
  {/if}
  <p class="tilie-hint" data-testid="hint" role="status" aria-live="polite">{hint}</p>
  <p class="tilie-announced" data-testid="coordinate-pinned" role="status">{announced}</p>
</div>
