<script lang="ts">
import type { Pin, Row } from "@timetoalign/tilie-core";
import { flagParts, flowFlagParts, rowValueText } from "./coordinates.ts";
import Flag from "./Flag.svelte";
import { getNodeActions } from "./nodeActions.ts";

interface Props {
  /**
   * The pin the hovered position makes: its timestamp is shown, part by part, top to bottom, its
   * primary coordinate (its anchor's) highlighted.
   */
  pin: Pin;
  /** The hovered row, highlighted: the line's coordinate or one map's value. */
  hovered: Row;
  /** Where the position lies on the line, in pixels from the canvas's top-left corner. */
  x: number;
  y: number;
  /** The topmost ordinate of the line, its maps and its cross-section line, in the same pixels. */
  top: number;
  /** The canvas's width in pixels: a flag that would leave it is shifted to stay inside it. */
  width: number;
}

let { pin, hovered, x, y, top, width }: Props = $props();

/** The places a float is shown with: the granularity's. */
const decimals = $derived(pin.timestamp.granularity.decimals);
const parts = $derived(flagParts(pin));

const actions = getNodeActions();

/**
 * The parts flows add (`flowFlagParts`), read from the pin's block as the canvas shows it: the
 * written position of a virtual card's, or a root's played positions on its virtual cards.
 */
const flowParts = $derived.by(() => {
  const block = actions.view().blocks[pin.spec.block];
  return block === undefined ? [] : flowFlagParts(block.manifest, block.places, pin, decimals);
});

/** The timeline of the timestamp's primary coordinate: its anchor's. */
const primary = $derived(pin.spec.anchor.timeline);

/** Whether `row` is the hovered one. */
function isHovered(row: Row): boolean {
  return row.timeline === hovered.timeline && row.map === hovered.map;
}
</script>

<Flag kind="coordinate" label="Coordinates" {x} {y} {top} {width}>
  {#each parts as part (part.timeline)}
    <div class="tilie-coordinates-part" data-timeline={part.timeline}>
      <div class="tilie-coordinates-head">{part.name}</div>
      {#each part.rows as item (item.row.map)}
        <div
          class="tilie-coordinates-row"
          data-map={item.row.map ?? undefined}
          data-hovered={isHovered(item.row)}
          data-primary={item.row.map === null && item.row.timeline === primary}
        >
          <span class="tilie-coordinates-name">{item.row.map === null ? "coordinate" : item.label}</span>
          <span class="tilie-coordinates-value" data-testid={item.row.map === null ? "coordinate" : undefined}
            >{rowValueText(item, decimals)}</span
          >
        </div>
      {/each}
    </div>
  {/each}
  {#each flowParts as part (part.key)}
    <div class="tilie-coordinates-part" data-flow={part.key}>
      <div class="tilie-coordinates-head">{part.name}</div>
      {#each part.rows as row (row.key)}
        <div class="tilie-coordinates-row" data-flow-row={row.key}>
          <span class="tilie-coordinates-name">{row.name}</span>
          <span class="tilie-coordinates-value">{row.value}</span>
        </div>
      {/each}
    </div>
  {/each}
</Flag>
