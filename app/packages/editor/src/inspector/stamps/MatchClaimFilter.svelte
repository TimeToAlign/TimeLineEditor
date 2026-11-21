<script lang="ts">
/**
 * The Matchstamp tab's MatchClaim filter, at the pane's bottom: the block's
 * table (Load MatchClaims…, read through the server; once a belief changed
 * it, Save MatchClaims… saves the new file, never the workspace; Load
 * MatchClaims… over a changed table first asks to save it), its timelines
 * and the belief filter, stored per block in the workspace's settings.
 */
import type { LiveStore } from "@timetoalign/tilie-arranger";
import type { BeliefFilter, Manifest, TimelineManifest } from "@timetoalign/tilie-core";
import { matchClaimFilterOf } from "@timetoalign/tilie-core";
import ConfirmDialog from "../../ConfirmDialog.svelte";
import { MATCH_CLAIM_TABLE, openFiles } from "../../files.ts";
import type { MatchClaimTables } from "../../matchClaims.svelte.ts";
import { MATCHES_NEED_A_SERVER, saveFailure, unsavedQuestion } from "../../matchClaims.svelte.ts";
import { informOf, messageOf, warnOf } from "../../messages.svelte.ts";

interface Props {
  /** The open workspace's store, read as Svelte state. */
  live: LiveStore;
  /** The block whose MatchClaims are filtered; `null` while none is. */
  blockId: string | null;
  /** Its manifest. */
  manifest: Manifest | undefined;
  /** The MatchClaim tables of the workspace's blocks. */
  tables: MatchClaimTables;
}

let { live, blockId, manifest, tables }: Props = $props();

const uid = $props.id();
const inform = informOf();
const warn = warnOf();

/** The belief filter's choices. */
const BELIEF_CHOICES: readonly { readonly value: BeliefFilter; readonly label: string }[] = [
  { value: "not_false", label: "Everything I do not believe false" },
  { value: "true", label: "Only what I believe true" },
];

const loaded = $derived(blockId === null ? null : tables.of(blockId));
const filter = $derived(blockId === null ? null : matchClaimFilterOf(live.view.settings, blockId));

/** Every timeline of `manifest`, roots and their children in order. */
function timelinesOf(manifest: Manifest): TimelineManifest[] {
  const walk = (timelines: readonly TimelineManifest[]): TimelineManifest[] =>
    timelines.flatMap((timeline) => [timeline, ...walk(timeline.children ?? [])]);
  return walk(manifest.timelines);
}

const timelines = $derived(manifest === undefined ? [] : timelinesOf(manifest));

/** Store `change` in the block's filter; a refusal is shown in the message bar. */
function configure(change: { timelines?: readonly string[] | null; belief?: BeliefFilter }): void {
  if (blockId === null || filter === null) return;
  const next = { ...filter, ...change };
  const refusal = live.store.configure({ matchClaimFilters: { [blockId]: next } });
  if (refusal !== null) warn(`The MatchClaim filter was not changed: ${refusal.message}`);
}

/** Whether the filter shows the MatchClaims of `timeline`. */
function listed(timeline: string): boolean {
  return filter?.timelines == null || filter.timelines.includes(timeline);
}

/** Show or leave out the MatchClaims of `timeline`; every timeline listed is stated as none (`null`). */
function toggleTimeline(timeline: string): void {
  const all = timelines.map((item) => item.id);
  const current = filter?.timelines ?? all;
  const next = current.includes(timeline)
    ? current.filter((item) => item !== timeline)
    : [...current, timeline];
  configure({ timelines: all.every((item) => next.includes(item)) ? null : [...next].sort() });
}

let loading = $state(false);
let loadButton: HTMLButtonElement | undefined = $state();
let confirm: ConfirmDialog | undefined = $state();

/** Save block `id`'s changed table, offered under its file's name; whether it was saved. */
async function saveTableOf(id: string): Promise<boolean> {
  try {
    const name = await tables.save(id);
    if (name === null) return false;
    inform(`Saved the MatchClaims as ${name}.`);
    return true;
  } catch (error) {
    warn(saveFailure(error));
    return false;
  }
}

/** Save the block's changed table. */
async function saveTable(): Promise<void> {
  if (blockId !== null) await saveTableOf(blockId);
}

/**
 * Whether block `id`'s table may be replaced: it is not changed, or the
 * viewer saves it (and the save is made) or discards it, asked below Load
 * MatchClaims….
 */
async function mayReplaceTable(id: string): Promise<boolean> {
  const held = tables.of(id);
  if (held === null || !held.changed) return true;
  const answer = await confirm?.ask(
    unsavedQuestion(null, [held.name]),
    ["Save", "Discard", "Cancel"],
    "Cancel",
    loadButton ?? null,
  );
  if (answer === "Discard") return true;
  if (answer !== "Save") return false;
  return saveTableOf(id);
}

/** Let the viewer pick the block's MatchClaim table and read it through the server. */
async function loadTable(): Promise<void> {
  if (blockId === null || manifest === undefined) return;
  const id = blockId;
  const held = manifest;
  if (!(await mayReplaceTable(id))) return;
  try {
    const [picked] = await openFiles(MATCH_CLAIM_TABLE);
    if (picked === undefined) return;
    loading = true;
    const failure = await tables.load(id, held, picked.file, picked.name);
    if (failure !== null) warn(failure);
    else inform(`Loaded the MatchClaims of ${picked.name}.`);
  } catch (error) {
    warn(`The MatchClaim table could not be loaded: ${messageOf(error)}`);
  } finally {
    loading = false;
  }
}
</script>

<section class="area filter" aria-labelledby="{uid}-filter">
  <h3 id="{uid}-filter">MatchClaim filter</h3>
  {#if blockId === null || filter === null}
    <p class="hint">Select a block to load its MatchClaims and set their filter.</p>
  {:else}
    <div class="table-line">
      {#if loaded === null}
        <span class="hint" data-testid="matchclaims-status">No MatchClaim table loaded.</span>
      {:else}
        <span data-testid="matchclaims-status"
          >{loaded.name}: {loaded.table.columns.rows} MatchClaims{#if loaded.changed}, changed{/if}</span
        >
        {#if loaded.changed}
          <button type="button" class="action" onclick={saveTable}>Save MatchClaims…</button>
        {/if}
      {/if}
      <button
        type="button"
        class="action"
        bind:this={loadButton}
        disabled={!tables.connected || loading}
        aria-describedby={tables.connected ? undefined : `${uid}-no-server`}
        onclick={loadTable}>Load MatchClaims…</button
      >
    </div>
    {#if !tables.connected}
      <p class="hint" id="{uid}-no-server">{MATCHES_NEED_A_SERVER}</p>
    {/if}
    <fieldset>
      <legend>Timelines</legend>
      {#each timelines as timeline (timeline.id)}
        <label class="choice">
          <input
            type="checkbox"
            checked={listed(timeline.id)}
            onchange={() => toggleTimeline(timeline.id)}
          />
          {timeline.name ?? timeline.id}
        </label>
      {/each}
    </fieldset>
    <fieldset>
      <legend>Beliefs</legend>
      {#each BELIEF_CHOICES as choice (choice.value)}
        <label class="choice">
          <input
            type="radio"
            name="{uid}-belief"
            value={choice.value}
            checked={filter.belief === choice.value}
            onchange={() => configure({ belief: choice.value })}
          />
          {choice.label}
        </label>
      {/each}
    </fieldset>
  {/if}
  <ConfirmDialog bind:this={confirm} />
</section>

<style>
  /* At the pane's bottom. */
  .filter {
    position: sticky;
    bottom: 0;
    margin-top: auto;
    padding: 0.3rem 0;
    border-top: 1px solid #e4e4e4;
    background: #fff;
    font-size: 0.75rem;
  }

  .table-line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.25rem 0.75rem;
  }

  fieldset {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 0.75rem;
    margin: 0;
    padding: 0.2rem 0 0;
    border: none;
  }

  legend {
    padding: 0;
    color: #595959;
  }

  .choice {
    display: inline-flex;
    align-items: baseline;
    gap: 0.25rem;
  }
</style>
