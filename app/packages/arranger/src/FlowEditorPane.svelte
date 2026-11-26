<script lang="ts">
/**
 * The flow subeditor's pane, folded out under the edited card: one row per
 * FlowMap of the root, each drawn as its virtual timeline on the card's
 * scale (`flowPaneOf`), its name where a card has its name and its chips
 * above its line; Add + and Recompute in its head; the edited row (a new
 * FlowMap's, or a hand-made one's, chosen by a press or Enter on one of its
 * entries or by its Edit button) with its own Done and Cancel and "+ Gap",
 * whose length is typed in the row itself, as a gap entry's is changed
 * there, every other row offering its Insert meanwhile; computed rows stay
 * read only. The rows keep the order first shown while the editor is open
 * (`keptOrder`). A plain wheel stays with the pane, a zooming one zooms the
 * canvas (`ownWheel`). The pane scrolls on its own when it is wider than
 * the canvas right of the card; the card does not move. Drags carry the
 * card's elements, a row's entries and whole rows into the edited row,
 * within it, or (a row) onto the canvas as a card of its own
 * (`gestures/flowDrag.ts`).
 * An overlay of the canvas: nothing in it is part of the drawing.
 */
import type { Block, Granularity } from "@timetoalign/tilie-core";
import { assertNever, findTimeline } from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import type { Viewport } from "@xyflow/svelte";
import { ViewportPortal } from "@xyflow/svelte";
import { isAffordance } from "./boxes.ts";
import type { Draft, FlowEditorSession, FlowTarget } from "./flowEditor.svelte.ts";
import type { Dragged, FlowEntry } from "./flowEditor.ts";
import {
  cardPress,
  entryText,
  exactValue,
  gapText,
  keptOrder,
  proposedGap,
  sweptValue,
} from "./flowEditor.ts";
import type { FlowPane, PaneRow } from "./flowEditorRows.ts";
import { EMPTY_DRAFT, PANE_GAP, PANE_HEAD, paneHeight, ROW_HEAD } from "./flowEditorRows.ts";
import type { GestureSlot, Point } from "./gesture.ts";
import { drawingPoint, sourceAt } from "./gesture.ts";
import type { ScreenRect } from "./gestures/flowDrag.ts";
import {
  dropAt,
  dropIndex,
  FLY_DURATION,
  followDrag,
  insideDistance,
  twinOpacity,
  unionRect,
} from "./gestures/flowDrag.ts";
import { OWN_WHEEL, ownWheel } from "./gestures/wheel.ts";
import { quantize } from "./numbers.ts";

interface Props {
  pane: FlowPane;
  target: FlowTarget;
  session: FlowEditorSession;
  /** The new FlowMap's row of this editor; `null` while none is open. */
  draft: Draft | null;
  /** The edited block as shown, and its drawing. */
  block: Block;
  drawing: Drawing;
  /** Where the block's drawing lies on the canvas: its node's position. */
  origin: Point;
  viewport: Viewport;
  /** The canvas's width in screen pixels. */
  canvasWidth: number;
  /** Whether a server recomputes the computed FlowMaps. */
  server: boolean;
  granularity: Granularity;
  /** The step a placed card's position is rounded to. */
  step: number;
  reducedMotion: boolean;
  slot: GestureSlot;
  /** The canvas point under a client point; `undefined` before the canvas exists. */
  toCanvas: (client: Point) => Point | undefined;
}

let {
  pane,
  target,
  session,
  draft,
  block,
  drawing,
  origin,
  viewport,
  canvasWidth,
  server,
  granularity,
  step,
  reducedMotion,
  slot,
  toCanvas,
}: Props = $props();

/** Canvas pixels per drawing unit. */
const s = $derived(block.scale);
const manifest = $derived(block.manifest);
const rootName = $derived(
  manifest.timelines.find((item) => item.id === target.root)?.name ?? target.root,
);

/**
 * The order the rows were last shown in, and the editor they were shown
 * for: a record of what was drawn, which no reaction follows. It lasts as
 * long as the pane, which goes when the editor closes.
 */
let shown: { readonly target: FlowTarget; readonly ids: readonly string[] } | null = null;

/**
 * The rows in the order first shown while the editor is open: a row shown
 * keeps its place, a new one comes last (`keptOrder`); another editor's
 * rows start in `flowRows`'s order.
 */
const rows = $derived.by(() => {
  const ids = pane.rows.map((row) => row.row.id);
  const same =
    shown !== null &&
    shown.target.session === target.session &&
    shown.target.block === target.block &&
    shown.target.root === target.root;
  const order = same && shown !== null ? keptOrder(shown.ids, ids) : ids;
  shown = { target, ids: order };
  return order.flatMap((id) => pane.rows.find((row) => row.row.id === id) ?? []);
});

/** The edited row as drawn, once its FlowMap is written; `null` otherwise. */
const draftRow = $derived(
  draft?.flowMap == null ? null : (pane.rows.find((row) => row.row.id === draft.flowMap) ?? null),
);

/** The pane's height in drawing units: its head, every row and the new row's place. */
const height = $derived(paneHeight(pane, draft !== null && draft.flowMap === null));

/**
 * The widest the pane is shown, in canvas pixels: the canvas right of the
 * card's left edge, less a margin, never narrower than the card; wider
 * rows scroll inside it.
 */
const maxWidth = $derived.by(() => {
  const left = viewport.x + (origin.x + pane.x * s) * viewport.zoom;
  const room = (canvasWidth - left - 16) / viewport.zoom;
  return Math.max(pane.card.width * s, room);
});

/** The pane's element, read by the drags as they measure it: no reaction follows it. */
let paneElement: HTMLElement | undefined;

/** Keep the pane's element while it is mounted. */
function holdPane(element: HTMLElement): () => void {
  paneElement = element;
  return () => {
    if (paneElement === element) paneElement = undefined;
  };
}

/** The translucent twin a drag lifts: its text or its row's drawing, where it is and how opaque. */
interface Twin {
  readonly text: string;
  readonly row: PaneRow | null;
  readonly x: number;
  readonly y: number;
  readonly opacity: number;
  readonly flying: boolean;
}
let twin: Twin | null = $state.raw(null);
/** A stretch swept on a line of the card, in drawing units; `null` while none is. */
let sweep: { readonly x1: number; readonly x2: number; readonly y: number } | null =
  $state.raw(null);

/**
 * The gap length typed in the edited row: a new gap's at its end ("+ Gap",
 * `index` null) or the length of its gap entry `index`; `null` while none
 * is typed.
 */
let gap: { index: number | null; text: string; error: string | null } | null = $state(null);

/** The editor's area on screen: the card and the pane. */
function editorRect(): ScreenRect | null {
  if (paneElement === undefined) return null;
  const rect = paneElement.getBoundingClientRect();
  const k = s * viewport.zoom;
  const cardRect = {
    left: rect.left,
    top: rect.top - (PANE_GAP + pane.card.height) * k,
    right: rect.left + pane.card.width * k,
    bottom: rect.top,
  };
  return unionRect(cardRect, rect);
}

/** The new row's area on screen; `null` while none is open. */
function draftRect(): ScreenRect | null {
  return paneElement?.querySelector(".row.draft")?.getBoundingClientRect() ?? null;
}

/** The entry index the pointer at `at` inserts at on the new row. */
function draftIndex(at: Point): number {
  const svg = paneElement?.querySelector(".row.draft svg");
  if (draftRow === null || svg == null) return 0;
  const rect = svg.getBoundingClientRect();
  const x = rect.width > 0 ? ((at.x - rect.left) * pane.width) / rect.width : 0;
  return dropIndex(draftRow.chunks, x, draftRow.row.entries.length);
}

/** The twin's opacity with the pointer at `at`. */
function opacityAt(at: Point): number {
  const rect = editorRect();
  return rect === null ? 1 : twinOpacity(insideDistance(rect, at));
}

/** Fly the twin back to where it was lifted, then remove it; at once under reduced motion. */
function flyBack(home: Point): void {
  const shown = twin;
  if (shown === null || reducedMotion) {
    twin = null;
    return;
  }
  twin = { ...shown, x: home.x, y: home.y, flying: true };
  setTimeout(() => {
    if (twin?.flying === true) twin = null;
  }, FLY_DURATION);
}

/**
 * Drag `dragged` from the press `event`, its twin showing `text` (or the
 * row `row`'s drawing) lifted from `home` (client pixels of its top left
 * corner): to the new row (it lands, or moves there from it), out of the
 * editor (a row is placed as a card), or back.
 */
function drag(
  event: PointerEvent,
  dragged: Dragged,
  text: string,
  row: PaneRow | null,
  home: Point,
): void {
  const grab = { x: event.clientX - home.x, y: event.clientY - home.y };
  const placed = (at: Point) => ({ x: at.x - grab.x, y: at.y - grab.y });
  followDrag(
    event,
    {
      start(at) {
        twin = { text, row, ...placed(at), opacity: opacityAt(at), flying: false };
      },
      move(at) {
        if (twin !== null) twin = { ...twin, ...placed(at), opacity: opacityAt(at) };
      },
      drop(at, alt) {
        const editor = editorRect();
        const where =
          editor === null
            ? "back"
            : dropAt(at, editor, draft === null ? null : draftRect(), row !== null);
        if (where === "draft") {
          twin = null;
          const index = draftIndex(at);
          const from = dragged.kind === "entry" ? dragged.from : null;
          if (from !== null && from.flowMap === draft?.flowMap) {
            session.move(target, from.index, index, alt);
          } else {
            session.land(target, dragged, index);
          }
          return;
        }
        if (where === "canvas" && dragged.kind === "row") {
          const corner = toCanvas(placed(at));
          twin = null;
          if (corner !== undefined) {
            session.place(
              target,
              dragged.flowMap,
              quantize((corner.x - block.x) / s, step),
              quantize((corner.y - block.y) / s, step),
            );
          }
          return;
        }
        flyBack(home);
      },
      abort() {
        flyBack(home);
      },
    },
    slot,
  );
}

/**
 * A press on the edited card: a Region's brace or label, a child's line or
 * the root's line is carried into the new row, and with Shift a stretch is
 * swept on the root's or a child's line (a new Region). Whether the press
 * is taken; a taken press is the pane's alone, so nothing behind it starts
 * a pan, a node drag or a marquee.
 */
export function pressCard(event: PointerEvent): boolean {
  if (event.button !== 0 || !event.isPrimary) return false;
  const source = sourceAt(event.target);
  const drawn = source === null || isAffordance(source) ? null : source;
  const pressed = cardPress(manifest, target.root, drawn, event.shiftKey);
  if (pressed === null) return false;
  event.preventDefault();
  event.stopPropagation();
  if (pressed.kind === "line") {
    const surface = event.target;
    const pointAt = (at: Point) => drawingPoint(surface, at);
    const start = pointAt({ x: event.clientX, y: event.clientY });
    if (start === null) return true;
    const pixel = 1 / (s * viewport.zoom);
    followDrag(
      event,
      {
        start() {
          sweep = { x1: start.x, x2: start.x, y: start.y };
        },
        move(at) {
          const point = pointAt(at);
          if (point !== null && sweep !== null) sweep = { ...sweep, x2: point.x };
        },
        drop(at) {
          const end = pointAt(at);
          sweep = null;
          if (end === null) return;
          const value = (x: number) =>
            sweptValue(block, drawing, pane.key, pressed.timeline, x, pixel, granularity);
          const [a, b] = [value(start.x), value(end.x)];
          const numberType = findTimeline(manifest, pressed.timeline)?.number_type;
          if (a === null || b === null || numberType === undefined) return;
          const order = exactValue(a, numberType).compare(exactValue(b, numberType));
          if (order === 0) return;
          const [from, to] = order < 0 ? [a, b] : [b, a];
          session.land(target, { kind: "sweep", timeline: pressed.timeline, start: from, end: to });
        },
        abort() {
          sweep = null;
        },
      },
      slot,
    );
    return true;
  }
  const text = textOf(pressed);
  drag(event, pressed, text, null, { x: event.clientX - 8, y: event.clientY - 8 });
  return true;
}

/** The text a dragged thing's twin shows. */
function textOf(dragged: Dragged): string {
  switch (dragged.kind) {
    case "root":
      return `${rootName} (the whole timeline)`;
    case "element":
      return entryText(manifest, dragged.id);
    case "entry":
      return entryText(manifest, dragged.entry);
    case "row":
      return dragged.flowMap;
    case "sweep":
      return dragged.timeline;
    default:
      return assertNever(dragged);
  }
}

/** A press on an entry of a row: it is carried as its source. */
function pressEntry(event: PointerEvent, row: PaneRow, index: number): void {
  if (event.button !== 0 || !event.isPrimary) return;
  const entry = row.row.entries[index];
  if (entry === undefined) return;
  event.preventDefault();
  const element = event.currentTarget as HTMLElement;
  const rect = element.getBoundingClientRect();
  drag(
    event,
    { kind: "entry", entry, from: { flowMap: row.row.id, index } },
    entryText(manifest, entry),
    null,
    { x: rect.left, y: rect.top },
  );
}

/** A press on a row's name: the whole row is lifted, its twin its drawing. */
function pressRow(event: PointerEvent, row: PaneRow): void {
  if (event.button !== 0 || !event.isPrimary) return;
  event.preventDefault();
  const element = (event.currentTarget as HTMLElement).closest(".row");
  const rect = element?.querySelector("svg")?.getBoundingClientRect();
  drag(
    event,
    { kind: "row", flowMap: row.row.id },
    row.row.name,
    row,
    rect === undefined ? { x: event.clientX, y: event.clientY } : { x: rect.left, y: rect.top },
  );
}

/** "Place as card" without a pointer: the row's card below the pane, at the card's left edge. */
function placeBelow(row: PaneRow): void {
  const shown = paneElement === undefined ? height : paneElement.offsetHeight / s;
  const x = quantize(pane.x - drawing.origin.x, step);
  const y = quantize(pane.y + shown + PANE_GAP - drawing.origin.y, step);
  session.place(target, row.row.id, x, y);
}

/**
 * The keys of an entry: in the edited row Alt+arrows move it, D copies it,
 * Delete removes it; elsewhere Enter inserts it into the edited row, or,
 * with none edited, makes a hand-made row the edited one.
 */
function entryKey(event: KeyboardEvent, row: PaneRow, index: number): void {
  const entry = row.row.entries[index];
  if (entry === undefined) return;
  const own = row === draftRow;
  let acted = false;
  if (draft === null && (event.key === "Enter" || event.key === " ")) {
    edit(row);
    event.preventDefault();
    return;
  }
  if (own && event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
    acted = session.move(target, index, event.key === "ArrowLeft" ? index - 1 : index + 2, false);
  } else if (own && (event.key === "d" || event.key === "D")) {
    acted = session.move(target, index, index + 1, true);
  } else if (own && event.key === "Enter" && typeof entry !== "string") {
    gap = { index, text: gapText(entry), error: null };
    acted = true;
  } else if (own && (event.key === "Delete" || event.key === "Backspace")) {
    acted = session.remove(target, index);
  } else if (!own && draft !== null && (event.key === "Enter" || event.key === " ")) {
    acted = session.land(target, { kind: "entry", entry, from: { flowMap: row.row.id, index } });
  }
  if (acted || event.key === "Enter" || event.key === " ") event.preventDefault();
}

/** A press (a click, no drag) on a row's entry, or its Edit button: a hand-made row becomes the edited one. */
function edit(row: PaneRow): void {
  if (draft === null && !row.row.computed && session.edit(target, row.row.id)) gap = null;
}

/** Add +: a new row, no gap typed yet. */
function addRow(): void {
  gap = null;
  session.add(target);
}

/**
 * A click on a row's entry: a hand-made row becomes the edited one, and a
 * gap entry of the edited row has its length typed in the row.
 */
function clickEntry(row: PaneRow, index: number): void {
  const entry = row.row.entries[index];
  const own = row === draftRow;
  if (!own) edit(row);
  if (entry === undefined || typeof entry === "string") return;
  if (own || session.draftOf(target)?.flowMap === row.row.id) {
    gap = { index, text: gapText(entry), error: null };
  }
}

/** "+ Gap": the length of the edited row's last chunk proposed; pressed again, closed. */
function toggleGap(): void {
  gap =
    gap !== null && gap.index === null
      ? null
      : { index: null, text: proposedGap(manifest, draft?.flowMap ?? null), error: null };
}

/** The edited row's Done or Cancel; the gap typed there goes with it. */
function finish(kept: boolean): void {
  gap = null;
  if (kept) session.done(target);
  else session.cancel(target);
}

/** The label an entry is announced by. */
function entryLabel(row: PaneRow, entry: FlowEntry, index: number): string {
  const count = row.row.entries.length;
  return `${entryText(manifest, entry)}, entry ${index + 1} of ${count}`;
}

/** The length typed, exact: a new gap at the edited row's end, or its gap entry's new length. */
function writeGap(): void {
  if (gap === null) return;
  const { index, text } = gap;
  const error = index === null ? session.gap(target, text) : session.regap(target, index, text);
  gap = error === null ? null : { index, text, error };
}

/** Keys of the gap's input: Enter writes it, Escape closes it. */
function gapKey(event: KeyboardEvent): void {
  if (event.key === "Enter") writeGap();
  else if (event.key === "Escape") gap = null;
  else return;
  event.preventDefault();
}

/** Focus the gap's input as it appears. */
function focusInput(element: HTMLInputElement): void {
  element.focus();
}
</script>

{#snippet gapControl()}
  <button
    type="button"
    onclick={toggleGap}
    aria-expanded={gap !== null && gap.index === null}>+ Gap</button
  >
  {#if gap !== null}
    <label class="gap">
      {gap.index === null ? "Gap length" : `Length of gap ${gap.index + 1}`}
      <input
        type="text"
        inputmode="decimal"
        data-testid="flow-gap"
        bind:value={() => gap?.text ?? "", (text) => {
          if (gap !== null) gap.text = text;
        }}
        aria-invalid={gap.error !== null}
        onkeydown={gapKey}
        {@attach focusInput}
      />
    </label>
    <button type="button" onclick={writeGap}>{gap.index === null ? "Add gap" : "Set gap"}</button>
    {#if gap.error !== null}<span class="problem" role="alert">{gap.error}</span>{/if}
  {/if}
{/snippet}

{#snippet rowDrawing(row: PaneRow)}
  <svg
    width={pane.width * s}
    height={row.viewBox.height * s}
    viewBox="{row.viewBox.x} {row.viewBox.y} {pane.width} {row.viewBox.height}"
    aria-hidden="true"
  >
    {#each row.items as item (item.index)}
      <svelte:element this={item.tag} {...item.attributes}>{item.text}</svelte:element>
    {/each}
  </svg>
{/snippet}

{#snippet chips(row: PaneRow)}
  {#each row.row.chips as chip (chip.kind)}
    <span class="chip" data-chip={chip.kind} title={chip.title}>{chip.text}</span>
  {/each}
{/snippet}

{#snippet drawnRow(row: PaneRow, own: boolean)}
  <li
    class={["row", own && "draft"]}
    aria-label={row.row.name}
    data-testid="flow-row"
    data-flow-map={row.row.id}
  >
    <div class="head" style:height="{ROW_HEAD * s}px" style:padding-left="{pane.lineStart * s}px">
      {@render chips(row)}
      {#if own}
        <button type="button" class="done" onclick={() => finish(true)}>Done</button>
        <button type="button" class="cancel" onclick={() => finish(false)}>Cancel</button>
        {@render gapControl()}
      {:else}
        {#if draft !== null}
          <button
            type="button"
            onclick={() => session.land(target, { kind: "row", flowMap: row.row.id })}
            >Insert</button
          >
        {:else if !row.row.computed}
          <button type="button" onclick={() => edit(row)}>Edit</button>
        {/if}
        <button type="button" onclick={() => placeBelow(row)}>Place as card</button>
      {/if}
      {#if row.problem !== null}<span class="problem" role="status">{row.problem}</span>{/if}
    </div>
    <div class="drawing">
      {@render rowDrawing(row)}
      <span
        class="name"
        role="presentation"
        style:left="{pane.nameX * s}px"
        style:top="{row.lineY * s}px"
        onpointerdown={(event) => pressRow(event, row)}>{row.row.name}</span
      >
      {#each row.chunks as span (span.index)}
        {@const entry = row.row.entries[span.index]}
        {#if entry !== undefined}
          <button
            type="button"
            class="entry"
            data-testid="flow-entry"
            data-index={span.index}
            aria-label={entryLabel(row, entry, span.index)}
            aria-keyshortcuts={own
              ? `Alt+ArrowLeft Alt+ArrowRight D Delete${span.gap ? " Enter" : ""}`
              : "Enter"}
            style:left="{span.x1 * s}px"
            style:width="{Math.max(span.x2 - span.x1, 2) * s}px"
            style:height="{row.viewBox.height * s}px"
            onpointerdown={(event) => pressEntry(event, row, span.index)}
            onclick={(event) => {
              // Enter on a focused button also clicks it; the key has acted already.
              if (event.detail > 0) clickEntry(row, span.index);
            }}
            onkeydown={(event) => entryKey(event, row, span.index)}
          ></button>
        {/if}
      {/each}
    </div>
  </li>
{/snippet}

<ViewportPortal target="front" class="tilie-overlay">
  <section
    class={["tilie-flow-pane", "nodrag", "nopan", OWN_WHEEL]}
    aria-label="FlowMaps of {rootName}"
    data-testid="flow-pane"
    {@attach holdPane}
    style:left="{origin.x + pane.x * s}px"
    style:top="{origin.y + pane.y * s}px"
    style:width="{Math.min(pane.width * s, maxWidth)}px"
    style:font-size="{9 * s}px"
    onwheel={ownWheel}
  >
    <div class="pane-head" style:height="{PANE_HEAD * s}px">
      <button type="button" onclick={addRow} disabled={draft !== null}
        >Add +</button
      >
      <button
        type="button"
        onclick={() => void session.recompute(target)}
        disabled={!server || session.recomputing}
        aria-describedby={server ? undefined : "tilie-flow-no-server"}
        >{session.recomputing ? "Recomputing…" : "Recompute"}</button
      >
      {#if !server}
        <span class="reason" id="tilie-flow-no-server">Recomputing needs a server</span>
      {/if}
    </div>
    <ul style:width="{pane.width * s}px">
      {#each rows as row (row.row.id)}
        {@render drawnRow(row, row === draftRow)}
      {/each}
      {#if draft !== null && draft.flowMap === null}
        <li
          class="row draft empty"
          aria-label="New FlowMap"
          data-testid="flow-draft"
        >
          <div class="head" style:height="{ROW_HEAD * s}px" style:padding-left="{pane.lineStart * s}px">
            <button type="button" class="done" onclick={() => finish(true)}>Done</button>
            <button type="button" class="cancel" onclick={() => finish(false)}>Cancel</button>
            {@render gapControl()}
          </div>
          <p class="hint" style:height="{EMPTY_DRAFT * s}px" style:padding-left="{pane.lineStart * s}px">
            Drag a Region, a child, the line or a row here
          </p>
        </li>
      {/if}
    </ul>
  </section>
  {#if sweep !== null}
    <div
      class="tilie-flow-sweep"
      aria-hidden="true"
      data-testid="flow-sweep"
      style:left="{origin.x + Math.min(sweep.x1, sweep.x2) * s}px"
      style:top="{origin.y + (sweep.y - 6) * s}px"
      style:width="{Math.abs(sweep.x2 - sweep.x1) * s}px"
      style:height="{12 * s}px"
    ></div>
  {/if}
</ViewportPortal>

{#if twin !== null}
  {@const lifted = twin.row}
  <div
    class={["tilie-flow-twin", twin.flying && "flying"]}
    aria-hidden="true"
    data-testid="flow-twin"
    style:left="{twin.x}px"
    style:top="{twin.y}px"
    style:opacity={twin.opacity}
    style:--fly="{FLY_DURATION}ms"
  >
    {#if lifted !== null}
      <svg
        width={pane.width * s * viewport.zoom}
        height={lifted.viewBox.height * s * viewport.zoom}
        viewBox="{lifted.viewBox.x} {lifted.viewBox.y} {pane.width} {lifted.viewBox.height}"
      >
        {#each lifted.items as item (item.index)}
          <svelte:element this={item.tag} {...item.attributes}>{item.text}</svelte:element>
        {/each}
      </svg>
    {:else}
      <span class="label">{twin.text}</span>
    {/if}
  </div>
{/if}

<style>
  .tilie-flow-pane {
    position: absolute;
    box-sizing: border-box;
    overflow-x: auto;
    overflow-y: hidden;
    pointer-events: all;
    background: #fff;
    border: 1px solid #c8c8c8;
    border-radius: 4px;
    /* biome-ignore lint/a11y/useGenericFontNames: the pane's drawing is laid out with these faces' advances alone. */
    font-family: "TiLiE DejaVu Sans", "TiLiE Noto Music";
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .pane-head,
  .head {
    display: flex;
    align-items: center;
    gap: 0.4em;
    white-space: nowrap;
  }

  .pane-head {
    padding: 0 0.5em;
    border-bottom: 1px solid #e0e0e0;
  }

  .row {
    position: relative;
  }

  .row + .row {
    border-top: 1px solid #eeeeee;
  }

  .row.draft {
    outline: 1px dashed #1e7e34;
    outline-offset: -1px;
  }

  .drawing {
    position: relative;
  }

  .drawing svg {
    display: block;
    overflow: visible;
    font-kerning: none;
    font-variant-ligatures: none;
    text-rendering: geometricPrecision;
  }

  .name {
    position: absolute;
    transform: translateY(-50%);
    cursor: grab;
    touch-action: none;
    user-select: none;
  }

  .entry {
    position: absolute;
    top: 0;
    padding: 0;
    border: none;
    background: transparent;
    cursor: grab;
    touch-action: none;
  }

  .entry:hover {
    background: rgb(10 132 255 / 0.08);
  }

  .entry:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: -2px;
  }

  button {
    padding: 0 0.5em;
    border: 1px solid #c8c8c8;
    border-radius: 3px;
    background: #f7f7f7;
    font: inherit;
    cursor: pointer;
  }

  button:disabled {
    cursor: default;
    opacity: 0.6;
  }

  button:focus-visible,
  input:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }

  .done,
  .done:hover {
    border-color: transparent;
    background: #1e7e34;
    color: #fff;
  }

  .cancel,
  .cancel:hover {
    border-color: transparent;
    background: #c62828;
    color: #fff;
  }

  .chip {
    padding: 0 0.4em;
    border: 1px solid #c8c8c8;
    border-radius: 0.8em;
    color: #595959;
  }

  .chip[data-chip="findings"] {
    border-color: #e07000;
  }

  .reason,
  .hint {
    margin: 0;
    color: #595959;
  }

  .hint {
    display: flex;
    align-items: center;
  }

  .problem {
    color: #c62828;
  }

  input {
    width: 6em;
    font: inherit;
  }

  .gap {
    display: flex;
    align-items: center;
    gap: 0.3em;
  }

  .tilie-flow-sweep {
    position: absolute;
    box-sizing: border-box;
    border: 1px solid #0a84ff;
    background: rgb(10 132 255 / 0.15);
    pointer-events: none;
  }

  .tilie-flow-twin {
    position: fixed;
    z-index: 2147483600;
    pointer-events: none;
  }

  .tilie-flow-twin.flying {
    transition:
      left var(--fly) ease-in,
      top var(--fly) ease-in;
  }

  .tilie-flow-twin svg {
    overflow: visible;
  }

  .tilie-flow-twin .label {
    padding: 0.1rem 0.4rem;
    border: 1px solid #1ba1e2;
    border-radius: 3px;
    background: #fff;
    font-size: 0.8rem;
  }
</style>
