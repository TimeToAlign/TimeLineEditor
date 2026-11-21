<script lang="ts">
/**
 * The Matchstamp tab's MatchClaims: each MatchClaim behind the MatchStamp
 * shown, with its provenance as the Metadata tab shows a pair's
 * (`ProvenanceDetails`: how it was made, read through the server for these
 * MatchClaims only, every actor's belief and the user's own: true,
 * unlikely, false, recorded through the server, which answers the new
 * table); one the table does not hold says so.
 */
import type { Manifest } from "@timetoalign/tilie-core";
import type { Belief } from "@timetoalign/timetoshare";
import type { LoadedTable, MatchClaimTables } from "../../matchClaims.svelte.ts";
import { MATCHES_NEED_A_SERVER, provenanceFailure } from "../../matchClaims.svelte.ts";
import { informOf, warnOf } from "../../messages.svelte.ts";
import { userOf } from "../../user.svelte.ts";
import { claimEntryLine, entryOf, followedMatch } from "../claimProvenance.ts";
import type { ClaimLine, MatchIndexes, ShownStamp } from "../matchstamps.ts";
import { dayOf } from "../metadata/edits.ts";
import ProvenanceDetails from "../ProvenanceDetails.svelte";
import type { HeldMatch } from "../tabs.ts";

interface Props {
  /** The MatchStamp shown, and how the tab holds it. */
  stamp: ShownStamp;
  match: HeldMatch;
  /** Its block's manifest, and the manifest's `@context`, under which an actor stands for an IRI. */
  manifest: Manifest;
  context: unknown;
  /** The MatchClaims behind it, as `claimLines` reads them from the block's table. */
  claims: readonly ClaimLine[];
  /** The block's table; `null` while none is loaded. */
  loaded: LoadedTable | null;
  /** The provenance of the MatchClaims the table holds, read through the server; `null` without a server or table. */
  provenance: ReturnType<MatchClaimTables["provenance"]> | null;
  /** The MatchClaim tables of the workspace's blocks. */
  tables: MatchClaimTables;
  /** The anchor indexes of a block's table (`blockIndexes`). */
  indexesOf: (block: string) => MatchIndexes | null;
  /** The MatchStamp shown is now `next`: followed into the table a belief changed. */
  onmatch: (next: HeldMatch | null) => void;
}

let {
  stamp,
  match,
  manifest,
  context,
  claims,
  loaded,
  provenance,
  tables,
  indexesOf,
  onmatch,
}: Props = $props();

const uid = $props.id();
/** The editor's one user: the believer, whose beliefs the buttons record. */
const user = userOf();
const inform = informOf();
const warn = warnOf();

const NO_PROVENANCE = "No provenance entry: the table states none for it.";

/** Whether a belief is being recorded: the belief buttons wait for it. */
let believing = $state(false);

/**
 * Record the user's belief `belief` in the MatchClaim `claim` through the
 * server: the block then holds the new table, marked changed, and the tab
 * follows the MatchStamp into it. The user's own belief again records
 * nothing.
 */
async function believe(claim: string, belief: Belief, mine: Belief | null): Promise<void> {
  if (believing || mine === belief) return;
  const shown = stamp;
  const held = match;
  believing = true;
  try {
    const failure = await tables.believe(shown.block, manifest, {
      claim,
      actor: user.state.statedBy,
      belief,
      date: dayOf(new Date()),
    });
    if (failure !== null) {
      warn(failure);
      return;
    }
    const next = followedMatch(held, shown, indexesOf(shown.block)?.shown ?? null);
    if (next !== held) onmatch(next);
    inform(`Recorded your belief ${belief} in ${claim}; Save MatchClaims… keeps it.`);
  } finally {
    believing = false;
  }
}
</script>

{#snippet details(claim: ClaimLine, entry: Parameters<typeof claimEntryLine>[1])}
  <div class="provenance">
    <ProvenanceDetails
      line={claimEntryLine(claim, entry, user.state.user, context)}
      missing={NO_PROVENANCE}
      mine={claim.mine}
      label="Your belief in {claim.id}"
      disabled={!tables.connected || believing}
      title={tables.connected ? undefined : MATCHES_NEED_A_SERVER}
      onbelieve={(belief) => believe(claim.id, belief, claim.mine)}
    />
  </div>
{/snippet}

<section class="area claims" aria-labelledby="{uid}-claims">
  <h3 id="{uid}-claims">MatchClaims</h3>
  <ul aria-labelledby="{uid}-claims">
    {#each claims as claim (claim.id)}
      <li data-claim={claim.id}>
        <code class="stamp-code">{claim.id}</code>
        {#if !claim.held}
          <span class="hint">{loaded === null ? "no table loaded" : "not in the MatchClaim table"}</span>
        {:else if provenance === null}
          {@render details(claim, undefined)}
        {:else}
          {#await provenance}
            <span class="hint" role="status">Reading the provenance…</span>
            {@render details(claim, undefined)}
          {:then read}
            {@render details(claim, entryOf(read, claim.id))}
          {:catch error}
            <span class="problem" role="status">{provenanceFailure(error)}</span>
            {@render details(claim, undefined)}
          {/await}
        {/if}
      </li>
    {/each}
  </ul>
</section>

<style>
  ul {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 0.5rem;
  }

  /* A MatchClaim's provenance, under its ID: the Metadata tab's details. */
  .provenance {
    flex-basis: 100%;
    padding: 0.35rem 0.5rem;
    border-left: 3px solid #c9d8ea;
    background: #f7f9fc;
    font-size: 0.75rem;
  }
</style>
