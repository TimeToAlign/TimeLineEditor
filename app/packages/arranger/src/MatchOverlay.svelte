<script lang="ts">
import { attributeText } from "@timetoalign/tilie-writers";
import { ViewportPortal } from "@xyflow/svelte";
import type { MatchLayer } from "./matches.ts";
import {
  HOVERED_STROKE,
  MATCH_DASH,
  MATCH_STROKE_WIDTH,
  PINNED_STROKE,
  POTENTIAL_OPACITY,
  POTENTIAL_STROKE,
  pathOf,
} from "./matches.ts";

/**
 * "Show matches": per block, the potential MatchStamps' cross-section lines
 * and connectors in light grey, the hovered MatchStamp's over them in dark
 * grey, the pinned one's in the cross-section blue on top. Each is one path,
 * drawn in its block's drawing units in an `<svg>` laid over the block's
 * node exactly as the node's own, so strokes and dashes scale with the zoom
 * as the drawing's do. They never take the pointer: the canvas reads what
 * the pointer hovers from the same geometry.
 */
let { layers }: { layers: readonly MatchLayer[] } = $props();

const width = attributeText(MATCH_STROKE_WIDTH);
</script>

{#if layers.length > 0}
  <ViewportPortal target="front" class="tilie-overlay">
    {#each layers as layer (layer.block)}
      <svg
        class="tilie-coordinate-marks"
        data-matches={layer.block}
        style:left="{layer.origin.x}px"
        style:top="{layer.origin.y}px"
        width={layer.width * layer.scale}
        height={layer.height * layer.scale}
        viewBox="0 0 {layer.width} {layer.height}"
        aria-hidden="true"
      >
        <path
          data-match="potential"
          d={pathOf(layer.potential)}
          fill="none"
          stroke={POTENTIAL_STROKE}
          stroke-width={width}
          stroke-dasharray={MATCH_DASH}
          opacity={attributeText(POTENTIAL_OPACITY)}
        />
        {#if layer.hovered !== null}
          <path
            data-match="hovered"
            d={pathOf(layer.hovered)}
            fill="none"
            stroke={HOVERED_STROKE}
            stroke-width={width}
            stroke-dasharray={MATCH_DASH}
          />
        {/if}
        {#if layer.pinned !== null}
          <path
            data-match="pinned"
            d={pathOf(layer.pinned)}
            fill="none"
            stroke={PINNED_STROKE}
            stroke-width={width}
            stroke-dasharray={MATCH_DASH}
          />
        {/if}
      </svg>
    {/each}
  </ViewportPortal>
{/if}
