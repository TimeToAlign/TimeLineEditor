<script lang="ts">
/**
 * The rotation of a timestamp's wedge in degrees: a slider from -180 to 180
 * by 1, with the stops (`ROTATION_STOPS`) as its ticks and as a row of
 * buttons under it, each at its stop's place on the track and pressed while
 * the value is its stop. A drag shows its value live beside the slider and
 * hands it to `onpreview` at every step (`null` once it is the value again),
 * so the caller can show it without storing it; it commits once, when the
 * slider changes or the pointer that dragged it is released, whichever
 * comes first, so it is one command. Escape during a drag, and a cancelled
 * pointer, end it without committing: the value is shown again and the rest
 * of that drag moves nothing. Whatever a release fires after it ended the
 * drag (Firefox's `input` and `change`) moves nothing either. PageUp and
 * PageDown move to the next stop up or down; a stop commits its value;
 * Default, offered while a rule states the rotation, commits `null`. The caller sends the command (`oncommit`).
 * Disabled, every control shows greyed, the value beside them muted, and
 * the value is kept.
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
  /** The rotation dragged to and not committed yet, `null` once none is shown. */
  onpreview?: ((rotation: number | null) => void) | undefined;
}

let { value, stated, disabled, labelledby, describedby, oncommit, onpreview }: Props = $props();

const uid = $props.id();

/** The value dragged to and not committed yet; `null` while none is. */
let draft: number | null = $state(null);
const shown = $derived(draft ?? value);

/**
 * The drag under way, from a press on the slider to its release: whether it
 * is over (Escape, a cancelled pointer or the release ended it), so that
 * what it still fires moves nothing, and the stop of the window listeners
 * that hear the release; `null` while none is. An ended drag is kept until
 * the release's own events have passed (the next task), the next key or
 * the next press, whichever comes first: Firefox ends a native drag on the
 * release by setting the value at the pointer and firing `input` and
 * `change`, which would otherwise show and commit that value again.
 */
let drag: { over: boolean; readonly unlisten: () => void } | null = null;
/** The rotation handed to `onpreview` last, so that each step is handed once. */
let previewed: number | null = null;

function preview(rotation: number | null): void {
  if (rotation === previewed) return;
  previewed = rotation;
  onpreview?.(rotation);
}

function commit(rotation: number): void {
  draft = null;
  preview(null);
  if (rotation !== value) oncommit(rotation);
}

function reset(): void {
  draft = null;
  preview(null);
  oncommit(null);
}

/** Show the value again, nothing committed; a drag under way moves nothing more. */
function cancel(slider: HTMLInputElement): void {
  draft = null;
  preview(null);
  slider.value = String(value);
  if (drag !== null) drag.over = true;
}

function oninput(event: Event & { currentTarget: HTMLInputElement }): void {
  const slider = event.currentTarget;
  if (drag?.over) {
    slider.value = String(value);
    return;
  }
  const next = Number(slider.value);
  draft = next;
  preview(next === value ? null : next);
}

/** The slider changed: by a key, or by the end of a drag; a drag already ended commits nothing more. */
function onchange(event: Event & { currentTarget: HTMLInputElement }): void {
  if (draft !== null) commit(Number(event.currentTarget.value));
}

/**
 * The end of a drag, heard on the window: released, it commits; cancelled,
 * it shows the value. Either way the drag is over and kept a little longer
 * (see `drag`).
 */
function ended(slider: HTMLInputElement, released: boolean): void {
  const ending = drag;
  if (ending === null) return;
  ending.unlisten();
  setTimeout(() => {
    if (drag === ending) drag = null;
  });
  if (ending.over) return;
  ending.over = true;
  if (!released) cancel(slider);
  else if (draft !== null) commit(draft);
}

function onpointerdown(event: PointerEvent & { currentTarget: HTMLInputElement }): void {
  const slider = event.currentTarget;
  drag?.unlisten();
  // Added at once, not a microtask later as `svelte/events`' `on` would, so no release is missed.
  const released = () => ended(slider, true);
  const cancelled = () => ended(slider, false);
  window.addEventListener("pointerup", released, true);
  window.addEventListener("pointercancel", cancelled, true);
  drag = {
    over: false,
    unlisten: () => {
      window.removeEventListener("pointerup", released, true);
      window.removeEventListener("pointercancel", cancelled, true);
    },
  };
}

/**
 * PageUp and PageDown: the next stop above or below the value shown,
 * committed. Escape while a value is dragged: the value shown again.
 */
function onkeydown(event: KeyboardEvent & { currentTarget: HTMLInputElement }): void {
  if (drag?.over) drag = null;
  if (event.key === "Escape") {
    if (draft === null) return;
    event.preventDefault();
    event.stopPropagation();
    cancel(event.currentTarget);
    return;
  }
  if (event.key !== "PageUp" && event.key !== "PageDown") return;
  event.preventDefault();
  const next =
    event.key === "PageUp"
      ? ROTATION_STOPS.find((stop) => stop > shown)
      : ROTATION_STOPS.findLast((stop) => stop < shown);
  if (next !== undefined) commit(next);
}

// Removed during a drag, the control leaves no listener behind and withdraws what it showed.
$effect(() => () => {
  drag?.unlisten();
  drag = null;
  preview(null);
});
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
    value={shown}
    {oninput}
    {onchange}
    {onpointerdown}
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
