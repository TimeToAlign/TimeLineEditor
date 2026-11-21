<script lang="ts">
/**
 * The details of one pair, behind its Details button: its provenance entry
 * as both tabs show one (`ProvenanceDetails`: the paradata, who believes it
 * and how, the user's own belief), and Remove where the pair is stated. A
 * pair without an entry is stated by the manifest. Believing a candidate
 * true states it; believing a stated pair false records the belief and
 * leaves the pair stated, so Remove stays an action of its own.
 */
import type { Belief } from "@timetoalign/timetoshare";
import ProvenanceDetails from "../ProvenanceDetails.svelte";
import type { EntryLine } from "./frame.ts";

let {
  id,
  line,
  candidate = false,
  mine,
  onbelieve,
  onremove,
}: {
  /** The ID of the region, which the Details button controls. */
  id: string;
  /** The pair's provenance entry; `null` where it has none. */
  line: EntryLine | null;
  /** Whether the pair is a candidate (held only in provenance) rather than stated. */
  candidate?: boolean;
  /** The user's own belief; `null` for none. */
  mine: Belief | null;
  onbelieve: (belief: Belief) => void;
  /** Remove the stated pair; absent for a candidate. */
  onremove?: () => void;
} = $props();
</script>

<div class="details" {id} data-testid="metadata-details">
  <ProvenanceDetails
    {line}
    missing="No provenance entry: the manifest states it."
    {mine}
    {onbelieve}
  >
    {#snippet actions()}
      {#if onremove !== undefined}
        <button type="button" onclick={onremove}>Remove</button>
      {/if}
    {/snippet}
  </ProvenanceDetails>
  {#if candidate}
    <p>Believing a candidate true states it.</p>
  {/if}
</div>

<style>
  .details {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin: 0.3rem 0 0.1rem;
    padding: 0.35rem 0.5rem;
    border-left: 3px solid #c9d8ea;
    background: #f7f9fc;
    font-size: 0.78rem;
  }

  p {
    margin: 0;
    color: #595959;
  }

  button {
    padding: 0.1rem 0.45rem;
    border: 1px solid #bdbdbd;
    border-radius: 3px;
    background: #fafafa;
    font: inherit;
    color: inherit;
    cursor: pointer;
  }

  button:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }
</style>
