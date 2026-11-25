<script lang="ts">
/**
 * One selected flow-control element in the Properties tab: its read-only
 * rows (`flowRows`: its role, its coordinate, how it is notated, its
 * status under the user's reading, `readingOf`), its
 * display toggles (`elementToggles`), a jump's destinations, one button
 * each (`destinationRows`: the place it leads to by the kind, name, ID and
 * coordinate of what stands there, its conditions, how it is notated),
 * whose press selects the jump with what the destination leads to, so the
 * canvas marks both and the row stays chosen while that selection holds;
 * then its provenance as the Metadata and the
 * Matchstamp tabs show an entry (`ProvenanceDetails`): how each entry says
 * the element was made, who believes it, and the user's own belief, one
 * button each. A belief is one `set` of the element's `belief`
 * (`beliefCommand`), which core records in the element's provenance; a
 * belief `false` rejects the element, which stays in the manifest and is
 * drawn faded. Nothing else of the element is edited here.
 */
import type { Address, Store, View } from "@timetoalign/tilie-core";
import { addressWords, sameAddress } from "@timetoalign/tilie-core";
import type { Belief } from "@timetoalign/timetoshare";
import { iriNames } from "../iris.ts";
import { postOf } from "../messages.svelte.ts";
import { profilesOf } from "../profiles/profiles.svelte.ts";
import { userOf } from "../user.svelte.ts";
import DisplayGroups from "./DisplayGroups.svelte";
import { elementToggles } from "./display.ts";
import type { DestinationRow, FlowSubject } from "./flow.ts";
import { beliefCommand, destinationRows, flowProvenance, flowRows, readingOf } from "./flow.ts";
import { dayOf } from "./metadata/edits.ts";
import ProvenanceDetails from "./ProvenanceDetails.svelte";

let {
  view,
  store,
  flow,
  selected,
  onselect,
}: {
  view: View;
  store: Store;
  /** The selected element (`flowOf`). */
  flow: FlowSubject;
  /** The selected addresses, in selection order. */
  selected: readonly Address[];
  /** Select `addresses` on the canvas. */
  onselect: (addresses: readonly Address[]) => void;
} = $props();

const uid = $props.id();
const post = postOf();
const user = userOf();
const profiles = profilesOf();

/** Which elements the user's flows read: their belief, else the block's belief filter. */
const reading = $derived(readingOf(view, flow.block, user.state.user));
const rows = $derived(flowRows(flow, reading));
const toggles = $derived(elementToggles(view, flow));
const destinations = $derived(destinationRows(flow));

/** The destination last chosen, and the addresses its press selected. */
let chosen = $state<{ readonly index: number; readonly marks: readonly Address[] } | null>(null);

/** Whether `row` is the destination chosen, while the selection is still what its press selected. */
function isChosen(row: DestinationRow): boolean {
  if (chosen === null || chosen.index !== row.index) return false;
  const { marks } = chosen;
  return (
    marks.length === selected.length &&
    marks.every((address, index) => sameAddress(address, selected[index] ?? {}))
  );
}

/** Choose `row`: select the jump and what the destination leads to. */
function choose(row: DestinationRow): void {
  chosen = { index: row.index, marks: row.marks };
  onselect(row.marks);
}
const names = $derived(iriNames(profiles.catalogue, flow.block.manifest["@context"]));
const provenance = $derived(flowProvenance(flow, user.state.user, names));
/** The element in words, as every refusal and the Journal name it. */
const words = $derived(addressWords(view, flow.target));

/** Record the user's belief; the belief the user holds already is left as it is. */
function believe(belief: Belief): void {
  if (provenance.mine === belief) return;
  const refusal = store.dispatch(beliefCommand(flow, user.state.user, belief, dayOf(new Date())));
  if (refusal !== null) post("info", refusal.message);
}
</script>

<dl class="rows" data-testid="flow-rows">
  {#each rows as row (row.label)}
    <div>
      <dt>{row.label}</dt>
      <dd>{row.value}</dd>
    </div>
  {/each}
</dl>

<DisplayGroups {view} {store} block={flow.block} groups={toggles} />

{#if destinations.length > 0}
  <section class="destinations" aria-labelledby="{uid}-destinations" data-testid="flow-destinations">
    <h3 id="{uid}-destinations">Destinations</h3>
    <ol>
      {#each destinations as row (row.index)}
        <li>
          <button type="button" aria-pressed={isChosen(row)} onclick={() => choose(row)}>
            <span class="place">
              <span>{row.place}</span>
              {#if row.name !== null}<span>'{row.name}'</span>{/if}
              {#if row.id !== null}<code>{row.id}</code>{/if}
              {#if row.at !== null}<span>at {row.at}</span>{/if}
            </span>
            {#if row.conditions !== ""}<span class="conditions">{row.conditions}</span>{/if}
            {#if row.notation !== ""}<span class="notation">{row.notation}</span>{/if}
          </button>
        </li>
      {/each}
    </ol>
  </section>
{/if}

<section class="provenance" aria-labelledby="{uid}-provenance" data-testid="flow-provenance">
  <h3 id="{uid}-provenance">Provenance</h3>
  {#each provenance.entries as line, index (index)}
    <ProvenanceDetails {line} missing="" mine={null} onbelieve={believe} beliefs={false} />
  {/each}
  <ProvenanceDetails
    line={provenance.beliefs}
    missing="No provenance entry: the manifest states it."
    mine={provenance.mine}
    label="Your belief in {words}"
    onbelieve={believe}
    paradata={provenance.beliefs === null}
  />
</section>

<style>
  .rows {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0.5rem 0 0;
  }

  .rows > div {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .rows dt {
    color: #595959;
  }

  .rows dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .destinations {
    margin-top: 0.5rem;
  }

  .destinations ol {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0.25rem 0 0;
    padding: 0;
    list-style: none;
  }

  /* A destination: a button the width of the panel, its lines left-aligned. */
  .destinations button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.1rem;
    width: 100%;
    padding: 0.2rem 0.4rem;
    border: 1px solid #c8c8c8;
    border-radius: 3px;
    background: #fff;
    font: inherit;
    text-align: start;
    cursor: pointer;
    overflow-wrap: anywhere;
  }

  .destinations button[aria-pressed="true"] {
    border-color: #0a84ff;
    background: #e8f0fe;
  }

  .destinations button:hover {
    border-color: #0a84ff;
  }

  .destinations button:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }

  /* The parts of the place in one line, wrapped where the panel is narrow. */
  .place {
    display: flex;
    flex-wrap: wrap;
    column-gap: 0.3em;
  }

  .conditions,
  .notation {
    color: #595959;
  }

  .destinations code {
    color: #595959;
  }

  .provenance {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin-top: 0.5rem;
    padding: 0.35rem 0.5rem;
    border-left: 3px solid #c9d8ea;
    background: #f7f9fc;
    font-size: 0.78rem;
  }

  h3 {
    margin: 0;
    font-size: inherit;
    font-weight: 600;
  }
</style>
