<script lang="ts">
/*
 * The menu Delete opens for a segment: which neighbour closes the gap the
 * segment leaves (left or right) and how (it extends, or the segments on
 * that side shift), then OK or Cancel. A way that is not permitted cannot be
 * chosen: an option no permitted way takes is disabled, its reasons as its
 * title, and choosing an option switches the other column to a way that is
 * permitted with it.
 */
import type { Gap, GapOption, GapSide, GapVerb } from "@timetoalign/tilie-core";
import { GAP_SIDES, GAP_VERBS } from "@timetoalign/tilie-core";
import type { Attachment } from "svelte/attachments";
import "./menu.css";

interface Props {
  /** The segment's id, named in the menu's label. */
  segment: string;
  /** The four ways of closing the gap, one at least permitted. */
  options: readonly GapOption[];
  /** The way chosen, always a permitted one. */
  gap: Gap;
  /** Where the menu's top centre lies, in pixels of the canvas. */
  x: number;
  y: number;
  onconfirm: (gap: Gap) => void;
  oncancel: () => void;
}

let { segment, options, gap = $bindable(), x, y, onconfirm, oncancel }: Props = $props();

const uid = $props.id();

const LABELS: { readonly [option in GapSide | GapVerb]: string } = {
  left: "Left",
  right: "Right",
  extend: "Extend",
  shift: "Shift",
};

function permitted(side: GapSide, verb: GapVerb): boolean {
  return options.some(
    (option) => option.gap.side === side && option.gap.verb === verb && option.refused === null,
  );
}

/** Why no permitted way takes `option`, or `null` when one does. */
function refusal(option: GapSide | GapVerb): string | null {
  const taking = options.filter((item) => item.gap.side === option || item.gap.verb === option);
  if (taking.some((item) => item.refused === null)) return null;
  return [...new Set(taking.map((item) => item.refused))].join("; ");
}

/** Choose a side or a verb, keeping the other column's choice when the way is permitted. */
function choose(side: GapSide, verb: GapVerb, changed: "side" | "verb"): void {
  if (permitted(side, verb)) {
    gap = { side, verb };
    return;
  }
  const other =
    changed === "side"
      ? GAP_VERBS.map((item) => ({ side, verb: item }))
      : GAP_SIDES.map((item) => ({ side: item, verb }));
  const found = other.find((item) => permitted(item.side, item.verb));
  if (found !== undefined) gap = found;
}

/** Enter is OK and Escape Cancel, except that Enter on a button presses that button. */
function onkeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    oncancel();
  } else if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) {
    event.preventDefault();
    onconfirm(gap);
  }
}

function onsubmit(event: SubmitEvent): void {
  event.preventDefault();
  onconfirm(gap);
}

/**
 * The menu takes the focus when it opens, on the chosen side, and reads the
 * keys of every control in it.
 */
const menu: Attachment<HTMLFormElement> = (form) => {
  form.querySelector<HTMLInputElement>("input:checked")?.focus({ preventScroll: true });
  form.addEventListener("keydown", onkeydown);
  return () => form.removeEventListener("keydown", onkeydown);
};
</script>

<form
  class="tilie-menu gap-menu"
  aria-label="Delete segment {segment}"
  data-testid="gap-menu"
  data-gap-menu
  style:left="{x}px"
  style:top="{y}px"
  {onsubmit}
  {@attach menu}
>
  <fieldset>
    <legend>Neighbour</legend>
    {#each GAP_SIDES as side (side)}
      {@const refused = refusal(side)}
      <label class="tilie-menu-item" title={refused ?? undefined}>
        <input
          type="radio"
          name="{uid}-side"
          value={side}
          data-testid="gap-{side}"
          checked={gap.side === side}
          disabled={refused !== null}
          onchange={() => choose(side, gap.verb, "side")}
        />{LABELS[side]}
      </label>
    {/each}
  </fieldset>
  <fieldset>
    <legend>Closes the gap by</legend>
    {#each GAP_VERBS as verb (verb)}
      {@const refused = refusal(verb)}
      <label class="tilie-menu-item" title={refused ?? undefined}>
        <input
          type="radio"
          name="{uid}-verb"
          value={verb}
          data-testid="gap-{verb}"
          checked={gap.verb === verb}
          disabled={refused !== null}
          onchange={() => choose(gap.side, verb, "verb")}
        />{LABELS[verb]}
      </label>
    {/each}
  </fieldset>
  <div class="actions">
    <button type="submit" class="tilie-menu-item" data-testid="gap-ok">OK</button>
    <button type="button" class="tilie-menu-item" data-testid="gap-cancel" onclick={oncancel}
      >Cancel</button
    >
  </div>
</form>

<style>
  .gap-menu {
    position: absolute;
    z-index: 10;
    transform: translateX(-50%);
  }

  fieldset,
  .actions {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  /* The legends name the columns for assistive technology only. */
  legend {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  label {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
  }

  /* The radio itself is not drawn: its label is the button. */
  input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: inherit;
  }
</style>
