<script lang="ts">
/**
 * The candidates below the tiles, two native disclosures: the pairs held
 * only in provenance that are offered to the user, and apart those the user
 * believes false, which are not offered again. Each row is its sentence
 * (the verb in words and the value) with a Details button opening its
 * paradata, its beliefs and the user's belief (`PairDetails`); believing a
 * candidate true states it. The first disclosure also offers to look up
 * matches for the names stated without an identifier.
 */
import type { Belief } from "@timetoalign/timetoshare";
import { SvelteSet } from "svelte/reactivity";
import { userOf } from "../../user.svelte.ts";
import type { CandidateRow, Candidates } from "./frame.ts";
import { beliefOf } from "./frame.ts";
import PairDetails from "./PairDetails.svelte";

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

const uid = $props.id();
const user = userOf();
/** The keys of the rows whose details are shown. */
const detailed = new SvelteSet<string>();

function toggle(key: string): void {
  if (detailed.has(key)) detailed.delete(key);
  else detailed.add(key);
}
</script>

{#snippet row(item: CandidateRow, testid: string, index: number, list: string)}
  <li data-testid={testid} data-key={item.key}>
    <span class="what"><span class="verb">{item.heading}</span> <strong>{item.label}</strong></span>
    <button
      type="button"
      class="open-details"
      aria-label="Details of {item.heading} {item.label}"
      aria-expanded={detailed.has(item.key)}
      aria-controls="{uid}-{list}-{index}"
      onclick={() => toggle(item.key)}
    ></button>
    {#if detailed.has(item.key)}
      <PairDetails
        id="{uid}-{list}-{index}"
        line={item.line}
        candidate
        mine={beliefOf(item.line, user.state.user)}
        onbelieve={(belief) => onbelieve(item, belief)}
      />
    {/if}
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
      {#each candidates.offered as item, index (item.key)}
        {@render row(item, "metadata-candidate-row", index, "offered")}
      {/each}
    </ul>
  </details>
  <details data-testid="metadata-dismissed">
    <summary>Believed false by you ({candidates.dismissed.length})</summary>
    <ul>
      {#each candidates.dismissed as item, index (item.key)}
        {@render row(item, "metadata-dismissed-row", index, "dismissed")}
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

  li > :global([data-testid="metadata-details"]) {
    flex-basis: 100%;
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

  /* The word is drawn, not written, so that the row reads as the candidate alone. */
  button.open-details::after {
    content: "Details";
  }
</style>
