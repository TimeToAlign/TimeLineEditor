<script lang="ts">
import type { AttributeValue, Descriptor } from "@timetoalign/tilie-writers";
import { attributeText } from "@timetoalign/tilie-writers";
import type { NodeProps } from "@xyflow/svelte";
import type { Hover } from "./boxes.ts";
import {
  addressOf,
  hitOf,
  hoverOf,
  marksOf,
  NO_HOVER,
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
  data-contains-selection={data.containsSelection ? "" : undefined}
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
        data-affected={isAffected(descriptor) ? "" : undefined}
        data-moved={isMoved(descriptor) ? "" : undefined}
        data-hovered={isHovered(descriptor) ? "" : undefined}>{descriptor.text}</svelte:element
      >
    {/each}
  </svg>
</div>
