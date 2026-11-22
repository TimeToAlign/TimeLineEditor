<script lang="ts">
/**
 * The rotation of a timestamp's wedge in degrees: a slider from -180 to 180
 * by 1, with the stops (`ROTATION_STOPS`) as its ticks and as a row of
 * buttons under it, each at its stop's place on the track and pressed while
 * the value is its stop. A drag shows its value live beside the slider and
 * commits once, when the slider changes (`change`, not `input`), so it is
 * one command; PageUp and PageDown move to the next stop up or down; a stop
 * commits its value; Default, offered while a rule states the rotation,
 * commits `null`. The caller sends the command (`oncommit`). Disabled, every
 * control shows greyed, the value beside them muted, and the value is kept.
 */
import { degreesText, ROTATION_STOPS } from "../timestamp.ts";

interface Props {
  /** The degrees the wedge is turned now. */
  value: number;
  /** Whether a rule states the rotation, so that Default can remove it. */
  stated: boolean;
  disabled: boolean;
  /** The ID of the element naming the wedge. */
  labelledby: string;
  /** The IDs of what describes the control. */
  describedby?: string | undefined;
  /** A rotation chosen, `null` for the default. */
  oncommit: (rotation: number | null) => void;
}

let { value, stated, disabled, labelledby, describedby, oncommit }: Props = $props();

const uid = $props.id();

/** The value dragged to and not committed yet; `null` while none is. */
let draft: number | null = $state(null);
const shown = $derived(draft ?? value);

function commit(rotation: number): void {
  draft = null;
  if (rotation !== value) oncommit(rotation);
}

function reset(): void {
  draft = null;
  oncommit(null);
}

/** PageUp and PageDown: the next stop above or below the value shown, committed. */
function onkeydown(event: KeyboardEvent): void {
  if (event.key !== "PageUp" && event.key !== "PageDown") return;
  event.preventDefault();
  const next =
    event.key === "PageUp"
      ? ROTATION_STOPS.find((stop) => stop > shown)
      : ROTATION_STOPS.findLast((stop) => stop < shown);
  if (next !== undefined) commit(next);
}
</script>

<div class="rotation">
  <input
    id="{uid}-slider"
    class="slider"
    type="range"
    min="-180"
    max="180"
    step="1"
    list="{uid}-stops"
    aria-labelledby="{labelledby} {uid}-what"
    aria-describedby={describedby}
    aria-valuetext="{degreesText(shown)} degrees"
    {disabled}
    bind:value={() => shown, (next) => (draft = next)}
    onchange={() => commit(shown)}
    {onkeydown}
  />
  <output class="degrees" for="{uid}-slider" aria-hidden="true">{degreesText(shown)}°</output>
  <span id="{uid}-what" hidden>rotation</span>
  <datalist id="{uid}-stops">
    {#each ROTATION_STOPS as stop (stop)}
      <option value={stop}></option>
    {/each}
  </datalist>
  <div class="stops" role="group" aria-label="Rotation stops">
    {#each ROTATION_STOPS as stop (stop)}
      <button
        type="button"
        class="stop"
        style:left="{((stop + 180) / 360) * 100}%"
        aria-label="{degreesText(stop)} degrees"
        aria-pressed={shown === stop}
        {disabled}
        onclick={() => commit(stop)}>{degreesText(stop)}</button
      >
    {/each}
  </div>
  {#if stated}
    <button type="button" class="default" {disabled} onclick={reset}>Default</button>
  {/if}
</div>

<style>
  /* The slider and its value in one row, the stops under the slider, Default under the value. */
  .rotation {
    /* The native thumb's width: its centre runs from half of it to the width less half of it. */
    --thumb: 1rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content;
    align-items: center;
    gap: 0.2rem 0.5rem;
  }

  .slider {
    width: 100%;
    margin: 0;
  }

  .degrees {
    min-width: 3.5em;
    text-align: end;
    font-variant-numeric: tabular-nums;
  }

  /* Inset by half a thumb, so that a stop's place is the thumb's place at its value. */
  .stops {
    position: relative;
    height: 1.3rem;
    margin-inline: calc(var(--thumb) / 2);
  }

  /* One eighth of the track wide at most: stops are 45 degrees apart at least, so none overlap. */
  .stop {
    position: absolute;
    top: 0;
    width: 12.5%;
    max-width: 3rem;
    padding: 0;
    transform: translateX(-50%);
    border: 1px solid #c8c8c8;
    border-radius: 3px;
    background: #fff;
    font: inherit;
    font-size: 0.65rem;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }

  .stop[aria-pressed="true"] {
    border-color: #0a84ff;
    background: #e8f0fe;
    color: #0b3d91;
  }

  .stop:hover:enabled,
  .default:hover:enabled {
    border-color: #0a84ff;
  }

  .stop:focus-visible,
  .default:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }

  .default {
    padding: 0.1rem 0.4rem;
    border: 1px solid #c8c8c8;
    border-radius: 3px;
    background: #fff;
    font: inherit;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .stop:disabled,
  .default:disabled,
  .slider:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  /* The value is text, not a control: muted beside a disabled slider, never faded below 4.5:1. */
  .slider:disabled + .degrees {
    cursor: not-allowed;
    color: #595959;
  }
</style>
