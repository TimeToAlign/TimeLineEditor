<svelte:options namespace="svg" />

<script lang="ts">
/*
 * The ribbons of the hovered and selected chunks of virtual cards and the
 * other chunks of their sources lit (`ribbons.ts`): an overlay over a
 * block's drawing, like the marks, drawn without addresses and letting the
 * pointer through, never part of the drawing or its exports. The ribbons
 * fade in, at once under reduced motion.
 */
import type { LitChunk, Ribbon } from "./ribbons.ts";

interface Props {
  ribbons: readonly Ribbon[];
  lit: readonly LitChunk[];
}

let { ribbons, lit }: Props = $props();
</script>

{#if ribbons.length > 0 || lit.length > 0}
  <g class="tilie-ribbons" data-testid="ribbons" pointer-events="none" aria-hidden="true">
    {#each ribbons as ribbon (ribbon.key)}
      <path class="tilie-ribbon" data-ribbon={ribbon.key} d={ribbon.d} />
    {/each}
    {#each lit as label (label.key)}
      <svelte:element this={label.tag} {...label.attributes} class="tilie-lit" data-lit={label.key} />
    {/each}
  </g>
{/if}

<style>
  /* The editor marks' blue, translucent, so the drawing shows through. */
  .tilie-ribbon {
    fill: #0a84ff;
    fill-opacity: 0.16;
    stroke: #0a84ff;
    stroke-opacity: 0.45;
    stroke-width: calc(1px / var(--tilie-zoom, 1));
    vector-effect: non-scaling-stroke;
    animation: tilie-ribbon-in 120ms ease-out;
  }

  .tilie-lit {
    fill: none;
    stroke: #0a84ff;
    stroke-width: calc(3px / var(--tilie-zoom, 1));
    vector-effect: non-scaling-stroke;
  }

  @keyframes tilie-ribbon-in {
    from {
      fill-opacity: 0;
      stroke-opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tilie-ribbon {
      animation: none;
    }
  }
</style>
