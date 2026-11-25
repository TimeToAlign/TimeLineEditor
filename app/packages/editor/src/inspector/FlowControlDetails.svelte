<script lang="ts">
/**
 * One selected flow-control element in the Properties tab: its read-only
 * rows (`flowRows`: its role, its coordinate, and each destination of a
 * jump with its conditions), then its provenance as the Metadata and the
 * Matchstamp tabs show an entry (`ProvenanceDetails`): how each entry says
 * the element was made, who believes it, and the user's own belief, one
 * button each. A belief is one `set` of the element's `provenance`
 * (`beliefCommand`); a belief `false` rejects the element, which stays in
 * the manifest and is drawn faded. Nothing else of the element is edited
 * here.
 */
import type { Store, View } from "@timetoalign/tilie-core";
import { addressWords } from "@timetoalign/tilie-core";
import type { Belief } from "@timetoalign/timetoshare";
import { iriNames } from "../iris.ts";
import { postOf } from "../messages.svelte.ts";
import { profilesOf } from "../profiles/profiles.svelte.ts";
import { userOf } from "../user.svelte.ts";
import type { FlowSubject } from "./flow.ts";
import { beliefCommand, flowProvenance, flowRows } from "./flow.ts";
import { dayOf } from "./metadata/edits.ts";
import ProvenanceDetails from "./ProvenanceDetails.svelte";

let {
  view,
  store,
  flow,
}: {
  view: View;
  store: Store;
  /** The selected element (`flowOf`). */
  flow: FlowSubject;
} = $props();

const uid = $props.id();
const post = postOf();
const user = userOf();
const profiles = profilesOf();

const rows = $derived(flowRows(flow));
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
