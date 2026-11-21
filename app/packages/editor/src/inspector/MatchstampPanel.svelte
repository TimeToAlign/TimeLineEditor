<script lang="ts">
/**
 * The Matchstamp tab, three areas one below the other. **Coordinates**, a
 * bordered panel: a hint while no MatchStamp is shown, else the format
 * switch and its timestamps, in Editor one group per timestamp in screen
 * order (its timeline, the exact value with its unit, read only), else its
 * text in JSON, YAML or TOML with one Copy. **Properties**: the name (naming
 * a potential MatchStamp stores the whole MatchStamp the table states,
 * saying so where the timelines filter hides some of its anchors), each
 * alignment anchor with its `line` and `name` toggles (an anchor the
 * current table no longer states marked red), the MatchClaims behind it,
 * each with its provenance as the Metadata tab shows a pair's
 * (`ProvenanceDetails`: how it was made, read through the server for these
 * MatchClaims only, every actor's belief and the user's own: true,
 * unlikely, false, recorded through the server, which answers the new
 * table), what differs from the current table when a named MatchStamp is
 * out of date, and Update and Remove.
 * **MatchClaim filter**, at the pane's bottom: the block's table (Load
 * MatchClaims…, read through the server; once a belief changed it, Save
 * MatchClaims… saves the new file, never the workspace; Load MatchClaims…
 * over a changed table first asks to save it), its timelines and the belief
 * filter, stored per block in the workspace's settings. A MatchStamp command first closes every group and timeline
 * editor, and a bundle editor of another block, since an editor changes
 * nothing outside what it edits.
 */
import type { LiveStore } from "@timetoalign/tilie-arranger";
import { drawingOf } from "@timetoalign/tilie-arranger";
import type {
  AnchorDisplay,
  BeliefFilter,
  Block,
  Command,
  Manifest,
  TimelineManifest,
} from "@timetoalign/tilie-core";
import { matchClaimFilterOf } from "@timetoalign/tilie-core";
import type { Belief } from "@timetoalign/timetoshare";
import { fontMetrics } from "@timetoalign/timetoshare";
import ConfirmDialog from "../ConfirmDialog.svelte";
import { MATCH_CLAIM_TABLE, openFiles } from "../files.ts";
import type { MatchClaimTables } from "../matchClaims.svelte.ts";
import {
  MATCHES_NEED_A_SERVER,
  provenanceFailure,
  saveFailure,
  unsavedQuestion,
} from "../matchClaims.svelte.ts";
import { informOf, messageOf, warnOf } from "../messages.svelte.ts";
import { userOf } from "../user.svelte.ts";
import { claimEntryLine, entryOf, followedMatch } from "./claimProvenance.ts";
import FormatSwitch from "./FormatSwitch.svelte";
import type { Format } from "./formats.svelte.ts";
import { FORMAT_LABELS, FORMATS, isLoaded, loadCodec } from "./formats.svelte.ts";
import type { ClaimLine, MatchIndexes, ShownStamp } from "./matchstamps.ts";
import {
  addedMatchStamp,
  anchorDisplayCommand,
  claimLines,
  coordinateRows,
  differencesOf,
  hiddenAnchorsNote,
  nameCommand,
  namedComparisons,
  namedStamp,
  potentialStamp,
  removeCommand,
  renameCommand,
  stampText,
  stampToName,
  updateCommand,
} from "./matchstamps.ts";
import { dayOf } from "./metadata/edits.ts";
import ProvenanceDetails from "./ProvenanceDetails.svelte";
import type { HeldMatch } from "./tabs.ts";

interface Props {
  /** The open workspace's store, read as Svelte state. */
  live: LiveStore;
  /** The block the selection lies in, whose MatchClaims are loaded and filtered while no MatchStamp is shown. */
  block: Block | null;
  /** The MatchStamp shown; `null` while none is. */
  match: HeldMatch | null;
  /** The MatchClaim tables of the workspace's blocks. */
  tables: MatchClaimTables;
  /**
   * The anchor indexes of a block's table under its MatchClaim filter and
   * the user's beliefs (`blockIndexes`), the canvas's and the drawer's
   * too; `null` while the block holds no table.
   */
  indexesOf: (block: string) => MatchIndexes | null;
  /** The MatchStamp shown is now `next`: a potential one named, or `null` once removed. */
  onmatch: (next: HeldMatch | null) => void;
}

let { live, block, match, tables, indexesOf, onmatch }: Props = $props();

const uid = $props.id();
/** The editor's one user: the believer, whose beliefs the buttons record. */
const user = userOf();
const inform = informOf();
const warn = warnOf();

const HINT =
  "Turn on Show matches (M) and click a match line to pin a potential MatchStamp. With Show matches off, click a named MatchStamp's connector to select it.";
const UNNAMED = "Naming the MatchStamp stores it; then its anchors' display can be set.";
const NAME_PLACEHOLDER = "Type a name to keep it";
const EMPTY_NAME = "A named MatchStamp keeps a name; Remove deletes it.";
const NO_PROVENANCE = "No provenance entry: the table states none for it.";
const NO_UPDATE =
  "None of its anchors is stated by the current table, so there is nothing to update from.";

/** The toggles of an anchor's display. */
const ANCHOR_TOGGLES: readonly { readonly word: AnchorDisplay; readonly label: string }[] = [
  { word: "line", label: "Line" },
  { word: "name", label: "Name" },
];

/** The belief filter's choices. */
const BELIEF_CHOICES: readonly { readonly value: BeliefFilter; readonly label: string }[] = [
  { value: "not_false", label: "Everything I do not believe false" },
  { value: "true", label: "Only what I believe true" },
];

/** What the Coordinates area shows: the timestamps' values, or the MatchStamp's text in a format. */
type Shown = "editor" | Format;
const SHOWN: readonly { readonly value: Shown; readonly label: string }[] = [
  { value: "editor", label: "Editor" },
  ...FORMATS.map((value) => ({ value, label: FORMAT_LABELS[value] })),
];

const view = $derived(live.view);
/** The block whose MatchClaims the tab shows: the MatchStamp's, else the selection's. */
const blockId = $derived(match?.block ?? block?.id ?? null);
const shownBlock = $derived(blockId === null ? undefined : view.blocks[blockId]);
const manifest: Manifest | undefined = $derived(shownBlock?.manifest);
/** The manifest's `@context`, under which an actor stands for an IRI. */
const context: unknown = $derived(manifest?.["@context"]);
const loaded = $derived(blockId === null ? null : tables.of(blockId));
const filter = $derived(blockId === null ? null : matchClaimFilterOf(view.settings, blockId));
const indexes = $derived(blockId === null ? null : indexesOf(blockId));
const drawing = $derived(
  shownBlock === undefined ? null : drawingOf(shownBlock, view.graphical, fontMetrics),
);
/** The named MatchStamp shown, as its manifest holds it. */
const named = $derived.by(() => {
  if (match === null || match.kind !== "named") return null;
  return manifest?.graphical?.matchstamps?.find((item) => item.id === match.id) ?? null;
});
/** The named MatchStamp compared with the current table; `null` without a table. */
const comparison = $derived.by(() => {
  if (named === null || indexes === null || manifest === undefined) return null;
  return (
    namedComparisons(manifest, indexes.compared).find((item) => item.id === named.id)?.comparison ??
    null
  );
});
const stamp: ShownStamp | null = $derived.by(() => {
  if (match === null || manifest === undefined || drawing === null) return null;
  if (match.kind === "potential") {
    return potentialStamp(match.block, match.index, match.matchStamp, drawing);
  }
  return named === null ? null : namedStamp(match.block, manifest, named, comparison, drawing);
});
/**
 * What naming the potential MatchStamp shown stores: the whole MatchStamp
 * the table states under the belief filter (`stampToName`), which a
 * timelines filter only shows a part of; `null` for a named one.
 */
const naming: ShownStamp | null = $derived.by(() => {
  if (stamp === null || stamp.id !== null || drawing === null) return null;
  return indexes === null ? stamp : stampToName(stamp, indexes, drawing);
});
/** Why naming stores more anchors than are shown; `null` when it stores what is shown. */
const hidden = $derived(
  stamp === null || naming === null ? null : hiddenAnchorsNote(stamp, naming),
);
const rows = $derived(
  stamp === null || manifest === undefined ? [] : coordinateRows(manifest, stamp.coordinates),
);
const claims = $derived(
  stamp === null ? [] : claimLines(loaded?.table ?? null, stamp.claims, user.state.user, context),
);
/** The provenance of the MatchClaims the table holds, read through the server; `null` without a server or table. */
const provenance = $derived.by(() => {
  if (stamp === null || manifest === undefined) return null;
  const held = claims.filter((claim) => claim.held).map((claim) => claim.id);
  return held.length === 0 ? null : tables.provenance(stamp.block, manifest, held);
});
const differences = $derived(
  named === null || comparison === null || indexes === null || manifest === undefined
    ? []
    : differencesOf(manifest, named, comparison, indexes.compared),
);

/** A timeline's name, else its ID, in the shown block's manifest. */
function timelineName(id: string): string {
  return rows.find((row) => row.timeline === id)?.name ?? id;
}

// --- Commands ---------------------------------------------------------------

/** The texts typed, and the refusals, by control: held for the MatchStamp they were typed for. */
let typed: {
  readonly owner: HeldMatch | null;
  readonly name: string | null;
  readonly problems: { readonly [key: string]: string };
} = $state.raw({ owner: null, name: null, problems: {} });
const nameDraft = $derived(typed.owner === match ? typed.name : null);
const problems = $derived(typed.owner === match ? typed.problems : {});

function refused(key: string, message: string): void {
  typed = { owner: match, name: nameDraft, problems: { ...problems, [key]: message } };
}

/**
 * Close every editor a MatchStamp command of block `id` cannot run in:
 * every group or timeline editor, and a bundle editor of another block.
 */
function closeEditors(id: string): void {
  const { store } = live;
  for (let open = store.editing.at(-1); open !== undefined; open = store.editing.at(-1)) {
    if (open.kind === "bundle" && open.target.block === id) return;
    store.done();
  }
}

/** Close the editors in the way, dispatch `command`; a refusal is shown at `key`, an acceptance clears it. */
function send(key: string, id: string, command: Command): boolean {
  closeEditors(id);
  const refusal = live.store.dispatch(command);
  if (refusal !== null) {
    refused(key, refusal.message);
    return false;
  }
  typed = { owner: match, name: key === "name" ? null : nameDraft, problems: {} };
  return true;
}

/** Enter or leaving the name field: name a potential MatchStamp, storing it, or rename a named one. */
function commitName(): void {
  const name = nameDraft;
  if (stamp === null || name === null) return;
  if (stamp.id === null) {
    if (name === "" || naming === null) {
      typed = { owner: match, name: null, problems: {} };
      return;
    }
    const before = live.store.view.blocks[stamp.block]?.manifest;
    if (!send("name", stamp.block, nameCommand(naming, name))) return;
    const added = addedMatchStamp(before, live.store.view.blocks[stamp.block]?.manifest);
    if (added !== null) onmatch({ kind: "named", block: stamp.block, id: added.id });
  } else if (name === "") {
    typed = { owner: match, name: null, problems: { ...problems, name: EMPTY_NAME } };
  } else if (name === stamp.name) {
    typed = { owner: match, name: null, problems: {} };
  } else {
    send("name", stamp.block, renameCommand(stamp.block, stamp.id, name));
  }
}

function onNameKey(event: KeyboardEvent): void {
  if (event.key === "Enter") {
    event.preventDefault();
    commitName();
  } else if (event.key === "Escape") {
    typed = { owner: match, name: null, problems: {} };
  }
}

function toggle(anchor: string, display: readonly AnchorDisplay[], word: AnchorDisplay): void {
  if (stamp === null) return;
  send(anchor, stamp.block, anchorDisplayCommand(stamp.block, anchor, display, word));
}

function update(): void {
  if (stamp === null || stamp.id === null || comparison?.update == null) return;
  if (indexes === null || drawing === null) return;
  send(
    "update",
    stamp.block,
    updateCommand(stamp.block, stamp.id, comparison.update, indexes.compared, drawing),
  );
}

function remove(): void {
  if (stamp === null || stamp.id === null) return;
  if (send("remove", stamp.block, removeCommand(stamp.block, stamp.id))) onmatch(null);
}

// --- Beliefs ----------------------------------------------------------------

/** Whether a belief is being recorded: the belief buttons wait for it. */
let believing = $state(false);

/**
 * Record the user's belief `belief` in the MatchClaim `claim` through the
 * server: the block then holds the new table, marked changed, and the tab
 * follows the MatchStamp into it. The user's own belief again records
 * nothing.
 */
async function believe(claim: string, belief: Belief, mine: Belief | null): Promise<void> {
  if (stamp === null || match === null || manifest === undefined || believing) return;
  if (mine === belief) return;
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

// --- Coordinates ------------------------------------------------------------

let shown: Shown = $state("editor");
/** Why the chosen format's codec could not be loaded; `null` while nothing failed. */
let loadFailure: string | null = $state(null);

function choose(next: Shown): void {
  shown = next;
  loadFailure = null;
  if (next === "editor" || isLoaded(next)) return;
  loadCodec(next).catch((error: unknown) => {
    if (shown === next) loadFailure = `Loading ${FORMAT_LABELS[next]} failed: ${String(error)}`;
  });
}

/** The MatchStamp as text in the chosen format, or why it cannot be written; `null` while its codec loads. */
const text = $derived.by(() => {
  if (stamp === null || manifest === undefined || shown === "editor" || !isLoaded(shown)) {
    return null;
  }
  const written = stampText(shown, manifest, stamp);
  return written.ok
    ? { ok: true as const, text: written.value.text }
    : { ok: false as const, message: written.problems.map((item) => item.message).join(" ") };
});

/** Copy `copied`, confirming with `what` in the message bar. */
async function copy(copied: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(copied);
    inform(`Copied ${what}.`);
  } catch {
    inform(`Copying ${what} failed; select its text to copy it.`);
  }
}

// --- MatchClaim filter ------------------------------------------------------

/** Every timeline of `manifest`, roots and their children in order. */
function timelinesOf(manifest: Manifest): TimelineManifest[] {
  const walk = (timelines: readonly TimelineManifest[]): TimelineManifest[] =>
    timelines.flatMap((timeline) => [timeline, ...walk(timeline.children ?? [])]);
  return walk(manifest.timelines);
}

const timelines = $derived(manifest === undefined ? [] : timelinesOf(manifest));

/** Store `change` in the block's filter; a refusal is shown in the filter area. */
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

{#snippet copyIcon()}
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
    <rect x="5.5" y="5.5" width="8" height="9" rx="1" />
    <path d="M3.5 10.5h-1v-8a1 1 0 0 1 1-1h7v1" />
  </svg>
{/snippet}

<div class="pane">
  <section class="area coordinates" aria-labelledby="{uid}-coordinates">
    <h3 id="{uid}-coordinates">Coordinates</h3>
    {#if stamp === null}
      <p class="hint" data-testid="matchstamp-hint">{HINT}</p>
    {:else}
      <FormatSwitch options={SHOWN} bind:value={() => shown, choose} label="MatchStamp format" />

      {#if shown === "editor"}
        <table>
          {#each rows as row (row.key)}
            <tbody data-timeline={row.timeline}>
              <tr>
                <th colspan="3" scope="colgroup">{row.name}</th>
              </tr>
              <tr>
                <th scope="row">coordinate</th>
                <td class="value">
                  <span class="text">{row.text}</span>
                  {#if row.unit !== null}<span class="unit">{row.unit}</span>{/if}
                  {#if row.pretty !== null}<span class="pretty">{row.pretty}</span>{/if}
                </td>
                <td class="copy">
                  <button
                    type="button"
                    class="icon"
                    aria-label="Copy the value of coordinate of {row.name}"
                    title="Copy the value"
                    onclick={() => copy(row.text, row.text)}>{@render copyIcon()}</button
                  >
                </td>
              </tr>
            </tbody>
          {/each}
        </table>
      {:else}
        {@const label = FORMAT_LABELS[shown]}
        {#if loadFailure !== null}
          <p class="problem" role="alert">{loadFailure}</p>
        {:else if text === null}
          <p class="hint" role="status">Loading {label}…</p>
        {:else if !text.ok}
          <p class="problem" role="status">{text.message}</p>
        {:else}
          {@const written = text.text}
          <div class="text-head">
            <button type="button" onclick={() => copy(written, `the ${label}`)}>Copy</button>
          </div>
          <pre aria-label="The MatchStamp as {label}">{written}</pre>
        {/if}
      {/if}
    {/if}
  </section>

  {#if stamp !== null}
    {@const unnamed = stamp.id === null}
    <section
      class={["area", "properties", { unnamed }]}
      aria-labelledby="{uid}-properties"
      data-testid="matchstamp-properties"
    >
      <h3 id="{uid}-properties">Properties</h3>
      <div class="grid">
        <label class="key" for="{uid}-name">Name</label>
        <div class="field">
          <input
            id="{uid}-name"
            class="name"
            type="text"
            size="16"
            placeholder={unnamed ? NAME_PLACEHOLDER : undefined}
            value={nameDraft ?? stamp.name ?? ""}
            aria-invalid={problems.name !== undefined}
            aria-describedby={unnamed
              ? `${uid}-name-problem ${uid}-unnamed${hidden === null ? "" : ` ${uid}-hidden`}`
              : `${uid}-name-problem`}
            oninput={(event) =>
              (typed = { owner: match, name: event.currentTarget.value, problems: {} })}
            onkeydown={onNameKey}
            onblur={commitName}
          />
          <span class="problem" id="{uid}-name-problem" role="status">{problems.name ?? ""}</span>
        </div>
      </div>
      {#if unnamed}
        <p class="hint" id="{uid}-unnamed">{UNNAMED}</p>
        {#if hidden !== null}
          <p class="hint" id="{uid}-hidden" data-testid="matchstamp-hidden-anchors">{hidden}</p>
        {/if}
      {/if}

      <h4 id="{uid}-anchors">Alignment anchors</h4>
      <ul class="anchors" aria-labelledby="{uid}-anchors">
        {#each stamp.anchors as anchor (anchor.key)}
          {@const [first, second] = anchor.coordinates}
          {@const gone = anchor.stated === false}
          <li class={{ gone }} data-anchor={anchor.id}>
            <span class="anchor-name"
              >{timelineName(first.timeline)} – {timelineName(second.timeline)}{#if anchor.id !== null}
                <code>{anchor.id}</code>{/if}</span
            >
            {#if gone}<span class="gone-word">not stated by the table</span>{/if}
            <span class="toggles" role="group" aria-label="Display of {anchor.id ?? 'the anchor'}">
              {#each ANCHOR_TOGGLES as { word, label } (word)}
                <button
                  type="button"
                  class="toggle"
                  aria-pressed={anchor.display?.includes(word) ?? false}
                  disabled={anchor.id === null || anchor.display === null}
                  onclick={() => {
                    if (anchor.id !== null && anchor.display !== null) {
                      toggle(anchor.id, anchor.display, word);
                    }
                  }}>{label}</button
                >
              {/each}
            </span>
            {#if anchor.id !== null && problems[anchor.id] !== undefined}
              <span class="problem" role="status">{problems[anchor.id]}</span>
            {/if}
          </li>
        {/each}
      </ul>

      <h4 id="{uid}-claims">MatchClaims</h4>
      <ul class="claims" aria-labelledby="{uid}-claims">
        {#each claims as claim (claim.id)}
          <li data-claim={claim.id}>
            <code>{claim.id}</code>
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

      {#if differences.length > 0}
        <div class="differences" data-testid="matchstamp-differences">
          <h4>Out of date</h4>
          <dl>
            {#each differences as difference (difference.label)}
              <dt>{difference.label}</dt>
              <dd>{difference.items.join(", ")}</dd>
            {/each}
          </dl>
        </div>
      {/if}

      {#if !unnamed}
        <div class="actions">
          {#if comparison?.outOfDate === true}
            <button
              type="button"
              disabled={comparison.update === null}
              title={comparison.update === null ? NO_UPDATE : undefined}
              onclick={update}>Update</button
            >
          {/if}
          <button type="button" class="delete" onclick={remove}>Remove</button>
          <span class="problem" role="status">{problems.update ?? problems.remove ?? ""}</span>
        </div>
      {/if}
    </section>
  {/if}

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
            <button type="button" onclick={saveTable}>Save MatchClaims…</button>
          {/if}
        {/if}
        <button
          type="button"
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
  </section>
  <ConfirmDialog bind:this={confirm} />
</div>

<style>
  p {
    margin: 0;
  }

  .pane {
    display: flex;
    flex: 1 0 auto;
    flex-direction: column;
    gap: 0.75rem;
  }

  .area {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  h3,
  h4 {
    margin: 0;
    color: #595959;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  h4 {
    margin-top: 0.3rem;
    font-size: 0.7rem;
  }

  .coordinates {
    padding: 0.5rem 0.6rem 0.6rem;
    border: 1px solid #c8c8c8;
    border-radius: 4px;
  }

  .hint {
    color: #595959;
  }

  .problem {
    color: #b00020;
  }

  .problem:empty {
    display: none;
  }

  .field .problem {
    display: block;
    font-size: 0.75rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  th[scope="colgroup"] {
    padding: 0.5rem 0 0.2rem;
    color: #1a1a1a;
    font-weight: 600;
    text-align: left;
  }

  th[scope="row"] {
    color: #595959;
    font-weight: normal;
    text-align: left;
  }

  td,
  th[scope="row"] {
    padding: 0.15rem 0;
    border-top: 1px solid #e4e4e4;
  }

  .value {
    padding-left: 0.5rem;
  }

  .unit,
  .pretty {
    margin-left: 0.25rem;
    color: #595959;
    font-family: system-ui, "TiLiE Noto Music", sans-serif;
  }

  .copy {
    width: 1%;
    padding-left: 0.4rem;
    text-align: center;
  }

  button {
    padding: 0.1rem 0.4rem;
    border: 1px solid #c8c8c8;
    border-radius: 3px;
    background: #fff;
    font: inherit;
    font-size: 0.75rem;
    cursor: pointer;
  }

  button.icon {
    display: inline-flex;
    padding: 0.15rem;
    line-height: 0;
  }

  button.icon svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.2;
  }

  button:hover:enabled {
    border-color: #0a84ff;
  }

  button:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .text-head {
    display: flex;
    justify-content: flex-end;
  }

  pre {
    margin: 0;
    padding: 0.5rem;
    overflow-x: auto;
    border-radius: 4px;
    background: #f5f5f5;
    font-family: ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace;
    font-size: 0.75rem;
    user-select: all;
  }

  .grid {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: baseline;
    gap: 0.4rem 0.75rem;
  }

  .key {
    color: #595959;
  }

  .name:focus::placeholder {
    color: transparent;
  }

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

  /* An anchor the current table no longer states: the drawing's red. */
  li.gone .anchor-name,
  .gone-word {
    color: #e51400;
  }

  .gone-word {
    font-size: 0.75rem;
  }

  code {
    font-family: ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace;
  }

  /* A MatchClaim's provenance, under its ID: the Metadata tab's details. */
  .provenance {
    flex-basis: 100%;
    padding: 0.35rem 0.5rem;
    border-left: 3px solid #c9d8ea;
    background: #f7f9fc;
    font-size: 0.75rem;
  }

  .toggles {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .toggle[aria-pressed="true"] {
    border-color: #0a84ff;
    background: #e8f0fe;
    color: #0b3d91;
  }

  .unnamed .toggles {
    opacity: 0.5;
  }

  .differences dl {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 0.2rem 0.75rem;
    margin: 0;
  }

  .differences dt {
    color: #595959;
  }

  .differences dd {
    margin: 0;
  }

  .actions {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
  }

  /* The MatchClaim filter: at the pane's bottom. */
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
