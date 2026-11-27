<script lang="ts">
/**
 * The band list of a selected timeline in the Properties tab (`display.ts`
 * `bandList`), every timeline alike (a root's, a child's, a virtual
 * timeline's): a table "Bands", one row per band in the timeline's band
 * order, its word and its Visible control (`ReachToggle`): the band's own
 * box, and where the timeline has descendants the tree's box beside it,
 * the same display `within` the timeline, mixed while its bands differ.
 * No box is ever disabled: a band showing nothing now has its hint under
 * its word. A change sends the press's `style`s (`bandCommands`): one is
 * dispatched, several are one step (`edit` of the timeline, or one after
 * the other inside an open editor); a refusal is posted as information.
 */
import type { Block, CommandError, Store, View } from "@timetoalign/tilie-core";
import { postOf } from "../messages.svelte.ts";
import type { BandRow, Control, Reach } from "./display.ts";
import { bandCommands } from "./display.ts";
import ReachToggle from "./ReachToggle.svelte";

let {
  view,
  store,
  block,
  rows,
}: {
  view: View;
  store: Store;
  /** The block the timeline lies in. */
  block: Block;
  rows: readonly BandRow[];
} = $props();

const uid = $props.id();
const post = postOf();

/** Send the press of `row`'s box of `reach`. */
function press(row: BandRow, reach: Reach): void {
  const control = reach === "own" ? row.control : row.tree;
  if (control === null) return;
  const commands = bandCommands(view, block, control);
  const [only] = commands;
  let refusal: CommandError | null = null;
  if (commands.length === 1 && only !== undefined) refusal = store.dispatch(only);
  else if (commands.length > 1 && store.editing.length === 0) {
    refusal = store.edit({ block: block.id, id: row.timeline }, commands);
  } else {
    for (const command of commands) refusal ??= store.dispatch(command);
  }
  if (refusal !== null) post("info", refusal.message);
}

/** The ID of the hint of `row`'s box of `reach`. */
const hintId = (row: BandRow, reach: Reach): string => `${uid}-${row.facet}-${reach}`;

/** A box of `row` as `ReachToggle` takes it. */
function box(row: BandRow, control: Control, reach: Reach) {
  const label =
    reach === "own" ? `${control.label} visible` : `${control.label} with its descendants visible`;
  return {
    pressed: control.pressed,
    mixed: control.mixed,
    label,
    describedby: control.hint === null ? undefined : hintId(row, reach),
    title: control.hint ?? (reach === "tree" ? label : undefined),
  };
}
</script>

{#if rows.length > 0}
  <table class="bands" data-testid="band-list">
    <caption>Bands</caption>
    <thead>
      <tr>
        <th scope="col">Band</th>
        <th scope="col">Visible</th>
      </tr>
    </thead>
    <tbody>
      {#each rows as row (row.facet)}
        {@const own = row.control}
        {@const tree = row.tree}
        <tr>
          <th scope="row">
            {own.label}
            {#if own.hint !== null}
              <span class="reason" id={hintId(row, "own")}>{own.hint}</span>
            {/if}
            {#if tree !== null && tree.hint !== null}
              <span class="reason" id={hintId(row, "tree")}>With its descendants: {tree.hint}</span>
            {/if}
          </th>
          <td>
            <ReachToggle
              name="band-visible"
              value={row.facet}
              own={box(row, own, "own")}
              tree={tree === null ? null : box(row, tree, "tree")}
              onpress={(reach) => press(row, reach)}
            />
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  .bands {
    margin-top: 0.5rem;
    border-collapse: collapse;
  }

  caption {
    color: #595959;
    text-align: start;
  }

  th,
  td {
    padding: 0.1rem 0.75rem 0.1rem 0;
    font-weight: normal;
    text-align: start;
    vertical-align: baseline;
  }

  thead th {
    color: #595959;
  }

  /* A band showing nothing now: its hint under its word, greyed text that stays readable. */
  .reason {
    display: block;
    color: #6b6b6b;
    font-size: 0.75rem;
    overflow-wrap: anywhere;
  }
</style>
