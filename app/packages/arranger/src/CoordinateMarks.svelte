<script lang="ts">
import { crossSection, type Style, wedgeAt } from "@timetoalign/tilie-layout";
import { attributeText } from "@timetoalign/tilie-writers";
import { ViewportPortal } from "@xyflow/svelte";
import type { PlacedMarks } from "./coordinates.ts";

/**
 * The wedge and the cross-section line of the hovered position and of the
 * pinned unnamed timestamp, each as a named timestamp lying there draws its
 * own (layout's `wedgeAt` and `crossSection`, with their resolved styles).
 * Each is drawn in its block's drawing units, in an `<svg>` laid over the
 * block's node exactly as the node's own, so strokes and dashes scale with
 * the zoom as the drawing's do. They never take the pointer.
 */
let { marks }: { marks: readonly PlacedMarks[] } = $props();

/** A style's opacity as an attribute: none where it is 1, as the writers leave it out. */
function opacityOf(style: Style): string | undefined {
  return style.opacity === 1 ? undefined : attributeText(style.opacity);
}
</script>

{#if marks.length > 0}
  <ViewportPortal target="front" class="tilie-overlay">
    {#each marks as mark (mark.kind)}
      {@const wedge = wedgeAt(mark.drawing, mark.key, mark.x)}
      {@const line = crossSection(mark.drawing, mark.key, mark.x)}
      <svg
        class="tilie-coordinate-marks"
        data-mark={mark.kind}
        style:left="{mark.origin.x}px"
        style:top="{mark.origin.y}px"
        width={mark.drawing.width * mark.scale}
        height={mark.drawing.height * mark.scale}
        viewBox="0 0 {mark.drawing.width} {mark.drawing.height}"
        aria-hidden="true"
      >
        {#if wedge !== null}
          <polygon
            data-testid="coordinate-wedge"
            points={attributeText(wedge.points)}
            fill={wedge.style.fill}
            opacity={opacityOf(wedge.style)}
          />
        {/if}
        {#if line !== null}
          <line
            data-testid="coordinate-line"
            x1={attributeText(line.x)}
            y1={attributeText(line.y1)}
            x2={attributeText(line.x)}
            y2={attributeText(line.y2)}
            stroke={line.style.stroke}
            stroke-width={attributeText(line.style["stroke-width"])}
            stroke-dasharray={line.style["stroke-dasharray"] === "none"
              ? undefined
              : line.style["stroke-dasharray"]}
            opacity={opacityOf(line.style)}
          />
        {/if}
      </svg>
    {/each}
  </ViewportPortal>
{/if}
