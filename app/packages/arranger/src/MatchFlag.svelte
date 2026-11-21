<script lang="ts">
import Flag from "./Flag.svelte";
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
</script>

<!-- The Timestamp flag's look and place, with two timestamps or more. -->
<Flag kind="match" label="MatchStamp" {x} {y} {top} {width}>
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
</Flag>
