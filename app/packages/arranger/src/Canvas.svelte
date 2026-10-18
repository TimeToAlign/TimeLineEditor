<script lang="ts">
import type { Address, Block, OpenEditor, SetCommand, Store } from "@timetoalign/tilie-core";
import { bandAddress, bandOrderOf } from "@timetoalign/tilie-core";
import { TextMeasure } from "@timetoalign/tilie-layout";
import type { FontMetrics } from "@timetoalign/timeskeleton";
import type { Viewport } from "@xyflow/svelte";
import { SelectionMode, SvelteFlow } from "@xyflow/svelte";
import "@xyflow/svelte/dist/style.css";
import { tick, untrack } from "svelte";
import type { Attachment } from "svelte/attachments";
import { MediaQuery } from "svelte/reactivity";
import BlockNode from "./BlockNode.svelte";
import type { BandDirection } from "./bands.ts";
import { bandMoveCommand, bandStep, offeredBands } from "./bands.ts";
import type { DrawingPoint } from "./boxes.ts";
import { drawingPointAt, hitOf, selectionOf } from "./boxes.ts";
import CanvasToolbar from "./CanvasToolbar.svelte";
import type { Visible } from "./commands.ts";
import { moveCommand, nudgeCommand, removeCommand, zOrderCommand } from "./commands.ts";
import { descriptorsOf, drawingOf } from "./drawing.ts";
import type { Editing, Level } from "./editors.ts";
import { editedElement, editorTargetOf, gesturesOf, resizes } from "./editors.ts";
import { FOCUS_DURATION, focusViewport, targetBounds } from "./focus.ts";
import type { ResizedItem } from "./gestures.svelte.ts";
import { abortDrag, CLICK_DISTANCE } from "./gestures.svelte.ts";
import { resizedItemOf } from "./items.ts";
import type { LiveStore } from "./liveStore.svelte.ts";
import { elementsInRect } from "./marquee.ts";
import { setNodeActions } from "./nodeActions.ts";
// Deleting a segment is not enabled yet; enabling it restores these imports
// (see "Deleting a segment" below for what else it must change):
// import type { Gap } from "@timetoalign/tilie-core";
// import type { SegmentDelete } from "./commands.ts";
// import { preferredGap } from "./commands.ts";
// import { segmentAnchor } from "./drawing.ts";
// import GapMenu from "./GapMenu.svelte";
// import { blockOf } from "./selection.ts";
import type { BlockNode as BlockNodeType, LivePlacement } from "./project.ts";
import { insideOf, livePlacement, nodePosition, project } from "./project.ts";
import ResizeToolbar from "./ResizeToolbar.svelte";
import type { ResizeMode } from "./resize.ts";
import SnapGuides from "./SnapGuides.svelte";
import type { Selection } from "./selection.ts";
import { blockOf, click, offersBand, type SelectedBand, selectedBand } from "./selection.ts";
import type { Box, Guide } from "./snap.ts";
import { snap } from "./snap.ts";

interface Props {
  /**
   * The workspace store, read through `liveStore`; replacing it shows the
   * new workspace, fitted into view.
   */
  live: LiveStore;
  metrics: FontMetrics;
  /** The selected addresses: block ids and `<block>/<element id>`. */
  selection: Selection;
  /** While locked, dragging a block pans the canvas instead of moving the block. */
  locked: boolean;
  mode: ResizeMode;
  viewport: Viewport;
  /**
   * Called with the placement of the block a drag or a resize changes, as
   * the canvas shows it before release, with the drawing its node shows
   * (the items and cards a gesture inside the block moves or resizes),
   * whenever it changes; with `null` once the gesture ends. Only a gesture
   * on a single block or inside one reports one.
   */
  onlive?: (placement: LivePlacement | null) => void;
}

let {
  live,
  metrics,
  selection = $bindable(),
  locked = $bindable(),
  mode = $bindable(),
  viewport = $bindable(),
  onlive,
}: Props = $props();

/** Above this many blocks only the blocks in view are mounted. */
const CULLING_THRESHOLD = 500;
/** How close, in screen pixels, a dragged block snaps to another block's edge or origin. */
const SNAP_TOLERANCE = 6;
/*
 * A pointer moving no further than `CLICK_DISTANCE` between press and
 * release clicks (touch and trackpads wobble). Svelte Flow starts a marquee
 * past this distance, or past any distance while Shift is held, so a marquee
 * ending within it counts as a click too.
 */
/** Two taps of a touch act as a double-click when the second follows the first within this many milliseconds… */
const DOUBLE_TAP_MS = 300;
/** …and this many screen pixels, where a double-click would do the same. */
const DOUBLE_TAP_DISTANCE = 10;
/** Arrow keys move by one grid step; with Shift by this many. */
const LARGE_STEP = 8;
// Deleting a segment is not enabled yet; see "Deleting a segment" below for what
// enabling it must change.
// /** How far below a segment, in screen pixels, its Delete menu opens. */
// const MENU_GAP = 6;

const nodeTypes = { block: BlockNode };
/**
 * Delete and Backspace are ours (`removeCommand`), so Svelte Flow binds no
 * delete key; Shift+click is ours (`click`), so it binds no multi-selection
 * key either. An empty list rather than `null`: Svelte Flow turns `null`
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

/** The store the canvas shows and dispatches to. */
const store: Store = $derived(live.store);
/** The store's current view. */
const view = $derived(live.view);

/** The innermost open editor, `null` on the arranger. */
const editing: Editing | null = $derived.by(() => {
  const innermost = live.editing.at(-1);
  return innermost === undefined ? null : { target: innermost.target, kind: innermost.kind };
});

/** What the canvas offers at its current level: the arranger's gestures or the editor's. */
const gestures = $derived(gesturesOf(editing));
/** The level the canvas is at: the arranger, or the innermost editor's kind. */
const level: Level = $derived(editing === null ? "arranger" : editing.kind);

// The view and the selection follow the store's editing path.
$effect(() => {
  const current = store;
  const next = live.editing;
  untrack(() => follow(current, next));
});

let toolbar: ReturnType<typeof CanvasToolbar> | undefined = $state();
let resizer: ReturnType<typeof ResizeToolbar> | undefined = $state();

/** Show the canvas at `next`; see `CanvasToolbar.setViewport`. */
export function setViewport(next: Viewport): void {
  heading = null;
  toolbar?.setViewport(next);
}

// --- Editors ---------------------------------------------------------------

/**
 * The reader's preference for reduced motion, under which the view moves to
 * and from an editor at once. Svelte's `prefersReducedMotion` is this query,
 * made when its module loads; made here, it is made when the canvas mounts.
 */
const reducedMotion = new MediaQuery("(prefers-reduced-motion: reduce)");
/**
 * The viewport each open editor was entered from, outermost first: closing
 * an editor moves the view back to where its level was.
 */
let returns: Viewport[] = [];
/** Counts the moves to an editor, so a move asked for earlier never lands after a later one. */
let focusing = 0;
/** Where a smooth move of the view is heading while it is under way; `null` otherwise. */
let heading: Viewport | null = null;
/** The editing path the canvas last followed, and the store it belongs to. */
let followed: { readonly store: Store; readonly editing: readonly OpenEditor[] } | null = null;
/** The canvas's size in screen pixels when the view last moved to an edited element. */
let focusedAt: { readonly width: number; readonly height: number } | null = null;

/** Move the view to `next`, smoothly unless the reader prefers reduced motion. */
function moveTo(next: Viewport): void {
  const duration = reducedMotion.current ? 0 : FOCUS_DURATION;
  heading = duration === 0 ? null : next;
  toolbar?.setViewport(next, duration);
  if (heading !== null) {
    setTimeout(() => {
      if (heading === next) heading = null;
    }, duration);
  }
}

/**
 * Follow the store's editing path: an editor opening pushes the viewport,
 * prunes the selection to what lies inside it and moves the view to the
 * edited element; an editor closing pops the viewport its level was entered
 * from and moves the view back there. A level entered while the view is
 * still moving to the level below returns to where that move was heading,
 * which is where the level below is shown. A store of its own starts with
 * no viewports to go back to.
 */
function follow(current: Store, next: readonly OpenEditor[]): void {
  const before = followed?.store === current ? followed.editing.length : null;
  followed = { store: current, editing: next };
  if (before === null) {
    returns = [];
    focusing += 1;
    heading = null;
  } else if (next.length > before) {
    const { x, y, zoom } = heading ?? viewport;
    for (let level = before; level < next.length; level += 1) returns.push({ x, y, zoom });
    const innermost = next.at(-1);
    if (innermost !== undefined) {
      selection = insideSelection(innermost);
      void focusOn(innermost.target);
    }
  } else if (next.length < before) {
    focusing += 1;
    const [back] = returns.splice(next.length);
    if (back !== undefined) moveTo(back);
  }
}

/**
 * The selection kept when the editor `opened` opens: the addresses inside
 * the edited element (`BlockNodeData.inside`), the bands the view offers
 * under it (`offersBand`, the opened timeline editor's own; a band draws
 * nothing, so it is never inside), and in the bundle editor the block
 * itself; never another block, nor the edited group or timeline itself
 * (its card included), on which a gesture would be refused.
 */
function insideSelection(opened: OpenEditor): Selection {
  const { block, element } = editedElement(opened.target);
  const inside = nodes.find(({ id }) => id === block)?.data.inside ?? new Set<string>();
  const own = element === null ? [] : [element, `${element}/card`];
  const kept = [...selection].filter((address) => {
    if (address === block) return element === null;
    if (blockOf(address) !== block) return false;
    const band = selectedBand(address);
    if (band !== null) return offersBand(view, band, opened);
    const local = address.slice(block.length + 1);
    return inside.has(local) && !own.includes(local);
  });
  return kept.length === selection.size ? selection : new Set(kept);
}

/**
 * Centre the edited element `target` in the canvas, once the page has
 * settled: the inspector may open with the editor, and the canvas, which
 * lies left of it, is measured after it has. Its width is therefore the
 * area left of the drawer, and no drawer width is taken off. A target that
 * is not drawn (a hidden element) leaves the view where it is.
 */
async function focusOn(target: Address): Promise<void> {
  const asked = ++focusing;
  await tick();
  const node = nodes.find(({ id }) => id === blockOf(target));
  if (asked !== focusing || node === undefined || root === undefined) return;
  let bounds: ReturnType<typeof targetBounds>;
  try {
    bounds = targetBounds(node, target, metrics);
  } catch (error) {
    if (error instanceof RangeError) return;
    throw error;
  }
  focusedAt = { width: root.clientWidth, height: root.clientHeight };
  moveTo(focusViewport(bounds, focusedAt, 0));
}

/**
 * The canvas has changed size (the inspector drawer opening or closing
 * beside it, the window resized): with an editor open, its element is
 * centred again to fill the new area, as on entering. A size the view was
 * already focused at moves nothing, so the measurement that follows an
 * editor's opening (and the drawer opening with it) does not move the view
 * a second time. The viewport an editor returns to on Done stays the one it
 * was entered from.
 */
function resized(): void {
  const innermost = live.editing.at(-1);
  if (innermost === undefined || root === undefined) return;
  if (focusedAt?.width === root.clientWidth && focusedAt.height === root.clientHeight) return;
  void focusOn(innermost.target);
}

/** Open the editor of `target`; a refusal is shown in the status region. */
function openEditor(target: Address): void {
  const error = store.open(target);
  hint = error === null ? "" : error.message;
}

/** A point on the screen, in client pixels. */
type Client = { readonly x: number; readonly y: number };

/**
 * The point of `node`'s drawing under the client point `client`, read
 * through the `<svg>` holding `target`; none without a client point (a key)
 * or where no drawing is shown.
 */
function drawingPointIn(
  node: BlockNodeType,
  target: EventTarget | null,
  client?: Client,
): DrawingPoint | undefined {
  const svg = target instanceof Element ? target.closest("svg") : null;
  if (svg === null || client === undefined) return undefined;
  return (
    drawingPointAt(node.data.drawing, svg.getBoundingClientRect(), client.x, client.y) ?? undefined
  );
}

/**
 * What `target` at the client point `client` hits in `node` (`hitOf`): a
 * band only with a client point, where an offered band lies under it.
 */
function hitIn(node: BlockNodeType, target: EventTarget | null, client?: Client) {
  return hitOf(node.id, node.data.drawing, target, drawingPointIn(node, target, client), editing);
}

/**
 * The editor target a double-click, a double tap or Enter on `target` opens
 * (`editorTargetOf`): `null` off every block, outside the edited element, on
 * the edited element itself and on a band. A pointer gesture gives its
 * client point, so that text or a region opens the last drawn card or frame
 * under it, the innermost where none overlap; Enter gives none, so a
 * selected element in no box of its own opens nothing.
 */
function openableAt(target: EventTarget | null, client?: Client): Address | null {
  const node = nodeAt(target);
  if (node === undefined) return null;
  return editorTargetOf(view, hitIn(node, target, client), editing);
}

/** What a double-click outside the edited element does: close the innermost editor, as Done does. */
const DONE = Symbol("done");

/**
 * Whether `target` at the client point `client` lies outside the edited
 * element: the empty pane (which a faded block, taking no pointer, lets a
 * press through to), or a part of a block where a press selects nothing
 * (`pressedIn`, the inside test that also fades and prunes), so never an
 * offered band. Nothing lies outside on the arranger; the canvas's own
 * controls (toolbars, handles) lie in no block and are not the pane.
 */
function isOutside(target: EventTarget | null, client: Client): boolean {
  if (editing === null) return false;
  if (target instanceof Element && target.classList.contains("svelte-flow__pane")) return true;
  const node = nodeAt(target);
  return node !== undefined && pressedIn(node, target, client) === null;
}

/**
 * What a double-click or a double tap on `target` at `client` does: outside
 * the edited element it closes the innermost editor (`DONE`), else it opens
 * the editor `openableAt` names, or does nothing (`null`).
 */
function doubleClickAt(target: EventTarget | null, client: Client): Address | typeof DONE | null {
  return isOutside(target, client) ? DONE : openableAt(target, client);
}

/** Close the innermost editor, or open the editor of `target`. */
function act(action: Address | typeof DONE): void {
  if (action === DONE) store.done();
  else openEditor(action);
}

/**
 * A double-click opens the editor of what it hit, or outside the edited
 * element closes the innermost editor. A touch's double tap is read in
 * `onpointerupcapture`, so a double-click a browser derives from it is not
 * read a second time.
 */
function ondblclick(event: MouseEvent): void {
  if (press?.pointerType === "touch") return;
  const action = doubleClickAt(event.target, { x: event.clientX, y: event.clientY });
  if (action !== null) act(action);
}

/** The last tap of a touch that could act as a double-click: where, when, and what it would do. */
let tap: {
  readonly x: number;
  readonly y: number;
  readonly time: number;
  readonly action: Address | typeof DONE;
} | null = null;

/**
 * A double tap acts as a double-click does with a mouse: two taps within
 * `DOUBLE_TAP_MS` and `DOUBLE_TAP_DISTANCE` of each other where a
 * double-click would do the same (open the same editor, or close the
 * innermost). A tap is a touch released within the click distance of its
 * press.
 */
function onpointerupcapture(event: PointerEvent): void {
  if (event.pointerType !== "touch" || !event.isPrimary) return;
  const action =
    press !== null && isClick(press, event)
      ? doubleClickAt(event.target, { x: event.clientX, y: event.clientY })
      : null;
  const previous = tap;
  tap =
    action === null ? null : { x: event.clientX, y: event.clientY, time: event.timeStamp, action };
  if (
    previous !== null &&
    previous.action === action &&
    event.timeStamp - previous.time <= DOUBLE_TAP_MS &&
    Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= DOUBLE_TAP_DISTANCE
  ) {
    tap = null;
    act(previous.action);
  }
}

/**
 * The editor Enter opens: that of the single selected address, as a
 * double-click on it would open, found through the drawn element carrying
 * it (the block's node for a block); `null` when the selection is not one
 * openable address.
 */
function openableSelection(): Address | null {
  if (selection.size !== 1) return null;
  const [address] = selection;
  if (address === undefined) return null;
  const id = blockOf(address);
  const element = [...(root?.querySelectorAll(".svelte-flow__node[data-id]") ?? [])].find(
    (found) => found.getAttribute("data-id") === id,
  );
  if (element === undefined) return null;
  const drawn =
    address === id
      ? element
      : [...element.querySelectorAll("[data-address]")].find(
          (found) => found.getAttribute("data-address") === address.slice(id.length + 1),
        );
  return drawn === undefined ? null : openableAt(drawn);
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
/** The ids of the blocks under drag, from the drag's start to its end. */
let dragging: readonly string[] | null = $state.raw(null);
/**
 * Bumped to project the view again although neither the view nor the
 * selection changed: after Svelte Flow has set its nodes' `selected` flags
 * itself (see `reassert`).
 */
let resync = $state(0);
/** The last refusal, announced in the status region. */
let hint = $state("");

// Deleting a segment is not enabled yet; see "Deleting a segment" below for what
// enabling it must change.
// /**
//  * The segment Delete asks about, with the view and the selection it was
//  * asked in: the menu shows while both are unchanged, so any other change
//  * (an undo, another selection) closes it.
//  */
// let deleting = $state.raw<{
//   readonly view: View;
//   readonly selection: Selection;
//   readonly asked: SegmentDelete;
// } | null>(null);
// /** The way the menu has chosen to close the segment's gap. */
// let gap = $state.raw<Gap | null>(null);
//
// const gapMenu = $derived(
//   deleting !== null && deleting.view === view && deleting.selection === selection
//     ? deleting.asked
//     : null,
// );

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
  void resync;
  // Deleting a segment is not enabled yet; enabling it passes the gap's
  // preview again, as the fifth argument:
  // gapMenu === null || gap === null ? null : { segment: gapMenu.segment, gap },
  projected = project(view, selection, projected, metrics, editing);
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
          position: nodePosition(shown, drawing),
          width,
          height,
          measured: { width, height },
          data: { ...node.data, block: shown, drawing, descriptors: descriptorsOf(drawing) },
        }
      : node,
  );
}

/**
 * The block a gesture on a single block or inside one changes, as the canvas
 * shows it, with the drawing its node shows; `null` without one.
 */
const placement: LivePlacement | null = $derived.by(() => {
  const id = preview?.id ?? (dragging?.length === 1 ? dragging[0] : undefined);
  const block = id === undefined ? undefined : view.blocks[id];
  const node = block === undefined ? undefined : nodes.find((item) => item.id === block.id);
  if (block === undefined || node === undefined) return null;
  return livePlacement(
    block,
    node.position,
    preview?.id === block.id ? preview.values : {},
    node.data.drawing,
  );
});

$effect(() => {
  onlive?.(placement);
});

/**
 * What the resize toolbar acts on: the single selected box that the current
 * level resizes (`RESIZING`), a block, a group's frame, an ungrouped root's
 * card or a member's card (selected as `M/card`). On the arranger that is
 * any of them; in an editor one inside the edited element, the edited
 * element's own box included where the table says so.
 */
const resizable: { readonly block: Block; readonly item?: ResizedItem } | undefined = $derived.by(
  () => {
    if (selection.size !== 1) return undefined;
    const [address] = selection;
    if (address === undefined) return undefined;
    const block = view.blocks[blockOf(address)];
    if (block === undefined) return undefined;
    const edited = editing === null ? null : editedElement(editing.target);
    if (edited !== null && edited.block !== block.id) return undefined;
    // The edited element within the block: `null` for the block itself, and on the arranger.
    const within = edited === null ? null : edited.element;
    if (address === block.id) {
      return resizes("block", level, edited !== null && within === null) ? { block } : undefined;
    }
    const element = address.slice(block.id.length + 1);
    const drawing = drawingOf(block, view.settings, metrics);
    const item = resizedItemOf(drawing, element);
    if (item === undefined || !insideOf(block.manifest, drawing, within).has(element)) {
      return undefined;
    }
    return resizes(item.kind, level, item.key === within) ? { block, item } : undefined;
  },
);

/** The resized box on the canvas as shown: the block's node, or the item's frame or card. */
const resizableBox = $derived.by(() => {
  const node =
    resizable === undefined ? undefined : nodes.find(({ id }) => id === resizable.block.id);
  if (node === undefined || resizable === undefined) return undefined;
  if (resizable.item !== undefined) {
    return targetBounds(node, `${node.id}/${resizable.item.key}`, metrics);
  }
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

/** The text measure the block nodes' gestures lay drawings out with: the canvas's own metrics. */
const measure = $derived(new TextMeasure(metrics));

setNodeActions({
  dispatch(command) {
    dispatch(command);
  },
  locked: () => locked,
  reducedMotion: () => reducedMotion.current,
  select(address) {
    selection = new Set([address]);
  },
  preview(block, shown) {
    if (shown !== null) preview = { id: block, values: shown };
    else if (preview?.id === block) preview = null;
  },
  get metrics() {
    return measure;
  },
  view: () => view,
  zoom: () => viewport.zoom,
});

// --- Selection -------------------------------------------------------------

/**
 * The selection decides which nodes are selected, never Svelte Flow. Svelte
 * Flow sets its nodes' `selected` flags itself on a click (a click on the
 * empty canvas clears them all, a click on a node selects that node) after
 * or before calling the handlers below, and writes those nodes back through
 * `bind:nodes`. Once its handling is over, the view is projected again, so
 * the flags show the selection even when the selection did not change.
 */
function reassert(): void {
  queueMicrotask(() => {
    resync += 1;
  });
}

/**
 * Whether a click adds to the selection (or removes an item already in it):
 * with Shift, and always while the marquee toggle is on.
 */
function additive(event: { shiftKey: boolean }): boolean {
  return event.shiftKey || marquee;
}

/**
 * What a press on `target` inside `node` at the client point `client`
 * selects (`boxes.ts`): the card, the group's frame, the band or the element
 * it hit, or the block when it hit the block's own box; `null` outside the
 * edited element, where a press changes nothing. A band is hit only with a
 * client point: a key selects none.
 */
function pressedIn(
  node: BlockNodeType,
  target: EventTarget | null,
  client?: Client,
): string | null {
  return selectionOf(hitIn(node, target, client), editing, node.data.inside);
}

/** The selection after a click on `address` (`click`); unchanged where the click selects nothing. */
function clicked(address: string | null, event: { shiftKey: boolean }): Selection {
  return address === null ? selection : click(selection, address, additive(event));
}

/** The block node an event target lies in, if any. */
function nodeAt(target: EventTarget | null): BlockNodeType | undefined {
  const id =
    target instanceof Element
      ? target.closest(".svelte-flow__node[data-id]")?.getAttribute("data-id")
      : undefined;
  return id == null ? undefined : nodes.find((item) => item.id === id);
}

function onnodeclick({ node, event }: { node: BlockNodeType; event: MouseEvent | TouchEvent }) {
  const client = "clientX" in event ? { x: event.clientX, y: event.clientY } : undefined;
  selection = clicked(pressedIn(node, event.target, client), event);
  reassert();
}

/**
 * Where, on what and by which kind of pointer the last primary press on the
 * canvas landed: in client pixels, and as the canvas point under it then
 * (`at`), which stays where it is on the canvas when Svelte Flow pans during
 * a marquee.
 */
let press: {
  readonly x: number;
  readonly y: number;
  readonly at: { readonly x: number; readonly y: number } | null;
  readonly target: EventTarget | null;
  readonly pointerType: string;
} | null = null;

function isClick(from: { x: number; y: number }, to: { clientX: number; clientY: number }) {
  return Math.hypot(to.clientX - from.x, to.clientY - from.y) <= CLICK_DISTANCE;
}

/**
 * A marquee that ended within the click distance, as the click it was: on
 * a block, a click on that block, band or element where it was pressed;
 * elsewhere a click on the empty canvas.
 */
function clickAt(target: EventTarget | null, client: Client, event: PointerEvent): void {
  const node = nodeAt(target);
  if (node !== undefined) {
    selection = clicked(pressedIn(node, target, client), event);
  } else {
    clearOnPane(event);
  }
}

/**
 * A click on the empty canvas clears the selection in every mode, the
 * marquee mode included, on the arranger and in an editor alike; with Shift
 * it leaves the selection as it is. In an editor a click on a faded block
 * reaches the pane too, since the block takes no pointer, and changes
 * nothing: the selection is cleared only where no block's box holds the
 * click.
 */
function clearOnPane(event: MouseEvent): void {
  if (event.shiftKey) return;
  if (editing !== null && onBlock(event)) return;
  selection = new Set();
}

/** Whether a block's box on the canvas holds the client point of `event`, edges included. */
function onBlock(event: MouseEvent): boolean {
  if (toolbar === undefined) return false;
  const at = toolbar.toCanvas({ x: event.clientX, y: event.clientY });
  return nodes.some((node) => {
    const box = boxOf(node);
    return (
      at.x >= box.x && at.x <= box.x + box.width && at.y >= box.y && at.y <= box.y + box.height
    );
  });
}

/** Svelte Flow reports no click at the end of a marquee. */
function onpaneclick({ event }: { event: MouseEvent }) {
  clearOnPane(event);
  reassert();
}

/**
 * The marquee's result: on the arranger the blocks Svelte Flow marked while
 * it was drawn; in an editor the elements inside the edited element that lie
 * wholly in the rectangle from the press to the release (`elementsInRect`),
 * never a box. A Shift+drag marquee replaces the selection; while the
 * marquee toggle is on, the result is added to it.
 */
function onselectionend(event: PointerEvent) {
  if (press !== null && isClick(press, event)) {
    clickAt(press.target, press, event);
    reassert();
    return;
  }
  const marked = gestures.marquee === "blocks" ? markedBlocks() : markedElements(event);
  selection = new Set(marquee ? [...selection, ...marked] : marked);
  reassert();
}

function markedBlocks(): string[] {
  return nodes.filter((node) => node.selected).map((node) => node.id);
}

function markedElements(event: PointerEvent): string[] {
  const node =
    editing === null ? undefined : nodes.find(({ id }) => id === blockOf(editing.target));
  const from = press?.at;
  if (node === undefined || from == null || toolbar === undefined) return [];
  const to = toolbar.toCanvas({ x: event.clientX, y: event.clientY });
  const rect = {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y),
  };
  return elementsInRect(node, rect, node.data.inside, metrics);
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
  dragging = [...ids];
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
  dragging = null;
  const lead = targetNode ?? dragged[0];
  if (lead === undefined) return;
  const { dx, dy } = snapOffset(lead);
  anchors = [];
  const moves = dragged.map(({ id, position }) => ({ id, x: position.x + dx, y: position.y + dy }));
  const command = moveCommand(view, moves, metrics);
  if (command === null || !dispatch(command)) {
    // Nothing is stored: show the projection again instead of the dragged preview.
    nodes = projected;
  }
}

// --- Resize ----------------------------------------------------------------

function onresize(values: Partial<Block>) {
  if (resizable !== undefined) preview = { id: resizable.block.id, values };
}

/** A resize that changes no stored value has no command, like a drag that ends where it began. */
function onresizeend(_values: Partial<Block>, command: SetCommand | null) {
  preview = null;
  if (command !== null && !locked) dispatch(command);
}

function onresizecancel() {
  preview = null;
}

// --- Delete ----------------------------------------------------------------

/** Delete what is selected; a segment is refused (`removeCommand`), its hint shown. */
function deleteSelection(): void {
  const command = removeCommand(view, selection);
  if ("refused" in command) {
    hint = command.refused;
  } else if (dispatch(command)) {
    selection = new Set();
  }
}

// Deleting a segment: not enabled yet. `removeCommand` refuses a segment,
// and the menu asking how to close its gap (`GapMenu`) is not mounted.
// Enabling it restores the imports, `MENU_GAP`, the menu's state, the gap
// preview in `nodes`, the branch of `deleteSelection` below, `closeGap`,
// `keepSegment`, `gapPoint` and the menu in the markup, and must change:
// - "Left shifts" means that the left neighbour moves: the segment line's
//   offset in its parent moves or, on a root, the line becomes shorter by
//   the deleted segment's length.
// - A plain segment is never locked, so its neighbours may always extend;
//   a segment that is itself a segment line is locked, so a line of such
//   segments extends only into a neighbour of unknown length.
// - After a shift the shortened line is drawn at its full graphical
//   length, so its remaining segments widen and fill the gap from both
//   sides. That is intended: keep it.
// - The options offered for a segment line that is a root, where only one
//   shift was offered, must be checked again against these rules.
//
// The branch of `deleteSelection`, before its last `else if`:
//   } else if ("segment" in command) {
//     hint = "";
//     gap = preferredGap(command.options);
//     deleting = { view, selection, asked: command };
//
// function closeGap(chosen: Gap): void {
//   deleting = null;
//   const command = removeCommand(view, selection, chosen);
//   if ("refused" in command) hint = command.refused;
//   else if (!("segment" in command) && dispatch(command)) selection = new Set();
//   focus();
// }
//
// function keepSegment(): void {
//   deleting = null;
//   focus();
// }
//
// /** Where the menu opens, in pixels of the canvas: below the segment, or below its block. */
// const gapPoint = $derived.by(() => {
//   if (gapMenu === null) return null;
//   const id = blockOf(gapMenu.segment);
//   const node = nodes.find((item) => item.id === id);
//   if (node === undefined) return null;
//   const { drawing, block } = node.data;
//   const anchor = segmentAnchor(drawing, gapMenu.segment.slice(id.length + 1)) ?? {
//     x: drawing.width / 2,
//     y: drawing.height,
//   };
//   const { x, y, zoom } = viewport;
//   return {
//     x: x + (node.position.x + anchor.x * block.scale) * zoom,
//     y: y + (node.position.y + anchor.y * block.scale) * zoom + MENU_GAP,
//   };
// });

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

/** The bands in the selection. */
function selectedBands(): SelectedBand[] {
  return [...selection].flatMap((address) => {
    const band = selectedBand(address);
    return band === null ? [] : [band];
  });
}

/**
 * Step the selected `band` past the next band or line drawn in `direction`
 * (`bandStep`), in one `set` (`bandMoveCommand`): only where the open
 * editor moves bands and offers the band (`offersBand`), on a canvas that
 * is not locked, and while the band is drawn; nothing at the top or the
 * bottom.
 */
function stepBand(band: SelectedBand, direction: BandDirection): void {
  if (locked || !gestures.moveBands || !offersBand(view, band, editing)) return;
  const block = view.blocks[band.block];
  if (block === undefined) return;
  const drawing = drawingOf(block, view.settings, metrics);
  const address = bandAddress(band.timeline, band.kind);
  const drawn = offeredBands(drawing, band.timeline).find((record) => record.address === address);
  if (drawn === undefined) return;
  const order = bandStep(drawing, drawn, direction, bandOrderOf(block.manifest, band.timeline));
  if (order !== null) dispatch(bandMoveCommand(view, block.id, band.timeline, order));
}

/** Run the action a key stands for; `false` when the key means nothing here. */
function handleKey(event: KeyboardEvent): boolean {
  const { key, shiftKey } = event;
  if (event.altKey) return false;
  if (!onCanvas(event.target)) return false;
  // The Delete menu reads its own keys (not mounted while deleting a
  // segment is not enabled; see "Deleting a segment").
  if (event.target instanceof Element && event.target.closest("[data-gap-menu]") !== null) {
    return false;
  }
  // Arrows move between a toolbar's buttons there.
  if (event.target instanceof Element && event.target.closest('[role="toolbar"]') !== null) {
    if (key.startsWith("Arrow") || key === "Home" || key === "End") return false;
  }
  if (event.ctrlKey || event.metaKey) {
    if (key === "ArrowUp" || key === "ArrowDown") {
      // The key is the band's whenever a band is selected; it steps exactly one.
      const bands = selectedBands();
      if (bands.length === 0) return false;
      const [band] = bands;
      if (bands.length === 1 && band !== undefined) {
        stepBand(band, key === "ArrowUp" ? "up" : "down");
      }
      return true;
    }
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
    // Bringing a block forward reorders blocks, which only the arranger does.
    if (action === undefined || !gestures.moveBlocks) return false;
    const command = zOrderCommand(view, selectedBlocks(), action);
    if (command !== null) dispatch(command);
    return true;
  }
  const arrow = ARROWS[key];
  if (arrow !== undefined) {
    const ids = selectedBlocks();
    if (ids.length === 0 || locked || !gestures.moveBlocks) return false;
    const step = shiftKey ? LARGE_STEP : 1;
    const command = nudgeCommand(view, ids, arrow[0] * step, arrow[1] * step, metrics);
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
      deleteSelection();
      return true;
    }
    case "Enter":
    case " ": {
      // Enter opens the editor of the single selected box or timeline.
      const target = key === "Enter" ? openableSelection() : null;
      if (target !== null) {
        openEditor(target);
        return true;
      }
      // The focused block, reached by Tab, is selected as a click on its background would:
      // the node itself carries no address, so the press hits the block's own box.
      const node = nodeAt(event.target);
      if (node === undefined) return false;
      selection = clicked(pressedIn(node, event.target), event);
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
      // Escape first ends a resize or a drag inside a drawing in progress, then clears
      // the selection, then closes the innermost editor.
      if (resizer?.abort() === true || abortDrag()) return true;
      if (selection.size > 0) selection = new Set();
      else if (live.editing.length > 0) store.done();
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
function onpointerdowncapture(event: PointerEvent) {
  if (event.isPrimary && event.button === 0) {
    const client = { x: event.clientX, y: event.clientY };
    press = {
      ...client,
      at: toolbar?.toCanvas(client) ?? null,
      target: event.target,
      pointerType: event.pointerType,
    };
  }
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
  style:--tilie-zoom={viewport.zoom}
  bind:clientWidth={null, resized}
  bind:clientHeight={null, resized}
  {onpointerdowncapture}
  {onpointerupcapture}
  {ondblclick}
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
          bind:this={resizer}
          block={resizable.block}
          item={resizable.item}
          {level}
          box={resizableBox}
          {view}
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
  <!-- Deleting a segment is not enabled yet; see "Deleting a segment" in the script for what
  enabling it must change. The menu asking how to close the gap:
  {#if gapMenu !== null && gap !== null && gapPoint !== null}
    <GapMenu
      segment={gapMenu.segment.slice(blockOf(gapMenu.segment).length + 1)}
      options={gapMenu.options}
      bind:gap
      x={gapPoint.x}
      y={gapPoint.y}
      onconfirm={closeGap}
      oncancel={keepSegment}
    />
  {/if}
  -->
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

    /* What closing a deleted segment's gap moves or resizes. */
    .tilie-block [data-moved] {
      filter: drop-shadow(0 0 1.5px #e07b00) drop-shadow(0 0 1.5px #e07b00);
    }

    /*
     * The card, the group's frame or the band under the pointer: quieter
     * than a selection; a boundary under the pointer takes the accent.
     */
    .tilie-block rect[data-hovered],
    .tilie-block .tilie-band[data-mark="hover"] {
      filter: drop-shadow(0 0 2px #9cc8ff) drop-shadow(0 0 2px #9cc8ff);
    }

    /*
     * A selected element or band; listed for `rect` as well, so that a
     * selected card or frame keeps the selection's glow under the pointer.
     */
    .tilie-block [data-selected],
    .tilie-block rect[data-selected],
    .tilie-block .tilie-band[data-mark="selection"] {
      filter: drop-shadow(0 0 1.5px #0a84ff) drop-shadow(0 0 1.5px #0a84ff);
    }

    /*
     * A band draws nothing, so its mark (`BlockNode`) is the outline of its
     * rectangle drawn over the drawing, in the colour of its glow. Its stroke
     * does not scale with the block, and its width is divided by the canvas
     * zoom, as a holding mark's is, so it is a screen pixel at any block
     * scale and any zoom.
     */
    .tilie-block .tilie-band {
      fill: none;
      stroke: #9cc8ff;
      stroke-width: calc(1px / var(--tilie-zoom, 1));
      vector-effect: non-scaling-stroke;
      pointer-events: none;
    }

    .tilie-block .tilie-band[data-mark="selection"] {
      stroke: #0a84ff;
    }

    .tilie-block line[data-hovered] {
      stroke: #0a84ff;
    }

    /*
     * In an editor, everything outside the edited element: other blocks as a
     * whole, and the outside of the edited block element by element. It stays
     * visible, so the edited element is seen in its surroundings, but takes no
     * pointer: a press there reaches the pane, and a drag there pans.
     */
    .svelte-flow__node.tilie-outside,
    .tilie-block [data-outside] {
      opacity: 0.3;
      pointer-events: none;
    }

    /*
     * A box holding part of the selection is marked in the selection's
     * colour, more thinly the further out it lies: a card 3 px dashed, a
     * frame 2 px dashed, the block 1 px dotted. Each mark is a copy of its
     * box's outline drawn over the drawing (`BlockNode`). Its stroke does
     * not scale with the block, and its widths and dashes are divided by
     * the canvas zoom (`--tilie-zoom`, set on the canvas), so they are
     * screen pixels at any block scale and any zoom.
     */
    .tilie-block .tilie-holding {
      --dash: calc(6px / var(--tilie-zoom, 1));
      --gap: calc(4px / var(--tilie-zoom, 1));
      fill: none;
      stroke: #0a84ff;
      stroke-dasharray: var(--dash) var(--gap);
      vector-effect: non-scaling-stroke;
      pointer-events: none;
    }

    .tilie-block .tilie-holding[data-box="card"] {
      stroke-width: calc(3px / var(--tilie-zoom, 1));
    }

    .tilie-block .tilie-holding[data-box="group"] {
      stroke-width: calc(2px / var(--tilie-zoom, 1));
    }

    /*
     * The block's mark lies on the node's edge, between two device pixels
     * at a pixel ratio of 1; crisp edges keep its dots one pixel of the
     * full colour instead of two pale ones.
     */
    .tilie-block .tilie-holding[data-box="block"] {
      --dash: calc(1px / var(--tilie-zoom, 1));
      --gap: calc(2px / var(--tilie-zoom, 1));
      stroke-width: calc(1px / var(--tilie-zoom, 1));
      shape-rendering: crispEdges;
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
