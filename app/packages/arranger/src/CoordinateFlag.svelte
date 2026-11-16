<script lang="ts">
import type { Pin, Row } from "@timetoalign/tilie-core";
import { flagParts, flagPlace, POLE_WIDTH, rowValueText } from "./coordinates.ts";

interface Props {
  /** The pin the hovered position makes: its timestamp is shown, part by part. */
  pin: Pin;
  /** The hovered row, highlighted: the line's coordinate or one map's value. */
  hovered: Row;
  /** Where the position lies on the line, in pixels from the canvas's top-left corner. */
  x: number;
  y: number;
  /** The topmost ordinate of the line, its maps and its cross-section line, in the same pixels. */
  top: number;
  /** The canvas's width in pixels: a flag that would leave it there opens to the left. */
  width: number;
}

let { pin, hovered, x, y, top, width }: Props = $props();

/** The places a float is shown with: the granularity's. */
const decimals = $derived(pin.timestamp.granularity.decimals);
const parts = $derived(flagParts(pin));

let flagWidth = $state(0);

const place = $derived(flagPlace({ x, y, top }, flagWidth, width));

/** Whether `row` is the hovered one. */
function isHovered(row: Row): boolean {
  return row.timeline === hovered.timeline && row.map === hovered.map;
}
</script>

<div class="tilie-coordinates" data-testid="coordinate-flag">
  <div
    class="tilie-coordinates-pole"
    data-testid="coordinate-pole"
    style:left="{place.pole.x - POLE_WIDTH / 2}px"
    style:width="{POLE_WIDTH}px"
    style:top="{place.pole.top}px"
    style:height="{place.pole.bottom - place.pole.top}px"
  ></div>
  <div
    class="tilie-coordinates-flag"
    role="group"
    aria-label="Coordinates"
    data-flipped={place.flipped}
    style:left="{place.left}px"
    style:top="{place.top}px"
    bind:offsetWidth={flagWidth}
  >
    {#each parts as part (part.timeline)}
      <div class="tilie-coordinates-part" data-timeline={part.timeline}>
        <div class="tilie-coordinates-head">{part.name}</div>
        {#each part.rows as item (item.row.map)}
          <div
            class="tilie-coordinates-row"
            data-map={item.row.map ?? undefined}
            data-hovered={isHovered(item.row)}
          >
            <span class="tilie-coordinates-name">{item.row.map === null ? "coordinate" : item.label}</span>
            <span class="tilie-coordinates-value" data-testid={item.row.map === null ? "coordinate" : undefined}
              >{rowValueText(item, decimals)}</span
            >
          </div>
        {/each}
      </div>
    {/each}
    <div class="tilie-coordinates-foot" data-testid="coordinate-footer">click to pin</div>
  </div>
</div>
