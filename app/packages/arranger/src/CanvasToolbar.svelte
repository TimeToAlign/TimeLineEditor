<script lang="ts">
import type { Viewport } from "@xyflow/svelte";
import { useSvelteFlow } from "@xyflow/svelte";
import { roving } from "./roving.ts";

/** The canvas lock and the marquee toggle; both are the viewer's own state. */
let { locked = $bindable(), marquee = $bindable() }: { locked: boolean; marquee: boolean } =
  $props();

const flow = useSvelteFlow();

/** Zoom in one step. */
export function zoomIn(): void {
  void flow.zoomIn();
}

/** Zoom out one step. */
export function zoomOut(): void {
  void flow.zoomOut();
}

/** Fit every block into the view. */
export function fit(): void {
  void flow.fitView();
}

/**
 * Show the canvas at `viewport`. Svelte Flow keeps its own pan and zoom
 * state, so a viewport is set through it rather than by writing the bound value.
 */
export function setViewport(viewport: Viewport): void {
  void flow.setViewport(viewport);
}
</script>

<div class="toolbar" role="toolbar" aria-label="Canvas" {@attach roving}>
  <button
    type="button"
    data-testid="lock"
    aria-pressed={locked}
    title="Lock the canvas: dragging pans instead of moving blocks (L)"
    onclick={() => (locked = !locked)}>Lock</button
  >
  <button
    type="button"
    data-testid="marquee"
    aria-pressed={marquee}
    aria-label="Add to selection (marquee)"
    title="Add to selection: dragging on the canvas draws a marquee, and clicks and marquees add to the selection"
    onclick={() => (marquee = !marquee)}>Marquee</button
  >
  <button type="button" aria-label="Zoom in" title="Zoom in (+)" onclick={zoomIn}>+</button>
  <button type="button" aria-label="Zoom out" title="Zoom out (-)" onclick={zoomOut}>−</button>
  <button type="button" aria-label="Fit to view" title="Fit to view (0)" onclick={fit}>Fit</button>
</div>

<style>
  .toolbar {
    display: flex;
    gap: 2px;
    padding: 2px 0.5rem;
    background: #fff;
    border-bottom: 1px solid #d0d0d0;
  }

  button {
    min-width: 32px;
    min-height: 32px;
    padding: 0 0.5rem;
    border: 1px solid transparent;
    border-radius: 3px;
    background: none;
    font: inherit;
    color: inherit;
    cursor: pointer;
  }

  button:hover {
    background: #f0f0f0;
  }

  button[aria-pressed="true"] {
    background: #dcebff;
    border-color: #0a84ff;
  }

  button:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }
</style>
