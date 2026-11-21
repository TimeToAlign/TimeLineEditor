<script lang="ts">
import { flagPlace, POLE_WIDTH } from "./coordinates.ts";
import type { MatchFlagGroup } from "./matches.ts";

interface Props {
  /** The hovered MatchStamp's timestamps, one group per timeline, in screen order (`matchFlag`). */
  groups: readonly MatchFlagGroup[];
  /** Where the hovered line or connector is, in pixels from the canvas's top-left corner. */
  x: number;
  y: number;
  /** The top of what is hovered, in the same pixels: the pole rises above it. */
  top: number;
  /** The canvas's width in pixels: a flag that would leave it there opens to the left. */
  width: number;
}

let { groups, x, y, top, width }: Props = $props();

let flagWidth = $state(0);

const place = $derived(flagPlace({ x, y, top }, flagWidth, width));
</script>

<!-- The Timestamp flag's look and place, with two timestamps or more. -->
<div class="tilie-coordinates" data-testid="match-flag">
  <div
    class="tilie-coordinates-pole"
    data-testid="match-pole"
    style:left="{place.pole.x - POLE_WIDTH / 2}px"
    style:width="{POLE_WIDTH}px"
    style:top="{place.pole.top}px"
    style:height="{place.pole.bottom - place.pole.top}px"
  ></div>
  <div
    class="tilie-coordinates-flag"
    role="group"
    aria-label="MatchStamp"
    data-flipped={place.flipped}
    style:left="{place.left}px"
    style:top="{place.top}px"
    bind:offsetWidth={flagWidth}
  >
    {#each groups as group (group.timeline)}
      <div class="tilie-coordinates-part" data-timeline={group.timeline}>
        <div class="tilie-coordinates-head">{group.name}</div>
        {#each group.rows as row (row.coordinate)}
          <div class="tilie-coordinates-row">
            <span class="tilie-coordinates-name">coordinate</span>
            <span class="tilie-coordinates-value" data-testid="match-coordinate">{row.text}</span>
          </div>
        {/each}
      </div>
    {/each}
    <div class="tilie-coordinates-foot">click to pin</div>
  </div>
</div>
