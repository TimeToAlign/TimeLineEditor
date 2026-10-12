<script lang="ts">
import type { Viewport } from "@xyflow/svelte";
import { ControlButton, Controls, useSvelteFlow } from "@xyflow/svelte";
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
 * Fit the blocks into the view when there are any. A fit with none would
 * wait for the first block and then move the view.
 */
function fitBlocks(): void {
  if (flow.getNodes().length > 0) fit();
}

/**
 * Show the canvas at `viewport`. Svelte Flow keeps its own pan and zoom
 * state, so a viewport is set through it rather than by writing the bound value.
 */
export function setViewport(viewport: Viewport): void {
  void flow.setViewport(viewport);
}
</script>

<!--
  Svelte Flow's controls panel with our own buttons only: its zoom and fit
  buttons carry no key hints, and its lock toggles all interactivity, while
  ours freezes placement alone (selection, zoom and pan stay). The icons are
  Svelte Flow's (@xyflow/svelte 1.7.0, MIT licence, (c) webkid GmbH), whose
  icon components the package does not export; the marquee icon is ours.
-->
<Controls
  position="bottom-left"
  orientation="vertical"
  showZoom={false}
  showFitView={false}
  showLock={false}
  role="toolbar"
  aria-label="Canvas"
  aria-orientation="vertical"
  {@attach roving}
>
  <ControlButton aria-label="Zoom in" title="Zoom in (+)" onclick={zoomIn}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M32 18.133H18.133V32h-4.266V18.133H0v-4.266h13.867V0h4.266v13.867H32z" />
    </svg>
  </ControlButton>
  <ControlButton aria-label="Zoom out" title="Zoom out (-)" onclick={zoomOut}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 5" aria-hidden="true">
      <path d="M0 0h32v4.2H0z" />
    </svg>
  </ControlButton>
  <ControlButton aria-label="Fit to view" title="Fit to view (0)" onclick={fitBlocks}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 30" aria-hidden="true">
      <path
        d="M3.692 4.63c0-.53.4-.938.939-.938h5.215V0H4.708C2.13 0 0 2.054 0 4.63v5.216h3.692V4.631zM27.354 0h-5.2v3.692h5.17c.53 0 .984.4.984.939v5.215H32V4.631A4.624 4.624 0 0027.354 0zm.954 24.83c0 .532-.4.94-.939.94h-5.215v3.768h5.215c2.577 0 4.631-2.13 4.631-4.707v-5.139h-3.692v5.139zm-23.677.94c-.531 0-.939-.4-.939-.94v-5.138H0v5.139c0 2.577 2.13 4.707 4.708 4.707h5.138V25.77H4.631z"
      />
    </svg>
  </ControlButton>
  <ControlButton
    class="tilie-toggle"
    data-testid="lock"
    aria-pressed={locked}
    aria-label="Lock the canvas"
    title="Lock the canvas: dragging pans instead of moving blocks (L)"
    onclick={() => (locked = !locked)}
  >
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 32" aria-hidden="true">
      {#if locked}
        <path
          d="M21.333 10.667H19.81V7.619C19.81 3.429 16.38 0 12.19 0 8 0 4.571 3.429 4.571 7.619v3.048H3.048A3.056 3.056 0 000 13.714v15.238A3.056 3.056 0 003.048 32h18.285a3.056 3.056 0 003.048-3.048V13.714a3.056 3.056 0 00-3.048-3.047zM12.19 24.533a3.056 3.056 0 01-3.047-3.047 3.056 3.056 0 013.047-3.048 3.056 3.056 0 013.048 3.048 3.056 3.056 0 01-3.048 3.047zm4.724-13.866H7.467V7.619c0-2.59 2.133-4.724 4.723-4.724 2.591 0 4.724 2.133 4.724 4.724v3.048z"
        />
      {:else}
        <path
          d="M21.333 10.667H19.81V7.619C19.81 3.429 16.38 0 12.19 0c-4.114 1.828-1.37 2.133.305 2.438 1.676.305 4.42 2.59 4.42 5.181v3.048H3.047A3.056 3.056 0 000 13.714v15.238A3.056 3.056 0 003.048 32h18.285a3.056 3.056 0 003.048-3.048V13.714a3.056 3.056 0 00-3.048-3.047zM12.19 24.533a3.056 3.056 0 01-3.047-3.047 3.056 3.056 0 013.047-3.048 3.056 3.056 0 013.048 3.048 3.056 3.056 0 01-3.048 3.047z"
        />
      {/if}
    </svg>
  </ControlButton>
  <ControlButton
    class="tilie-toggle"
    data-testid="marquee"
    aria-pressed={marquee}
    aria-label="Add to selection (marquee)"
    title="Add to selection: dragging on the canvas draws a marquee, and clicks and marquees add to the selection"
    onclick={() => (marquee = !marquee)}
  >
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true">
      <rect
        x="2"
        y="2"
        width="28"
        height="28"
        fill="none"
        stroke="currentColor"
        stroke-width="4"
        stroke-dasharray="6 4"
      />
    </svg>
  </ControlButton>
</Controls>

<style>
  /* A pressed toggle: a shade darker, its icon in the selection's blue. */
  :global(.svelte-flow__controls-button.tilie-toggle[aria-pressed="true"]) {
    background: #e2e2e2;
    color: #0a6ad6;
  }

  :global(.svelte-flow__controls-button:focus-visible) {
    outline: 2px solid #0a84ff;
    outline-offset: -2px;
  }
</style>
