<script lang="ts">
/* The canvas on a store, its selection and viewport held here so a test can read and set them. */
import type { Store } from "@timetoalign/tilie-core";
import type { FontMetrics } from "@timetoalign/timetoshare";
import type { Viewport } from "@xyflow/svelte";
import Canvas from "../src/Canvas.svelte";
import { liveStore } from "../src/liveStore.svelte.ts";
import type { ResizeMode } from "../src/resize.ts";
import { NOTHING_SELECTED, type Selection } from "../src/selection.ts";

let { store, metrics }: { store: Store; metrics: FontMetrics } = $props();

const live = $derived(liveStore(store));
let selection: Selection = $state(NOTHING_SELECTED);
let viewport: Viewport = $state({ x: 0, y: 0, zoom: 1 });
let locked = $state(false);
let mode: ResizeMode = $state("box");
let canvas: ReturnType<typeof Canvas> | undefined = $state();

/** The selection and the viewport as the canvas has them now. */
export function current(): { selection: Selection; viewport: Viewport } {
  return { selection, viewport };
}

export function select(next: Selection): void {
  selection = next;
}

export function showAt(next: Viewport): void {
  canvas?.setViewport(next);
}
</script>

<div style="width: 1000px; height: 600px">
  <Canvas bind:this={canvas} {live} {metrics} bind:selection bind:viewport bind:locked bind:mode />
</div>
