<script lang="ts">
/**
 * The band list of a selected timeline in the Properties tab (`display.ts`
 * `bandList`), every timeline alike (a root's, a child's, a virtual
 * timeline's): a table "Bands", one row per band in the timeline's band
 * order, its word and a Visible checkbox showing what the cascade gives for
 * the band's `display`. A band whose showing or hiding changes nothing
 * drawn now has its checkbox disabled and its reason under its word. A change
 * sends one `style`, the band's rule in the block's manifest
 * (`controlCommand`); a refusal is posted as information.
 */
import type { Block, Store, View } from "@timetoalign/tilie-core";
import { postOf } from "../messages.svelte.ts";
import type { BandRow } from "./display.ts";
import { controlCommand } from "./display.ts";

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

/** Send the change of `row`'s checkbox, which shows the stored state until the store has taken it. */
function change(event: Event & { currentTarget: HTMLInputElement }, row: BandRow): void {
  event.currentTarget.checked = row.control.pressed;
  const refusal = store.dispatch(controlCommand(view, block, row.control));
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
        {@const inert = row.control.inert}
        <tr class={{ inert: inert !== null }}>
          <th scope="row">
            {row.control.label}
            {#if inert !== null}
              <span class="reason" id="{uid}-{row.facet}">{inert}</span>
            {/if}
          </th>
          <td>
            <input
              type="checkbox"
              name="band-visible"
              value={row.facet}
              checked={row.control.pressed}
              disabled={inert !== null}
              title={inert ?? undefined}
              aria-label="{row.control.label} visible"
              aria-describedby={inert === null ? undefined : `${uid}-${row.facet}`}
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
    vertical-align: baseline;
  }

  thead th {
    color: #595959;
  }

  td {
    text-align: center;
  }

  /* A band whose Visible changes nothing now: greyed text that stays readable, its reason beside it. */
  tr.inert th,
  .reason {
    color: #6b6b6b;
  }

  .reason {
    display: block;
    font-size: 0.75rem;
    overflow-wrap: anywhere;
  }
</style>
