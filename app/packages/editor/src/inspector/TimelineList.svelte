<script lang="ts">
/**
 * The timeline list of a selected bundle in the Properties tab
 * (`timelineList.ts`): a table "Timelines", one row per card the block
 * holds, its kind and name, and a Visible checkbox where the card can be
 * hidden and shown again (a virtual timeline's), so that a hidden card is
 * never out of reach; a frame or a root's card reads "Always drawn". A
 * change sends the row's one `set`; a refusal is posted as information.
 * Below, where the bundle has groups, how their members are reached.
 */
import type { Store } from "@timetoalign/tilie-core";
import { postOf } from "../messages.svelte.ts";
import type { TimelineRow, TimelineRowKind } from "./timelineList.ts";

let {
  store,
  rows,
}: {
  store: Store;
  rows: readonly TimelineRow[];
} = $props();

const uid = $props.id();
const post = postOf();

/** The word of each kind of row. */
const KIND_WORDS: { readonly [kind in TimelineRowKind]: string } = {
  group: "Group",
  timeline: "Timeline",
  virtual_timeline: "Virtual timeline",
};

const grouped = $derived(rows.some((row) => row.kind === "group"));

/** Send the change of `row`'s checkbox, which shows the stored state until the store has taken it. */
function change(event: Event & { currentTarget: HTMLInputElement }, row: TimelineRow): void {
  if (row.visible === null) return;
  event.currentTarget.checked = row.visible.checked;
  const refusal = store.dispatch(row.visible.command);
  if (refusal !== null) post("info", refusal.message);
}
</script>

{#if rows.length > 0}
  <table class="timelines" data-testid="timeline-list" aria-describedby={grouped ? `${uid}-members` : undefined}>
    <caption>Timelines</caption>
    <thead>
      <tr>
        <th scope="col">Card</th>
        <th scope="col">Visible</th>
      </tr>
    </thead>
    <tbody>
      {#each rows as row (row.id)}
        <tr>
          <th scope="row"><span class="kind">{KIND_WORDS[row.kind]}</span> {row.name}</th>
          <td>
            {#if row.visible === null}
              <span class="always">Always drawn</span>
            {:else}
              <input
                type="checkbox"
                name="timeline-visible"
                value={row.id}
                checked={row.visible.checked}
                aria-label="{row.name} visible"
                onchange={(event) => change(event, row)}
              />
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if grouped}
    <p class="members" id="{uid}-members">
      A group's members, and the roots drawn behind its frame, are listed in the group's
      Properties: select its frame.
    </p>
  {/if}
{/if}

<style>
  .timelines {
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
    overflow-wrap: anywhere;
  }

  thead th,
  .kind {
    color: #595959;
  }

  td {
    text-align: center;
  }

  /* A card that cannot be hidden: greyed text that stays readable. */
  .always,
  .members {
    color: #6b6b6b;
    font-size: 0.75rem;
  }

  .members {
    margin: 0.25rem 0 0;
  }
</style>
