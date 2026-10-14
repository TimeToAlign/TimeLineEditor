<script lang="ts">
import type { AttributeValue, Descriptor } from "@timetoalign/tilie-writers";
import { attributeText } from "@timetoalign/tilie-writers";
import type { NodeProps } from "@xyflow/svelte";
import { boundaryOf, cardAt, hoverablesOf } from "./hover.ts";
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

function addressOf(descriptor: Descriptor): string | undefined {
  const value = descriptor.attrs.find(([name]) => name === "data-address")?.[1];
  return typeof value === "string" ? value : undefined;
}

function isSelected(descriptor: Descriptor): boolean {
  const address = addressOf(descriptor);
  return address !== undefined && data.selectedElements.has(address);
}

/** The card the pointer is over, by its address; `null` while it is over none. */
let hoveredCard: string | null = $state(null);
/** The boundary the pointer is over, by its address, so a redraw keeps the mark. */
let hoveredBoundary: string | null = $state(null);

const hoverables = $derived(hoverablesOf(data.drawing, data.descriptors));

/**
 * The card under the pointer, its client position read in the drawing's
 * units. Nothing is read while a button is held: a drag, a pan or a marquee.
 */
function onpointermove(event: PointerEvent & { currentTarget: SVGSVGElement }) {
  if (event.buttons !== 0) return;
  const box = event.currentTarget.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return;
  const x = ((event.clientX - box.left) * data.drawing.width) / box.width;
  const y = ((event.clientY - box.top) * data.drawing.height) / box.height;
  hoveredCard = cardAt(data.drawing, x, y);
}

/** The boundary whose line the pointer has entered, or none. */
function onpointerover({ buttons, target }: PointerEvent) {
  if (buttons !== 0 || !(target instanceof Element)) return;
  hoveredBoundary = boundaryOf(data.drawing, target.localName, target.getAttribute("data-address"));
}

function onpointerleave() {
  hoveredCard = null;
  hoveredBoundary = null;
}

function isHovered(descriptor: Descriptor): boolean {
  switch (hoverables.get(descriptor)) {
    case "card":
      return addressOf(descriptor) === hoveredCard;
    case "boundary":
      return addressOf(descriptor) === hoveredBoundary;
    case undefined:
      return false;
  }
}

/** Whether the element lies under a selected one, and so goes with it on Delete. */
function isAffected(descriptor: Descriptor): boolean {
  const address = addressOf(descriptor);
  return address !== undefined && data.affectedElements.has(address);
}
</script>

<div
  class="tilie-block"
  data-contains-selection={data.containsSelection ? "" : undefined}
>
  <!--
    The pointer handlers only show which card or boundary the pointer is
    over; they act on nothing, so the drawing keeps its own role.
  -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <svg
    {width}
    {height}
    viewBox="0 0 {data.drawing.width} {data.drawing.height}"
    {onpointermove}
    {onpointerover}
    {onpointerleave}
  >
    {#each data.descriptors as descriptor (descriptor)}
      <svelte:element
        this={descriptor.tag}
        {...attributesOf(descriptor)}
        data-selected={isSelected(descriptor) ? "" : undefined}
        data-affected={isAffected(descriptor) ? "" : undefined}
        data-hovered={isHovered(descriptor) ? "" : undefined}>{descriptor.text}</svelte:element
      >
    {/each}
  </svg>
</div>
