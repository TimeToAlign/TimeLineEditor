<script lang="ts">
import type { AttributeValue, Descriptor } from "@timetoalign/tilie-writers";
import { attributeText } from "@timetoalign/tilie-writers";
import type { NodeProps } from "@xyflow/svelte";
import type { Hover } from "./boxes.ts";
import {
  addressOf,
  hitOf,
  holdingOf,
  hoverOf,
  marksOf,
  NO_HOVER,
  showsContainedSelection,
  showsHover,
  showsSelection,
} from "./boxes.ts";
import type { BlockNode as BlockNodeType } from "./project.ts";

let { data }: NodeProps<BlockNodeType> = $props();

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
  if (box.width === 0 || box.height === 0) return;
  const point = {
    x: ((event.clientX - box.left) * data.drawing.width) / box.width,
    y: ((event.clientY - box.top) * data.drawing.height) / box.height,
  };
  show(hoverOf(hitOf(data.block.id, data.drawing, event.target, point)));
}

function onpointerleave() {
  show(NO_HOVER);
}

function isHovered(descriptor: Descriptor): boolean {
  return showsHover(marks.get(descriptor), addressOf(descriptor), hover);
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
    {#each data.descriptors as descriptor (descriptor)}
      <svelte:element
        this={descriptor.tag}
        {...attributesOf(descriptor)}
        data-selected={isSelected(descriptor) ? "" : undefined}
        data-contains-selection={holdsSelection(descriptor) ? "" : undefined}
        data-affected={isAffected(descriptor) ? "" : undefined}
        data-moved={isMoved(descriptor) ? "" : undefined}
        data-hovered={isHovered(descriptor) ? "" : undefined}>{descriptor.text}</svelte:element
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
  </svg>
</div>
