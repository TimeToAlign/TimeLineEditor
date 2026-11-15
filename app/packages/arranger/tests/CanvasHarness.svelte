<script lang="ts">
/* The canvas on a store, its selection and viewport held here so a test can read and set them. */
import type { Manifest, MeasureKnots, Pin, Store } from "@timetoalign/tilie-core";
import type { FontMetrics } from "@timetoalign/timetoshare";
import type { Viewport } from "@xyflow/svelte";
import Canvas from "../src/Canvas.svelte";
import { liveStore } from "../src/liveStore.svelte.ts";
import type { ResizeMode } from "../src/resize.ts";
import { NOTHING_SELECTED, type Selection } from "../src/selection.ts";

let {
  store,
  metrics,
  oncoordinatepin = () => {},
  measureMaps,
}: {
  store: Store;
  metrics: FontMetrics;
  oncoordinatepin?: (pin: Pin | null) => void;
  measureMaps?: (manifest: string) => Promise<readonly MeasureKnots[] | "unsupported">;
} = $props();

const live = $derived(liveStore(store));
let selection: Selection = $state(NOTHING_SELECTED);
let viewport: Viewport = $state({ x: 0, y: 0, zoom: 1 });
let locked = $state(false);
let mode: ResizeMode = $state("box");
let canvas: ReturnType<typeof Canvas> | undefined = $state();
let pinned: Pin | null = $state.raw(null);

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

/** The manifest whose MeasureMaps `knotsRead` reads through the canvas, as the editor's drawer does. */
let knotsManifest: Manifest | null = $state.raw(null);
const knotsRead = $derived(knotsManifest === null ? undefined : canvas?.knotsOf(knotsManifest));

/** The canvas's MeasureMaps of `manifest`, read once from outside any reaction. */
export function knotsOf(manifest: Manifest) {
  return canvas?.knotsOf(manifest);
}

/** Read the MeasureMaps of `manifest` in a reaction from now on; `read` gives what it holds. */
export function readKnots(manifest: Manifest): void {
  knotsManifest = manifest;
}

export function read() {
  return knotsRead;
}

/** Give the canvas `next` as its pinned timestamp, as the editor does. */
export function pin(next: Pin | null): void {
  pinned = next;
}
</script>

<div style="width: 1000px; height: 600px">
  <Canvas
    bind:this={canvas}
    {live}
    {metrics}
    bind:selection
    bind:viewport
    bind:locked
    bind:mode
    {pinned}
    {oncoordinatepin}
    {measureMaps}
  />
</div>
