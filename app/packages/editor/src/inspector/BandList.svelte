<script lang="ts">
/**
 * The band list of a selected timeline card in the Properties tab
 * (`display.ts` `bandList`): a table "Bands", one row per band in the
 * timeline's band order, its word and a Visible checkbox showing what the
 * cascade gives for the band's `display`. A change sends one `style`, the
 * band's rule in the block's manifest (`toggleCommand`); a refusal is
 * posted as information.
 */
import type { Block, Store, View } from "@timetoalign/tilie-core";
import { postOf } from "../messages.svelte.ts";
import type { BandRow } from "./display.ts";
import { toggleCommand } from "./display.ts";

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

const post = postOf();

/** Send the change of `row`'s checkbox, which shows the stored state until the store has taken it. */
function change(event: Event & { currentTarget: HTMLInputElement }, row: BandRow): void {
  event.currentTarget.checked = row.toggle.pressed;
  const refusal = store.dispatch(toggleCommand(view, block, row.toggle));
  if (refusal !== null) post("info", refusal.message);
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
        <tr>
          <th scope="row">{row.toggle.label}</th>
          <td>
            <input
              type="checkbox"
              name="band-visible"
              value={row.facet}
              checked={row.toggle.pressed}
              aria-label="{row.toggle.label} visible"
              onchange={(event) => change(event, row)}
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
  }

  thead th {
    color: #595959;
  }

  td {
    text-align: center;
  }
</style>
