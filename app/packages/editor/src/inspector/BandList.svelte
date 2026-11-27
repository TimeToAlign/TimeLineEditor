<script lang="ts">
/**
 * The band list of a selected timeline in the Properties tab (`display.ts`
 * `bandList`), every timeline alike (a root's, a child's, a virtual
 * timeline's): a table "Bands", one row per band in the timeline's band
 * order, its word and its Visible control (`ReachToggle`): the band's own
 * box, and where the timeline has descendants the tree's box beside it,
 * the same display `within` the timeline, mixed while its bands differ.
 * A virtual timeline's list has the column "From the sources": per band
 * one box showing that band of every chunk's window (`BandRow.sources`),
 * a press sending its one `style` (`controlCommand`).
 * No box is ever disabled: a band showing nothing now has its hint under
 * its word. A change of either box sends the press's `style`s
 * (`bandCommands`, read on the block drawn at the canvas's pane, or
 * `controlCommand`) the one way, as one step, atomic (`Store.edit`): in
 * the innermost open editor, else in the timeline's editor (a virtual
 * timeline, which has none, in its block's); a refusal is posted as
 * information.
 */
import type { Address, Block, Store, StyleCommand, View } from "@timetoalign/tilie-core";
import { editorKindOf, isCommandError } from "@timetoalign/tilie-core";
import { postOf } from "../messages.svelte.ts";
import { paneOf } from "../pane.ts";
import type { BandRow, Control, Reach } from "./display.ts";
import { bandCommands, controlCommand } from "./display.ts";
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
/** The canvas's pane, which the block is drawn at where a press reads what is present. */
const pane = paneOf();

/**
 * Send `commands`, a press of a box of `row`, as one step: in the innermost
 * open editor, else in the timeline's editor, else in its block's.
 */
function send(row: BandRow, commands: readonly StyleCommand[]): void {
  const open = store.editing.at(-1);
  const timeline: Address = { block: block.id, id: row.timeline };
  const target =
    open?.target ?? (isCommandError(editorKindOf(view, timeline)) ? { block: block.id } : timeline);
  const refusal = store.edit(target, commands, open?.kind);
  if (refusal !== null) post("info", refusal.message);
}

/** Send the press of `row`'s box of `reach`. */
function press(row: BandRow, reach: Reach): void {
  const control = reach === "own" ? row.control : row.tree;
  if (control !== null) send(row, bandCommands(view, block, control, pane));
}

/** The ID of the hint of `row`'s box of `reach`, or of its "From the sources" box. */
const hintId = (row: BandRow, reach: Reach | "sources"): string => `${uid}-${row.facet}-${reach}`;

/** Whether the list shows the column "From the sources": a virtual timeline's rows hold its switch. */
const fromSources = $derived(rows.some((row) => row.sources !== null));

/** Send the press of `row`'s "From the sources" box `control`: its one `style`. */
function pressSources(row: BandRow, control: Control): void {
  send(row, [controlCommand(view, block, control)]);
}

/** The "From the sources" box of `row` as `ReachToggle` takes it. */
function sourcesBox(row: BandRow, control: Control) {
  const label = `${control.label} from the sources visible`;
  return {
    pressed: control.pressed,
    mixed: control.mixed,
    label,
    describedby: control.hint === null ? undefined : hintId(row, "sources"),
    title: control.hint ?? label,
  };
}

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
        {#if fromSources}
          <th scope="col">From the sources</th>
        {/if}
      </tr>
    </thead>
    <tbody>
      {#each rows as row (row.facet)}
        {@const own = row.control}
        {@const tree = row.tree}
        {@const sources = row.sources}
        <tr>
          <th scope="row">
            {own.label}
            {#if own.hint !== null}
              <span class="reason" id={hintId(row, "own")}>{own.hint}</span>
            {/if}
            {#if tree !== null && tree.hint !== null}
              <span class="reason" id={hintId(row, "tree")}>With its descendants: {tree.hint}</span>
            {/if}
            {#if sources !== null && sources.hint !== null}
              <span class="reason" id={hintId(row, "sources")}>From the sources: {sources.hint}</span>
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
          {#if fromSources}
            <td>
              {#if sources !== null}
                {@const control = sources}
                <ReachToggle
                  name="band-sources"
                  value={row.facet}
                  own={sourcesBox(row, control)}
                  tree={null}
                  onpress={() => pressSources(row, control)}
                />
              {/if}
            </td>
          {/if}
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
