<script lang="ts">
/**
 * The candidates below the tiles, two native disclosures: the pairs held
 * only in provenance that are offered to the user, and apart those the user
 * believes false, which are not offered again. Each row is its sentence
 * (the verb in words and the value, an IRI as a slug with the full IRI as
 * its title) with a Provenance button opening its paradata, its beliefs and
 * the user's belief (`Provenance`); believing a candidate true states it. The first disclosure also offers to look up
 * matches for the names stated without an identifier.
 */
import type { Belief } from "@timetoalign/timetoshare";
import { userOf } from "../../user.svelte.ts";
import Provenance from "../Provenance.svelte";
import { beliefOf } from "../provenance.ts";
import type { CandidateRow, Candidates } from "./frame.ts";

let {
  candidates,
  unreconciled,
  proposing,
  onbelieve,
  onpropose,
}: {
  candidates: Candidates;
  /**
   * How many names the shown element and the elements below it state
   * without an identifier the lookup can find.
   */
  unreconciled: number;
  /** Whether matches for them are being looked up for the shown element. */
  proposing: boolean;
  onbelieve: (row: CandidateRow, belief: Belief) => void;
  onpropose: () => void;
} = $props();

const user = userOf();
</script>

{#snippet row(item: CandidateRow, testid: string)}
  <li data-testid={testid} data-key={item.key}>
    <span class="what"
      ><span class="verb">{item.heading}</span>
      <strong title={item.label.iri ?? undefined}>{item.label.text}</strong></span
    >
    <Provenance
      subject="{item.heading} {item.label.text}"
      line={item.line}
      missing="No provenance entry: the manifest states it."
      mine={beliefOf(item.line, user.state.user)}
      onbelieve={(belief) => onbelieve(item, belief)}
    >
      <p>Believing a candidate true states it.</p>
    </Provenance>
  </li>
{/snippet}

<div class="candidates">
  <details data-testid="metadata-candidates">
    <summary>Candidates ({candidates.offered.length})</summary>
    {#if unreconciled > 0 || proposing}
      <p class="propose">
        <button
          type="button"
          data-testid="metadata-propose"
          aria-busy={proposing}
          onclick={() => {
            if (!proposing) onpropose();
          }}>Propose matches for unreconciled names</button
        >
        <span class="count" role="status"
          >{proposing
            ? "Looking them up…"
            : `${unreconciled} ${unreconciled === 1 ? "name" : "names"} without an identifier here and below`}</span
        >
      </p>
    {/if}
    <ul>
      {#each candidates.offered as item (item.key)}
        {@render row(item, "metadata-candidate-row")}
      {/each}
    </ul>
  </details>
  <details data-testid="metadata-dismissed">
    <summary>Believed false by you ({candidates.dismissed.length})</summary>
    <ul>
      {#each candidates.dismissed as item (item.key)}
        {@render row(item, "metadata-dismissed-row")}
      {/each}
    </ul>
  </details>
</div>

<style>
  .candidates {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  summary {
    cursor: pointer;
    color: #3d3d3d;
  }

  summary:focus-visible,
  button:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }

  ul {
    margin: 0.2rem 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.1rem 0.4rem;
    padding: 0.2rem 0;
    border-bottom: 1px solid #eee;
  }

  .propose {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.4rem;
    margin: 0.2rem 0;
  }

  .count {
    color: #595959;
    font-size: 0.78rem;
  }

  button {
    padding: 0.1rem 0.45rem;
    border: 1px solid #bdbdbd;
    border-radius: 3px;
    background: #fafafa;
    font: inherit;
    font-size: 0.78rem;
    color: inherit;
    cursor: pointer;
  }
</style>
