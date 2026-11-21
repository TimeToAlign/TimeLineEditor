<script lang="ts">
/**
 * The Matchstamp tab's MatchClaims: each MatchClaim behind the MatchStamp
 * shown, collapsed to its ID. Expanded, it shows what matters of it: the
 * events on both sides (each side's timeline, its event's ID and name, or
 * that the side has no event), read through the server once a MatchClaim
 * is expanded; its certainty;
 * every actor's belief and the user's own (true, unlikely, false, recorded
 * through the server, which answers the new table); and a Provenance
 * button that alone opens how it was made (the paradata, as the Metadata
 * tab shows a pair's, `Provenance`). One the table does not hold says so.
 * One status line under the heading says what is being read for the
 * MatchClaims expanded, or why a read failed.
 */
import type { ClaimEvents, ClaimProvenance, ClaimProvenanceEntry } from "@timetoalign/tilie-client";
import type { Manifest } from "@timetoalign/tilie-core";
import type { Belief } from "@timetoalign/timetoshare";
import { SvelteSet } from "svelte/reactivity";
import type { LoadedTable, MatchClaimTables } from "../../matchClaims.svelte.ts";
import {
  eventsFailure,
  MATCHES_NEED_A_SERVER,
  provenanceFailure,
} from "../../matchClaims.svelte.ts";
import { informOf, warnOf } from "../../messages.svelte.ts";
import { userOf } from "../../user.svelte.ts";
import { claimEntryLine, entryOf, followedMatch } from "../claimProvenance.ts";
import type { ClaimLine, MatchIndexes, ShownStamp, SideLine } from "../matchstamps.ts";
import { claimDetails } from "../matchstamps.ts";
import { dayOf } from "../metadata/edits.ts";
import Provenance from "../Provenance.svelte";
import ProvenanceDetails from "../ProvenanceDetails.svelte";
import type { HeldMatch } from "../tabs.ts";
import { Settlements } from "./settlements.svelte.ts";

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
const READING_PROVENANCE = "Reading the provenance…";
const READING_EVENTS = "Reading the events…";

/** The MatchClaims expanded, by ID. */
const expanded = new SvelteSet<string>();
/** Whether a belief is being recorded: the belief buttons wait for it. */
let believing = $state(false);

/** The MatchClaims the table holds, whose events are read. */
const held = $derived(claims.filter((claim) => claim.held).map((claim) => claim.id));
/**
 * The events of the MatchClaims held, read through the server once one of
 * them is expanded (one request for all of them, kept by the tables);
 * `null` before, and without a server or a table.
 */
const events = $derived(
  expanded.size === 0 || held.length === 0 ? null : tables.events(stamp.block, manifest, held),
);
const eventReads = new Settlements<readonly ClaimEvents[]>();
const provenanceReads = new Settlements<readonly ClaimProvenance[]>();
/** How the events read settled; `undefined` while it is pending or there is none. */
const eventsRead = $derived(events === null ? undefined : eventReads.of(events));
/**
 * How the provenance read settled; `undefined` while it is pending or
 * there is none. Read as state, so the MatchClaims' entries are rendered
 * once and an open Provenance stays open when the read settles.
 */
const provenanceRead = $derived(provenance === null ? undefined : provenanceReads.of(provenance));
/**
 * What the one status line says while a MatchClaim the table holds is
 * expanded: each read still pending, or why it failed.
 */
const statusLines = $derived.by(() => {
  if (!claims.some((claim) => claim.held && expanded.has(claim.id))) return [];
  const lines: { key: string; text: string; problem: boolean }[] = [];
  if (events !== null) {
    if (eventsRead === undefined)
      lines.push({ key: "events", text: READING_EVENTS, problem: false });
    else if (!eventsRead.fulfilled) {
      lines.push({ key: "events", text: eventsFailure(eventsRead.failure), problem: true });
    }
  }
  if (provenance !== null) {
    if (provenanceRead === undefined) {
      lines.push({ key: "provenance", text: READING_PROVENANCE, problem: false });
    } else if (!provenanceRead.fulfilled) {
      lines.push({
        key: "provenance",
        text: provenanceFailure(provenanceRead.failure),
        problem: true,
      });
    }
  }
  return lines;
});
/** What a MatchClaim's entry says while it has no provenance to show. */
const waiting = $derived(
  provenance === null
    ? tables.connected
      ? ""
      : MATCHES_NEED_A_SERVER
    : provenanceRead === undefined
      ? READING_PROVENANCE
      : "",
);

/** The provenance entry the read gives MatchClaim `id`; `undefined` while there is none to give. */
function readOf(id: string): ClaimProvenanceEntry | null | undefined {
  return provenanceRead?.fulfilled ? entryOf(provenanceRead.value, id) : undefined;
}

function toggle(id: string): void {
  if (expanded.has(id)) expanded.delete(id);
  else expanded.add(id);
}

/**
 * Record the user's belief `belief` in the MatchClaim `claim` through the
 * server: the block then holds the new table, marked changed, and the tab
 * follows the MatchStamp into it. The user's own belief again records
 * nothing.
 */
async function believe(claim: string, belief: Belief, mine: Belief | null): Promise<void> {
  if (believing || mine === belief) return;
  const shown = stamp;
  const before = match;
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
    const next = followedMatch(before, shown, indexesOf(shown.block)?.shown ?? null);
    if (next !== before) onmatch(next);
    inform(`Recorded your belief ${belief} in ${claim}; Save MatchClaims… keeps it.`);
  } finally {
    believing = false;
  }
}
</script>

{#snippet event(side: SideLine)}
  {#if side.event === null}
    <span class="hint">no event</span>
  {:else}
    <code class="stamp-code">{side.event}</code>{side.name === null ? "" : ` “${side.name}”`}
  {/if}
{/snippet}

{#snippet entry(claim: ClaimLine, read: ClaimProvenanceEntry | null | undefined, waiting: string)}
  {@const line = claimEntryLine(claim, read, user.state.user, context)}
  <ProvenanceDetails
    paradata={false}
    {line}
    missing={NO_PROVENANCE}
    mine={claim.mine}
    label="Your belief in {claim.id}"
    disabled={!tables.connected || believing}
    title={tables.connected ? undefined : MATCHES_NEED_A_SERVER}
    onbelieve={(belief) => believe(claim.id, belief, claim.mine)}
  />
  <div class="provenance">
    <Provenance
      subject={claim.id}
      beliefs={false}
      {line}
      missing={NO_PROVENANCE}
      mine={claim.mine}
      onbelieve={(belief) => believe(claim.id, belief, claim.mine)}
    >
      {#if read === undefined && waiting !== ""}<p class="hint">{waiting}</p>{/if}
    </Provenance>
  </div>
{/snippet}

<section class="area claims" aria-labelledby="{uid}-claims">
  <h3 id="{uid}-claims">MatchClaims</h3>
  <p class="status" role="status"
    >{#each statusLines as line, at (line.key)}{at > 0 ? " " : ""}<span
          class={{ problem: line.problem }}>{line.text}</span
        >{/each}</p
  >
  <ul aria-labelledby="{uid}-claims">
    {#each claims as claim, index (claim.id)}
      {@const open = expanded.has(claim.id)}
      <li data-claim={claim.id}>
        <button
          type="button"
          class="toggle"
          aria-expanded={open}
          aria-controls="{uid}-claim-{index}"
          onclick={() => toggle(claim.id)}
        >
          <svg class="chevron" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path d="M6 3.5 10.5 8 6 12.5" />
          </svg>
          <code class="stamp-code">{claim.id}</code>
        </button>
        <div class="claim" id="{uid}-claim-{index}" hidden={!open}>
          {#if !claim.held}
            <p class="hint">{loaded === null ? "no table loaded" : "not in the MatchClaim table"}</p>
          {:else}
            {#if events === null && open && !tables.connected}
              <p class="hint">{MATCHES_NEED_A_SERVER}</p>
            {:else if eventsRead?.fulfilled}
              {@const details = claimDetails(eventsRead.value, claim.id, manifest)}
              {#if details !== null}
                <dl class="events" data-testid="matchclaim-events">
                  {#each details.sides as side, at (at)}
                    <dt title={side.timeline}>{side.timelineName}</dt>
                    <dd>{@render event(side)}</dd>
                  {/each}
                  {#if details.certainty !== null}
                    <dt>certainty</dt>
                    <dd>{details.certainty}</dd>
                  {/if}
                </dl>
              {/if}
            {/if}
            {@render entry(claim, readOf(claim.id), waiting)}
          {/if}
        </div>
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

  .toggle {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.1rem 0;
    border: none;
    background: none;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .toggle:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }

  .chevron {
    flex: none;
    fill: none;
    stroke: #1d4f91;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: transform 120ms ease-out;
  }

  .toggle[aria-expanded="true"] .chevron {
    transform: rotate(90deg);
  }

  @media (prefers-reduced-motion: reduce) {
    .chevron {
      transition: none;
    }
  }

  /* A MatchClaim expanded, under its ID. */
  .claim {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin: 0.1rem 0 0.25rem 1.1rem;
    padding: 0.35rem 0.5rem;
    border-left: 3px solid #c9d8ea;
    background: #f7f9fc;
    font-size: 0.75rem;
  }

  .claim[hidden] {
    display: none;
  }

  .status {
    font-size: 0.75rem;
  }

  .events {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.1rem 0.5rem;
    margin: 0;
  }

  .events dt {
    color: #595959;
  }

  .events dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .provenance {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 0.5rem;
  }
</style>
