<script lang="ts">
import { ViewportPortal } from "@xyflow/svelte";
import type { Guide } from "./snap.ts";

/** The guides of the snap in progress, in canvas units, and the current zoom. */
let { guides, zoom }: { guides: readonly Guide[]; zoom: number } = $props();

/** How far a guide reaches above and below the canvas origin, in canvas units. */
const REACH = 1e6;
</script>

{#if guides.length > 0}
  <ViewportPortal target="front" class="tilie-overlay">
    {#each guides as guide (guide)}
      <div
        class="guide"
        data-testid="snap-guide"
        style:left="{guide.at}px"
        style:top="{-REACH}px"
        style:height="{2 * REACH}px"
        style:width="{1 / zoom}px"
        style:margin-left="{-0.5 / zoom}px"
      ></div>
    {/each}
  </ViewportPortal>
{/if}

<style>
  .guide {
    position: absolute;
    background: #e8336d;
    pointer-events: none;
  }
</style>
