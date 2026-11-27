<script lang="ts">
/**
 * One compact control acting on "this one" or "this one and its tree"
 * (`display.ts` `Reach`): a checkbox for the element itself, and joined to
 * it, where the element has descendants, a second one marked with a small
 * tree for the same rule `within` it, checked while every element of the
 * tree shows what it shows, indeterminate (the mixed look of the Locked
 * checkbox) while some do. Neither is ever disabled; a hint describes a
 * box where its press shows nothing now. A change reports its reach
 * (`onpress`) and leaves the box as stored until the store has taken the
 * command.
 */
import type { Reach } from "./display.ts";
import { indeterminate } from "./indeterminate.ts";

/** One box: whether it is checked, mixed, its accessible name and the ID of its hint. */
interface Box {
  readonly pressed: boolean;
  readonly mixed: boolean;
  readonly label: string;
  /** The ID of the element holding its hint, where one is shown. */
  readonly describedby?: string | undefined;
  readonly title?: string | undefined;
}

let {
  name,
  value,
  own,
  tree,
  onpress,
}: {
  /** The form name of the boxes: `name`, and `name-tree` for the tree's. */
  name: string;
  value: string;
  own: Box;
  /** The tree's box; `null` where the element has no descendants. */
  tree: Box | null;
  onpress: (reach: Reach) => void;
} = $props();

/** Report the change of `box`, which shows the stored state until the store has taken it. */
function change(event: Event & { currentTarget: HTMLInputElement }, box: Box, reach: Reach): void {
  event.currentTarget.checked = box.pressed;
  event.currentTarget.indeterminate = box.mixed;
  onpress(reach);
}
</script>

<span class="reach">
  <input
    type="checkbox"
    {name}
    {value}
    checked={own.pressed}
    title={own.title}
    aria-label={own.label}
    aria-describedby={own.describedby}
    {@attach indeterminate(own.mixed)}
    onchange={(event) => change(event, own, "own")}
  />
  {#if tree !== null}
    {@const box = tree}
    <label class="tree" title={box.title ?? box.label}>
      <input
        type="checkbox"
        name="{name}-tree"
        {value}
        checked={box.pressed}
        aria-label={box.label}
        aria-describedby={box.describedby}
        {@attach indeterminate(box.mixed)}
        onchange={(event) => change(event, box, "tree")}
      />
      <svg class="mark" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
        <circle cx="3" cy="2.5" r="1.6" />
        <circle cx="9" cy="6" r="1.4" />
        <circle cx="9" cy="10" r="1.4" />
        <path d="M3 4.1V10H7.6M3 6H7.6" />
      </svg>
    </label>
  {/if}
</span>

<style>
  /* The two boxes joined in one outline, the tree's after a divider. */
  .reach {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0 0.2rem;
    border: 1px solid #c8c8c8;
    border-radius: 3px;
    background: #fff;
  }

  .tree {
    display: inline-flex;
    align-items: center;
    gap: 0.1rem;
    padding-inline-start: 0.2rem;
    border-inline-start: 1px solid #c8c8c8;
    cursor: pointer;
  }

  input {
    margin: 0.15rem 0;
  }

  .mark {
    fill: #595959;
    stroke: #595959;
    stroke-width: 1;
  }

  .mark path {
    fill: none;
  }
</style>
