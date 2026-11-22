<script lang="ts">
import { attributeText } from "@timetoalign/tilie-writers";
import { ViewportPortal } from "@xyflow/svelte";
import type { MatchLayer } from "./matches.ts";
import {
  fadedPathsOf,
  HOVERED_STROKE,
  MATCH_DASH,
  MATCH_STROKE_WIDTH,
  POTENTIAL_OPACITY,
  POTENTIAL_STROKE,
  pathOf,
} from "./matches.ts";

/**
 * "Show matches": per block, the potential MatchStamps' cross-section lines
 * and connectors in light grey, the hovered MatchStamp's over them in dark
 * grey, the pinned one's on top: its lines in the cross-section blue, its
 * connectors by the user's belief in their MatchClaims, a path per colour
 * (`pinnedOverlays`). Each is one path, and one more per other opacity of
 * its lines (`fadedPathsOf`: a groupstamp's piece over a member card where
 * the group gives no value), drawn at that opacity in place of its own;
 * all drawn in its block's drawing units in an `<svg>` laid over the block's
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
      <!--
        Its own derived: a layer redrawn for another hovered or pinned
        MatchStamp keeps its potential overlay, so this path stays as written.
      -->
      {@const potential = pathOf(layer.potential)}
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
          d={potential}
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
          {#each fadedPathsOf(layer.hovered) as faded (faded.opacity)}
            <path
              data-match="hovered"
              d={faded.d}
              fill="none"
              stroke={HOVERED_STROKE}
              stroke-width={width}
              stroke-dasharray={MATCH_DASH}
              opacity={attributeText(faded.opacity)}
            />
          {/each}
        {/if}
        {#each layer.pinned as part (part.belief)}
          <path
            data-match="pinned"
            data-belief={part.belief}
            d={pathOf(part.overlay)}
            fill="none"
            stroke={part.stroke}
            stroke-width={width}
            stroke-dasharray={MATCH_DASH}
          />
          {#each fadedPathsOf(part.overlay) as faded (faded.opacity)}
            <path
              data-match="pinned"
              data-belief={part.belief}
              d={faded.d}
              fill="none"
              stroke={part.stroke}
              stroke-width={width}
              stroke-dasharray={MATCH_DASH}
              opacity={attributeText(faded.opacity)}
            />
          {/each}
        {/each}
      </svg>
    {/each}
  </ViewportPortal>
{/if}
