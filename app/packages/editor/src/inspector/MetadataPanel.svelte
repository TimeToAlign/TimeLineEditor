<script lang="ts">
/**
 * The Metadata tab: the links of the inspected element (`inspectedOf`: the
 * selected bundle, timeline or region, the edited element in an editor, the
 * one bundle at the top level), one card per link in the order the element
 * holds them, two readings of one work two cards. A field "Paste a URL"
 * creates a link through TimeToShare's registry; where the registry tells
 * no level, a level is chosen first. The first paste asks for the viewer's
 * identity, which asserts every link they create (`Identity`). Every change
 * is one `set` of the element's `links`, built from the store's current
 * links by the schema package's functions; a refusal or a text that gives
 * no link is posted to the message bar.
 */
import type { Editing, Subject } from "@timetoalign/tilie-arranger";
import type { Store, View } from "@timetoalign/tilie-core";
import { sameAddress } from "@timetoalign/tilie-core";
import type { CompleteLink, Level } from "@timetoalign/timetoshare";
import { informOf } from "../messages.svelte.ts";
import IdentityDialog from "./IdentityDialog.svelte";
import type { Identity } from "./identity.svelte.ts";
import type { Inspected } from "./metadata.ts";
import {
  ASSERTION_STATUSES,
  absenceChoices,
  dayOf,
  describedOf,
  extended,
  heldBy,
  inspectedOf,
  isRegisteredAbsence,
  LINK_LEVELS,
  linkCard,
  linksCommand,
  pasted,
  relabelled,
  removed,
  replaced,
  sameLink,
  viewerAssertion,
  withAbsence,
  withStatus,
} from "./metadata.ts";

let {
  view,
  store,
  subjects,
  editing,
  identity,
}: {
  view: View;
  store: Store;
  /** The selection, resolved. */
  subjects: readonly Subject[];
  /** The innermost open editor; `null` at the top level. */
  editing: Editing | null;
  /** Who asserts the links the viewer creates. */
  identity: Identity;
} = $props();

const uid = $props.id();
const inform = informOf();

/** The element whose links are shown, or the hint saying how to reach one. */
const shown = $derived(inspectedOf(view, subjects, editing));
const described = $derived(shown.kind === "none" ? null : describedOf(shown.block.manifest));
const held = $derived(
  shown.kind === "none" || described === null
    ? null
    : (heldBy(described.complete, shown.id) ?? null),
);
const cards = $derived(
  held === null || described === null
    ? []
    : held.links.map((_, index) => linkCard(described, held, index)),
);

/** The text of the paste field. */
let text = $state("");
/** A pasted URL whose level is to be chosen, for the element it was pasted on. */
let pending = $state<{ readonly url: string; readonly target: Inspected["target"] } | null>(null);
let level = $state<Level>("work");
/** The card whose Add URL field is open; `null` for none. */
let adding = $state<number | null>(null);
let addition = $state("");
let dialog: ReturnType<typeof IdentityDialog> | undefined = $state();

/** The pending URL, while the element it was pasted on is shown. */
const waiting = $derived(
  pending !== null && shown.kind !== "none" && sameAddress(pending.target, shown.target)
    ? pending
    : null,
);

/** The links `inspected` holds in the store now. */
function current(inspected: Inspected): readonly CompleteLink[] {
  const block = store.view.blocks[inspected.block.id];
  if (block === undefined) return [];
  return heldBy(describedOf(block.manifest).complete, inspected.id)?.links ?? [];
}

/** Dispatch the links `next` of `inspected`; a refusal is posted. Whether the store took them. */
function change(inspected: Inspected, next: readonly CompleteLink[]): boolean {
  const refusal = store.dispatch(linksCommand(inspected, next));
  if (refusal === null) return true;
  inform(`The links could not be changed: ${refusal.message}`);
  return false;
}

/** Change the link `index` of the shown element by `edit`; nothing when it gives the same link. */
function edit(index: number, edited: (link: CompleteLink) => CompleteLink): void {
  if (shown.kind === "none") return;
  const links = current(shown);
  const link = links[index];
  if (link === undefined) return;
  const next = edited(link);
  if (!sameLink(next, link)) change(shown, replaced(links, index, next));
}

/** The assertion of a link created now. */
function assertion() {
  return viewerAssertion(identity.uri, dayOf(new Date()));
}

/** Append `link` to the links of `inspected`; the paste field is cleared once it is taken. */
function append(inspected: Inspected, link: CompleteLink): void {
  if (change(inspected, [...current(inspected), link])) {
    text = "";
    pending = null;
  }
}

/** Ask for the identity; `false` when the viewer cancels. */
async function askIdentity(): Promise<boolean> {
  const answer = await dialog?.ask(identity.uri);
  if (answer === undefined || answer === null) return false;
  identity.give(answer.uri);
  return true;
}

/** Create a link from the pasted text on the shown element, asking for the identity the first time. */
async function take(pastedText: string): Promise<void> {
  const inspected = shown;
  if (inspected.kind === "none" || pastedText.trim() === "") return;
  if (identity.asks && !(await askIdentity())) return;
  const result = pasted(pastedText, assertion());
  if (result.kind === "link") append(inspected, result.link);
  else if (result.kind === "level") pending = { url: result.url, target: inspected.target };
  else inform(result.message);
}

/** Create the waiting URL's link at the chosen level. */
function createAtLevel(): void {
  if (waiting === null || shown.kind === "none") return;
  const result = pasted(waiting.url, assertion(), level);
  if (result.kind === "link") append(shown, result.link);
  else if (result.kind === "refused") inform(result.message);
}

function onPaste(event: ClipboardEvent): void {
  const data = event.clipboardData?.getData("text/plain") ?? "";
  if (data === "") return;
  event.preventDefault();
  text = data;
  void take(data);
}

function onPasteKey(event: KeyboardEvent): void {
  if (event.key !== "Enter") return;
  event.preventDefault();
  void take(text);
}

function onAddKey(event: KeyboardEvent, index: number): void {
  if (event.key === "Escape") {
    event.preventDefault();
    adding = null;
    return;
  }
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (shown.kind === "none") return;
  const link = current(shown)[index];
  if (link === undefined) return;
  const result = extended(link, addition);
  if (!result.ok) {
    inform(result.message);
    return;
  }
  if (change(shown, replaced(current(shown), index, result.link))) {
    adding = null;
    addition = "";
  }
}

function openAdding(index: number): void {
  adding = index;
  addition = "";
}

function removeLink(index: number): void {
  if (shown.kind === "none") return;
  change(shown, removed(current(shown), index));
}

/** The status chosen in a select: one of the schema's, or none. */
function statusOf(value: string): (typeof ASSERTION_STATUSES)[number] | null {
  return ASSERTION_STATUSES.find((status) => status === value) ?? null;
}

/** Focus an element once it is mounted. */
function focused(element: HTMLElement): void {
  element.focus();
}
</script>

{#if shown.kind === "none"}
  <p class="hint">{shown.hint}</p>
{:else}
  <p class="owner" data-testid="metadata-owner">Links of {shown.words}</p>

  <div class="paste">
    <label for="{uid}-paste">Paste a URL</label>
    <input
      id="{uid}-paste"
      type="url"
      bind:value={text}
      onpaste={onPaste}
      onkeydown={onPasteKey}
      aria-describedby="{uid}-paste-hint"
    />
    <p id="{uid}-paste-hint" class="hint">
      A catalogue page (MusicBrainz, Wikidata, VIAF, GND, IMSLP, DOI) or any other URI; Enter adds it
      as a link.
    </p>
  </div>

  {#if waiting !== null}
    <div class="level" role="group" aria-labelledby="{uid}-level-question">
      <p id="{uid}-level-question">
        The registry tells no level for <code>{waiting.url}</code>. What does it name?
      </p>
      <label>
        Level
        <select bind:value={level}>
          {#each LINK_LEVELS as item (item)}
            <option value={item}>{item}</option>
          {/each}
        </select>
      </label>
      <button type="button" onclick={createAtLevel}>Add link</button>
      <button type="button" onclick={() => (pending = null)}>Cancel</button>
    </div>
  {/if}

  <p class="identity" data-testid="metadata-identity">
    {#if identity.uri !== null}
      Your links are asserted by
      <a href={identity.uri} target="_blank" rel="noopener noreferrer">{identity.uri}</a>.
    {:else if identity.answered}
      Your links are asserted without an identity.
    {:else}
      Your first link asks who asserts it.
    {/if}
    <button type="button" onclick={() => void askIdentity()}>Change identity</button>
  </p>

  {#if cards.length === 0}
    <p class="hint">No links.</p>
  {:else}
    <ol class="links" aria-label="Links">
      {#each cards as card, index (index)}
        {@const name = `${uid}-link-${index}`}
        <li class="card" aria-labelledby="{name}-heading">
          <p id="{name}-heading" class="heading">
            <span class="level-word">{card.level}</span>
            <span class="relation">{card.relation}</span>
            {#if card.label !== null}<span class="label">{card.label}</span>{/if}
          </p>

          <div class="row">
            <label for="{name}-label">Label</label>
            <input
              id="{name}-label"
              type="text"
              value={card.label ?? ""}
              onchange={(event) => edit(index, (link) => relabelled(link, event.currentTarget.value))}
            />
          </div>

          {#if card.uris.length > 0}
            <ul class="uris" aria-label="URIs">
              {#each card.uris as uri, at (uri)}
                <li>
                  <a href={uri} target="_blank" rel="noopener noreferrer">{uri}</a>
                  {#if at === 0}<span class="preferred">preferred</span>{/if}
                </li>
              {/each}
            </ul>
          {/if}

          {#if card.identifiers.length > 0}
            <ul class="identifiers" aria-label="Identifiers">
              {#each card.identifiers as identifier, at (at)}
                <li><span class="scheme">{identifier.scheme}</span> <code>{identifier.value}</code></li>
              {/each}
            </ul>
          {/if}

          {#if card.records.length > 0}
            <ul class="records" aria-label="Records">
              {#each card.records as record, at (at)}
                <li><code>{record}</code></li>
              {/each}
            </ul>
          {/if}

          {#if card.parts !== null}
            <section class="parts" aria-labelledby="{name}-parts">
              <p id="{name}-parts">
                Parts: <code>{card.parts.relation}</code>,
                {card.parts.ordered ? "in their own order" : "in display order only"}
              </p>
              <ol aria-label="Part slots">
                {#each card.parts.slots as slot, at (at)}
                  <li>
                    <span class="slot-label">{slot.label ?? `Part ${slot.position}`}</span>
                    {#each slot.uris.slice(0, 1) as uri (uri)}
                      <a href={uri} target="_blank" rel="noopener noreferrer">{uri}</a>
                    {/each}
                    {#if slot.absent === null}
                      <span class="represented">represented by {slot.representedBy.join(", ")}</span>
                    {:else}
                      <label>
                        Absent
                        <select
                          value={slot.absent}
                          onchange={(event) =>
                            edit(index, (link) => withAbsence(link, at, event.currentTarget.value))}
                        >
                          {#each absenceChoices(slot.absent) as reason (reason)}
                            <option value={reason}
                              >{isRegisteredAbsence(reason) ? reason : `${reason} (unregistered)`}</option
                            >
                          {/each}
                        </select>
                      </label>
                    {/if}
                  </li>
                {/each}
              </ol>
            </section>
          {/if}

          {#if card.partOf.length > 0}
            <ul class="part-of" aria-label="Part of">
              {#each card.partOf as whole, at (at)}
                <li>{whole}</li>
              {/each}
            </ul>
          {/if}

          <div class="row assertion">
            <span>{card.assertion ?? "No assertion"}</span>
            <label>
              Status
              <select
                value={card.status ?? ""}
                onchange={(event) =>
                  edit(index, (link) => withStatus(link, statusOf(event.currentTarget.value)))}
              >
                <option value="">not stated</option>
                {#each ASSERTION_STATUSES as status (status)}
                  <option value={status}>{status}</option>
                {/each}
              </select>
            </label>
          </div>

          {#if card.warnings.length > 0}
            <ul class="warnings" aria-label="Warnings">
              {#each card.warnings as warning, at (at)}
                <li>{warning}</li>
              {/each}
            </ul>
          {/if}

          <div class="actions">
            {#if adding === index}
              <label for="{name}-add">URL to add</label>
              <input
                id="{name}-add"
                type="url"
                bind:value={addition}
                onkeydown={(event) => onAddKey(event, index)}
                {@attach focused}
              />
            {:else}
              <button type="button" onclick={() => openAdding(index)}>Add URL</button>
            {/if}
            <button type="button" onclick={() => removeLink(index)}>Remove link</button>
          </div>
        </li>
      {/each}
    </ol>
  {/if}
{/if}

<IdentityDialog bind:this={dialog} />

<style>
  p {
    margin: 0;
  }

  .hint {
    color: #595959;
  }

  .owner {
    font-weight: 600;
  }

  .paste,
  .level,
  .row,
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem 0.5rem;
  }

  .paste input {
    flex: 1 1 12rem;
  }

  .paste .hint {
    flex-basis: 100%;
    font-size: 0.8rem;
  }

  .level {
    padding: 0.5rem;
    border: 1px solid #c8c2b4;
    border-radius: 4px;
    background: #f5f3ee;
  }

  .level p {
    flex-basis: 100%;
  }

  input,
  select {
    padding: 0.15rem 0.3rem;
    border: 1px solid #b0b0b0;
    border-radius: 3px;
    font: inherit;
  }

  .row input {
    flex: 1 1 10rem;
  }

  button {
    padding: 0.15rem 0.6rem;
    border: 1px solid #bdbdbd;
    border-radius: 4px;
    background: #fafafa;
    font: inherit;
    color: inherit;
    cursor: pointer;
  }

  button:hover {
    background: #f0f0f0;
  }

  button:focus-visible,
  input:focus-visible,
  select:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }

  .links {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.6rem 0.75rem;
    border: 1px solid #d0d0d0;
    border-radius: 4px;
    background: #fdfdfc;
  }

  .heading {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5ch;
  }

  .level-word {
    color: #665d4e;
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .relation {
    color: #595959;
  }

  .label {
    font-weight: 600;
  }

  ul,
  ol {
    margin: 0;
    padding-left: 1.25rem;
  }

  a {
    overflow-wrap: anywhere;
  }

  .preferred {
    margin-left: 0.35rem;
    color: #2e6b2e;
    font-size: 0.75rem;
  }

  .scheme {
    color: #595959;
  }

  code {
    font-family: ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace;
    overflow-wrap: anywhere;
  }

  .parts ol li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.35rem 0.5rem;
  }

  .slot-label {
    font-weight: 600;
  }

  .assertion span {
    flex: 1 1 12rem;
    color: #3d3d3d;
  }

  .warnings {
    color: #8a5300;
  }
</style>
