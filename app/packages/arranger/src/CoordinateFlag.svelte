<script lang="ts">
import type { Timestamp } from "@timetoalign/tilie-core";
import { displayValue, unitSymbol } from "@timetoalign/tilie-core";
import { mapValueText } from "./coordinates.ts";

interface Props {
  /** The timestamp shown: the line's part, then the segment's. */
  timestamp: Timestamp;
  /** The ID of the hovered map, whose row is highlighted; `null` when the line is hovered. */
  hovered: string | null;
  /** The footer: the grid step in use and its base. */
  footer: string;
  /** Where the position lies on the line, in pixels from the canvas's top-left corner. */
  x: number;
  y: number;
  /** The topmost ordinate of the line and its maps, in the same pixels: the flag stands above it. */
  top: number;
  /** The canvas's width in pixels, which the flag keeps inside. */
  width: number;
}

let { timestamp, hovered, footer, x, y, top, width }: Props = $props();

/** The length of the pole from the topmost map to the flag. */
const POLE = 22;
/** The flag's margin from the canvas's edges. */
const EDGE = 6;

let flagWidth = $state(0);
let flagHeight = $state(0);

/** Above the line's maps when there is room, else below the line. */
const above = $derived(top - POLE - flagHeight >= EDGE - 2);
const left = $derived.by(() => {
  const right = x - 14 + flagWidth > width - EDGE ? x + 14 - flagWidth : x - 14;
  return Math.max(EDGE, right);
});
const flagTop = $derived(above ? top - POLE - flagHeight : y + POLE);
const pole = $derived(
  above ? { top: top - POLE, height: y - (top - POLE) - 4 } : { top: y + 4, height: POLE - 4 },
);
</script>

<div class="tilie-coordinates" data-testid="coordinate-flag">
  <div class="tilie-coordinates-pole" style:left="{x - 0.5}px" style:top="{pole.top}px" style:height="{pole.height}px"></div>
  <div class="tilie-coordinates-dot" style:left="{x}px" style:top="{y}px"></div>
  <div
    class="tilie-coordinates-flag"
    role="group"
    aria-label="Coordinates"
    style:left="{left}px"
    style:top="{flagTop}px"
    bind:offsetWidth={flagWidth}
    bind:offsetHeight={flagHeight}
  >
    {#each timestamp.parts as part (part.timeline)}
      <div class="tilie-coordinates-part" data-timeline={part.timeline}>
        <div class="tilie-coordinates-head">
          <span class="tilie-coordinates-name">
            {part.name}{#if part.segment}<span class="tilie-coordinates-tag">segment</span>{/if}
          </span>
          <span class="tilie-coordinates-value" data-testid="coordinate"
            >{displayValue(part.position, part.numberType)}<span class="tilie-coordinates-unit"
              >{unitSymbol(part.unit)}</span
            ></span
          >
        </div>
        {#each part.maps as map (map.id)}
          {@const value = mapValueText(map)}
          <div class="tilie-coordinates-row" data-map={map.id} data-hovered={map.id === hovered}>
            <span class="tilie-coordinates-name">{map.name ?? map.id}</span>
            <span class="tilie-coordinates-value"
              >{value.text}{#if value.unit !== null}<span class="tilie-coordinates-unit"
                  >{value.unit}</span
                >{/if}</span
            >
          </div>
        {:else}
          <div class="tilie-coordinates-none">no displayed maps</div>
        {/each}
      </div>
    {/each}
    <div class="tilie-coordinates-foot" data-testid="coordinate-footer">{footer} · click to pin</div>
  </div>
</div>
