<script lang="ts">
import type { Block } from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import type { AttributeValue, Descriptor } from "@timetoalign/tilie-writers";
import { attributeText } from "@timetoalign/tilie-writers";
import type { NodeProps } from "@xyflow/svelte";
import { tick } from "svelte";
import type { Attachment } from "svelte/attachments";
import type { Hover, Mark } from "./boxes.ts";
import {
  addressOf,
  drawingPointAt,
  hitOf,
  holdingOf,
  hoverOf,
  marksOf,
  NO_HOVER,
  showsContainedSelection,
  showsHover,
  showsSelection,
} from "./boxes.ts";
import { editedElement, GESTURES } from "./editors.ts";
import type { Point } from "./gestures.svelte.ts";
import { itemDrag, listen, memberDrag } from "./gestures.svelte.ts";
import { itemMoveCommand, itemOf, itemsMovedWith, placesAfter } from "./items.ts";
import { drawingMatrix, pointIn, slide } from "./motion.ts";
import { getNodeActions } from "./nodeActions.ts";
import type { BlockNode as BlockNodeType } from "./project.ts";
import { memberOrderAt, reorderCommand, withMemberOrder } from "./reorder.ts";

let { data }: NodeProps<BlockNodeType> = $props();

const actions = getNodeActions();

const width = $derived(data.drawing.width * data.block.scale);
const height = $derived(data.drawing.height * data.block.scale);

/**
 * A descriptor attribute as the DOM receives it: numbers, points and path
 * data are written as the SVG writer writes them; strings are passed as they
 * are, since the DOM escapes nothing it sets through `setAttribute`.
 */
function domValue(value: AttributeValue): string {
  return typeof value === "string" ? value : attributeText(value);
}

function attributesOf(descriptor: Descriptor): Record<string, string> {
  return Object.fromEntries(descriptor.attrs.map(([name, value]) => [name, domValue(value)]));
}

/** The drawn boxes' and boundaries' descriptors. */
const marks = $derived(marksOf(data.drawing, data.descriptors));

function isSelected(descriptor: Descriptor): boolean {
  return showsSelection(marks.get(descriptor), addressOf(descriptor), data.selectedElements);
}

/** The block's own box, and its cards and frames, holding part of the selection. */
const holding = $derived(holdingOf(data.drawing, data.selectedElements));

function holdsSelection(descriptor: Descriptor): boolean {
  return showsContainedSelection(marks.get(descriptor), addressOf(descriptor), holding.boxes);
}

/**
 * The boxes whose mark is drawn: the block's background when the block
 * holds part of the selection, and the cards and frames holding part of it
 * that are not selected themselves, a selected box showing the selection's
 * glow instead. Each mark is drawn over the drawing as a copy of its box's
 * outline, so the box keeps its own stroke and shadow under it.
 */
const boxMarks = $derived(
  data.descriptors.filter((descriptor) =>
    marks.get(descriptor) === "block"
      ? holding.block
      : holdsSelection(descriptor) && !isSelected(descriptor),
  ),
);

/** A mark's outline: its box's rectangle and corner radius. */
function outlineOf(descriptor: Descriptor): Record<string, string> {
  const outline = ["x", "y", "width", "height", "rx"];
  return Object.fromEntries(
    descriptor.attrs
      .filter(([name]) => outline.includes(name))
      .map(([name, value]) => [name, domValue(value)]),
  );
}

/** What the pointer highlights, held by address so that a redraw keeps the marks. */
let hover: Hover = $state.raw(NO_HOVER);

function show(next: Hover): void {
  if (next.box !== hover.box || next.boundary !== hover.boundary) hover = next;
}

/**
 * What the pointer is over: its target and its client position read in the
 * drawing's units. Nothing is read while a button is held: a drag, a pan or
 * a marquee.
 */
function onpointermove(event: PointerEvent & { currentTarget: SVGSVGElement }) {
  if (event.buttons !== 0) return;
  const box = event.currentTarget.getBoundingClientRect();
  const point = drawingPointAt(data.drawing, box, event.clientX, event.clientY);
  if (point === null) return;
  show(hoverOf(hitOf(data.block.id, data.drawing, event.target, point)));
}

function onpointerleave() {
  show(NO_HOVER);
}

function isHovered(descriptor: Descriptor): boolean {
  return showsHover(marks.get(descriptor), addressOf(descriptor), hover, data.inside);
}

/** Whether the element lies under a selected one, and so goes with it on Delete. */
function isAffected(descriptor: Descriptor): boolean {
  const address = addressOf(descriptor);
  return address !== null && data.affectedElements.has(address);
}

/** Whether closing the gap of a segment about to be deleted moves or resizes the element. */
function isMoved(descriptor: Descriptor): boolean {
  const address = addressOf(descriptor);
  return address !== null && data.movedElements.has(address);
}

/**
 * Each descriptor with a key that survives a redraw, `<address>#<tag>#<n>`,
 * `n` counting the earlier descriptors of that address and tag. A reorder
 * of a group's members then moves their elements, which slide to their new
 * places, rather than redrawing them.
 */
function keyed(descriptors: readonly Descriptor[]): { descriptor: Descriptor; key: string }[] {
  const seen = new Map<string, number>();
  return descriptors.map((descriptor) => {
    const pair = `${addressOf(descriptor) ?? ""}#${descriptor.tag}`;
    const n = seen.get(pair) ?? 0;
    seen.set(pair, n + 1);
    return { descriptor, key: `${pair}#${n}` };
  });
}

const entries = $derived(keyed(data.descriptors));

/**
 * Whether the elements slide to their new places when the block is drawn
 * again: only while a member drag previews an order, and through the redraw
 * of its drop or its abort, never under reduced motion. Any other redraw (a
 * resize's preview, an item drag, an edit, an undo) moves them at once, so a
 * preview is always exactly where the pointer put it. Read by `slide`'s
 * parameters when Svelte measures a move, so it is no state.
 */
let sliding = false;

/** `slide`'s parameters for a move measured now. */
function slideParams(): { duration?: number } {
  return sliding && !actions.reducedMotion() ? {} : { duration: 0 };
}

/**
 * What the open editor edits in this block: `null` for the whole block (the
 * bundle editor), `undefined` when no editor is open on this block.
 */
const edited = $derived.by(() => {
  if (data.editing === null) return undefined;
  const { block, element } = editedElement(data.editing.target);
  return block === data.block.id ? element : undefined;
});

/**
 * Whether the element lies outside the edited group or timeline, and so is
 * faded and lets the pointer through. Another block is outside as a whole,
 * through its node; the bundle editor edits everything its block draws.
 */
function isOutside(descriptor: Descriptor): boolean {
  if (edited == null) return false;
  const address = addressOf(descriptor);
  return address === null || !data.inside.has(address);
}

/** The block as stored, which every command reads; a preview draws `data.block` otherwise. */
function storedBlock(): Block {
  return actions.view().blocks[data.block.id] ?? data.block;
}

/** Select the element `address` of this block alone. */
function select(address: string): void {
  actions.select(`${data.block.id}/${address}`);
}

/** The preview callback of a drag that calls `start` once the press has become a drag. */
function starting<T>(start: () => void, preview: (value: T | null) => void) {
  let dragging = false;
  return (value: T | null) => {
    if (value === null) dragging = false;
    else if (!dragging) {
      dragging = true;
      start();
    }
    preview(value);
  };
}

/**
 * The attachments made, by the item or member they move, so that a redraw
 * of the block, a preview's included, finds the same attachment and leaves
 * the drag in progress.
 */
const gestures = new Map<string, Attachment<SVGElement>>();

function made(key: string, make: () => Attachment<SVGElement>): Attachment<SVGElement> {
  let found = gestures.get(key);
  if (found === undefined) {
    found = make();
    gestures.set(key, found);
  }
  return found;
}

/**
 * Move the item `key` drawn at `address` (a frame, or an ungrouped root's
 * card) in the bundle editor. When the press becomes a drag, an item in the
 * selection moves with every other item in it by the same travel and
 * leaves the selection as it is (`itemsMovedWith`); an item outside it
 * moves alone and is selected.
 */
function itemGesture(key: string, address: string): Attachment<SVGElement> {
  /** The other items the drag in progress moves, read from the selection as it starts. */
  let together: readonly string[] = [];
  const command = (place: Point) =>
    itemMoveCommand(
      actions.view(),
      data.block.id,
      key,
      place.x,
      place.y,
      actions.metrics.metrics,
      together,
    );
  return itemDrag({
    place: () => {
      const { x, y } = itemOf(data.drawing, key).place;
      return { x, y };
    },
    zoom: () => actions.zoom(),
    scale: () => data.block.scale,
    preview: starting<Point>(
      () => {
        const moved = itemsMovedWith(data.block.manifest, data.drawing, data.selectedElements, key);
        together = moved ?? [];
        if (moved === null) select(address);
      },
      (place) => {
        if (place === null) return actions.preview(data.block.id, null);
        const block = storedBlock();
        const moved = command(place);
        actions.preview(block.id, {
          places: moved === null ? block.places : placesAfter(block, moved),
        });
      },
    ),
    command,
    dispatch: (moved) => actions.dispatch(moved),
  });
}

/** The member card dragged in the group editor, drawn at the pointer's offset from its press. */
interface Dragged {
  readonly member: string;
  /** The member drawing's descriptors as the press found them. */
  readonly ghost: readonly Descriptor[];
  readonly offset: Point;
}

let dragged = $state.raw<Dragged | null>(null);

const BOX_MARKS: ReadonlySet<Mark | undefined> = new Set(["card", "shadow", "group"]);

/**
 * The descriptors drawing `member`'s card and what is drawn on it: from its
 * card's first `rect` (its shadow, when it has one) to the next card, shadow
 * or frame of another address.
 */
function memberDrawing(
  descriptors: readonly Descriptor[],
  marked: ReadonlyMap<Descriptor, Mark>,
  member: string,
): Descriptor[] {
  const card = `${member}/card`;
  const start = descriptors.findIndex((descriptor) => addressOf(descriptor) === card);
  if (start < 0) return [];
  const end = descriptors.findIndex(
    (descriptor, index) =>
      index > start && BOX_MARKS.has(marked.get(descriptor)) && addressOf(descriptor) !== card,
  );
  return descriptors.slice(start, end < 0 ? undefined : end);
}

/** The elements of the dragged member where the preview draws it, hidden under the dragged copy. */
const hidden: ReadonlySet<Descriptor> = $derived(
  new Set(dragged === null ? [] : memberDrawing(data.descriptors, marks, dragged.member)),
);

/**
 * Reorder the members of `group` by dragging the card of `member` in the
 * group editor. The order follows the pointer through the drawing as stored
 * at the press; the other cards move apart in the preview while a copy of
 * the dragged member's drawing follows the pointer, the card itself left
 * hidden where it would drop.
 */
function memberGesture(group: string, member: string): Attachment<SVGElement> {
  /** What the press read: the block as stored, its drawing, and the member's drawing. */
  let press: {
    readonly block: Block;
    readonly drawing: Drawing;
    readonly ghost: readonly Descriptor[];
    readonly at: Point;
  } | null = null;
  let offset: Point = { x: 0, y: 0 };
  const drag = memberDrag({
    order: (y) => (press === null ? [] : memberOrderAt(press.drawing, group, member, y)),
    preview: starting<readonly string[]>(
      () => select(`${member}/card`),
      (order) => {
        if (order === null || press === null) {
          dragged = null;
          actions.preview(data.block.id, null);
          // The drop's or the abort's redraw still slides; the next one does not.
          void tick().then(() => {
            sliding = dragged !== null;
          });
          return;
        }
        sliding = true;
        dragged ??= { member, ghost: press.ghost, offset };
        actions.preview(data.block.id, {
          manifest: withMemberOrder(press.block.manifest, group, order),
        });
      },
    ),
    command: (order) => (press === null ? null : reorderCommand(press.block, group, order)),
    dispatch: (command) => actions.dispatch(command),
  });

  return (element) => {
    let stops: (() => void)[] = [];
    function unlisten(): void {
      for (const stop of stops) stop();
      stops = [];
    }
    /**
     * The pointer's point in drawing units, through the drawing's screen CTM
     * of the moment: the card itself may be sliding to its previewed slot.
     */
    function pointOf(event: PointerEvent): Point | null {
      const matrix = drawingMatrix(element);
      return matrix === null ? null : pointIn(matrix, event.clientX, event.clientY);
    }
    function follow(event: PointerEvent): void {
      const point = pointOf(event);
      if (press === null || point === null) return;
      offset = { x: point.x - press.at.x, y: point.y - press.at.y };
      if (dragged !== null) dragged = { ...dragged, offset };
    }
    // Registered after the drag's own listeners, so the drag reads the press first and last.
    const stopDrag = drag(element);
    function pressed(event: PointerEvent): void {
      const at = pointOf(event);
      const view = element.ownerDocument.defaultView;
      if (event.button !== 0 || at === null || view === null) return;
      unlisten();
      offset = { x: 0, y: 0 };
      press = {
        block: storedBlock(),
        drawing: data.drawing,
        ghost: memberDrawing(data.descriptors, marks, member),
        at,
      };
      const end = (ended: PointerEvent) => {
        if (ended.pointerId !== event.pointerId) return;
        unlisten();
        press = null;
      };
      const capture = { capture: true };
      stops = [
        listen(view, "pointermove", follow, capture),
        listen(view, "pointerup", end, capture),
        listen(view, "pointercancel", end, capture),
      ];
    }
    const stopPress = listen(element, "pointerdown", pressed);
    return () => {
      stopDrag?.();
      stopPress();
      unlisten();
    };
  };
}

/**
 * The gesture a descriptor carries, by the editor open on this block: the
 * item drag on a frame's or an ungrouped root's card's `rect` in the bundle
 * editor, the member drag on a member's card in the group editor of its
 * group, none elsewhere.
 */
function gestureOf(descriptor: Descriptor): Attachment<SVGElement> | undefined {
  if (edited === undefined || data.editing === null) return undefined;
  const allowed = GESTURES[data.editing.kind];
  const mark = marks.get(descriptor);
  const address = addressOf(descriptor);
  if (address === null || (mark !== "card" && mark !== "group")) return undefined;
  if (edited === null && allowed.moveItems) {
    const item = data.drawing.items.find((drawn) => drawn.address === address);
    return item === undefined
      ? undefined
      : made(`item ${item.key}`, () => itemGesture(item.key, address));
  }
  if (edited !== null && allowed.reorderMembers && mark === "card") {
    const group = edited;
    const member = address.slice(0, -"/card".length);
    const members = data.block.manifest.groups.find((found) => found.id === group)?.members;
    return members?.includes(member)
      ? made(`member ${group} ${member}`, () => memberGesture(group, member))
      : undefined;
  }
  return undefined;
}

/** A dragged copy's attributes: those of its descriptor, its address left out. */
function ghostAttributesOf(descriptor: Descriptor): Record<string, string> {
  const { "data-address": _, ...attributes } = attributesOf(descriptor);
  return attributes;
}
</script>

<div
  class="tilie-block"
  data-contains-selection={holding.block ? "" : undefined}
>
  <!--
    The pointer handlers only show which box or boundary the pointer is
    over; they act on nothing, so the drawing keeps its own role.
  -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <svg
    {width}
    {height}
    viewBox="0 0 {data.drawing.width} {data.drawing.height}"
    {onpointermove}
    {onpointerleave}
  >
    {#each entries as { descriptor, key } (key)}
      <svelte:element
        this={descriptor.tag}
        {...attributesOf(descriptor)}
        visibility={hidden.has(descriptor) ? "hidden" : undefined}
        data-selected={isSelected(descriptor) ? "" : undefined}
        data-contains-selection={holdsSelection(descriptor) ? "" : undefined}
        data-affected={isAffected(descriptor) ? "" : undefined}
        data-moved={isMoved(descriptor) ? "" : undefined}
        data-hovered={isHovered(descriptor) ? "" : undefined}
        data-outside={isOutside(descriptor) ? "" : undefined}
        {@attach gestureOf(descriptor)}
        animate:slide={slideParams()}>{descriptor.text}</svelte:element
      >
    {/each}
    {#each boxMarks as descriptor (descriptor)}
      <rect
        class="tilie-holding"
        data-box={marks.get(descriptor)}
        {...outlineOf(descriptor)}
        aria-hidden="true"
      />
    {/each}
    {#if dragged !== null}
      <g
        class="tilie-dragged"
        transform="translate({dragged.offset.x} {dragged.offset.y})"
        pointer-events="none"
        aria-hidden="true"
      >
        {#each dragged.ghost as descriptor (descriptor)}
          <svelte:element this={descriptor.tag} {...ghostAttributesOf(descriptor)}
            >{descriptor.text}</svelte:element
          >
        {/each}
      </g>
    {/if}
  </svg>
</div>
