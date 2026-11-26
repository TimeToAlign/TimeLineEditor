<script lang="ts">
/*
 * One handle on an edge of something drawn along a timeline's axis: a
 * small square on a hit area, both kept their size on screen at any zoom,
 * centred on `x`, `y` (canvas units) inside a viewport portal. The handles
 * of an elision's gap and of a region's brace; the gesture comes as an
 * attachment and every other attribute is spread on the element.
 */
import type { HTMLAttributes } from "svelte/elements";

interface Props extends HTMLAttributes<HTMLDivElement> {
  x: number;
  y: number;
  zoom: number;
  testid: string;
}

let { x, y, zoom, testid, ...rest }: Props = $props();

/** The hit area of a handle and its visible mark, in screen pixels. */
const HIT = 24;
const MARK = 9;
</script>

<div
  {...rest}
  class="handle nodrag nopan nowheel"
  aria-hidden="true"
  data-testid={testid}
  style:left="{x}px"
  style:top="{y}px"
  style:width="{HIT / zoom}px"
  style:height="{HIT / zoom}px"
  style:--mark="{MARK / zoom}px"
  style:--line="{1 / zoom}px"
></div>

<style>
  .handle {
    position: absolute;
    transform: translate(-50%, -50%);
    touch-action: none;
    pointer-events: all;
    cursor: ew-resize;
  }

  .handle[hidden] {
    display: none;
  }

  /* A handle is a small square on the edge, as the resize handles. */
  .handle::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    width: var(--mark);
    height: var(--mark);
    transform: translate(-50%, -50%);
    box-sizing: border-box;
    background: #fff;
    border: var(--line) solid #0a84ff;
  }
</style>
