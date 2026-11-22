<script lang="ts">
import type { Snippet } from "svelte";
import { flagPlace, POLE_WIDTH } from "./coordinates.ts";
import { onScreen } from "./onScreen.ts";

interface Props {
  /** What the flag shows, naming its test IDs: `<kind>-flag`, `<kind>-pole`, `<kind>-footer`. */
  kind: "coordinate" | "match";
  /** The flag's accessible name. */
  label: string;
  /** Where what the flag marks lies, in pixels from the canvas's top-left corner. */
  x: number;
  y: number;
  /** The top of what the flag marks, in the same pixels: the pole rises above it. */
  top: number;
  /** The canvas's width in pixels: a flag past a border is shifted inside it. */
  width: number;
  /** The flag's parts, above its footer. */
  children: Snippet;
}

let { kind, label, x, y, top, width, children }: Props = $props();

let flagWidth = $state(0);
let flagHeight = $state(0);
/** The canvas's visible height: the flag's layer covers the canvas (`inset: 0`). */
let height = $state(0);

const place = $derived(
  onScreen(flagPlace({ x, y, top }), { width: flagWidth, height: flagHeight }, { width, height }),
);
</script>

<!--
  The one flag of the canvas: a pole standing at what it marks, the flag hanging from its top on
  its right (`flagPlace`), shifted by exactly what keeps it on screen (`onScreen`).
-->
<div class="tilie-coordinates" data-testid="{kind}-flag" bind:clientHeight={height}>
  <div
    class="tilie-coordinates-pole"
    data-testid="{kind}-pole"
    style:left="{place.pole.x - POLE_WIDTH / 2}px"
    style:width="{POLE_WIDTH}px"
    style:top="{place.pole.top}px"
    style:height="{place.pole.bottom - place.pole.top}px"
  ></div>
  <div
    class="tilie-coordinates-flag"
    role="group"
    aria-label={label}
    style:left="{place.left}px"
    style:top="{place.top}px"
    bind:offsetWidth={flagWidth}
    bind:offsetHeight={flagHeight}
  >
    {@render children()}
    <div class="tilie-coordinates-foot" data-testid="{kind}-footer">click to pin</div>
  </div>
</div>
