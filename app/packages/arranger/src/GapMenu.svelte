<script lang="ts">
/*
 * The menu Delete opens for a segment: which neighbour moves to close the
 * gap the segment leaves, one of four ways, then OK or Cancel. Each way is
 * named after the neighbour that moves and what it does: the left or the
 * right neighbour extends into the gap, or shifts into it. A way that is not
 * permitted cannot be chosen: it is disabled, its reason as its title.
 */
import type { Gap, GapOption, GapSide, GapVerb } from "@timetoalign/tilie-core";
import { GAPS } from "@timetoalign/tilie-core";
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

type Way = `${GapSide}-${GapVerb}`;

/** Each way's name, saying which neighbour moves, and what it does. */
const WAYS: { readonly [way in Way]: { readonly name: string; readonly description: string } } = {
  "left-extend": { name: "Left extends", description: "The left neighbour grows into the gap." },
  "right-extend": {
    name: "Right extends",
    description:
      "The right neighbour starts where the deleted segment started and grows into the gap.",
  },
  "left-shift": {
    name: "Left shifts",
    description: "The left neighbour and everything before it move right into the gap.",
  },
  "right-shift": {
    name: "Right shifts",
    description: "The right neighbour and everything after it move left into the gap.",
  },
};

const keyOf = (way: Gap): Way => `${way.side}-${way.verb}`;

/** The option offered for `way`; a way not offered cannot be chosen. */
function optionOf(way: Gap): GapOption | undefined {
  return options.find((item) => keyOf(item.gap) === keyOf(way));
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
 * The menu takes the focus when it opens, on the chosen way, and reads the
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
    <legend>Closes the gap</legend>
    {#each GAPS as way (keyOf(way))}
      {@const key = keyOf(way)}
      {@const option = optionOf(way)}
      <label class="tilie-menu-item" title={option?.refused ?? undefined}>
        <input
          type="radio"
          name="{uid}-gap"
          value={key}
          data-testid="gap-{key}"
          aria-labelledby="{uid}-{key}-name"
          aria-describedby="{uid}-{key}-description"
          checked={keyOf(gap) === key}
          disabled={option?.refused !== null}
          onchange={() => (gap = way)}
        />
        <span class="name" id="{uid}-{key}-name">{WAYS[key].name}</span>
        <span class="description" id="{uid}-{key}-description">{WAYS[key].description}</span>
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

  /* The legend names the ways for assistive technology only. */
  legend {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* A way: its name, and below it what it does. */
  label {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    box-sizing: border-box;
    max-width: 18rem;
    padding-block: 0.25rem;
    text-align: left;
  }

  .description {
    font-size: 0.75rem;
    color: #555;
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
