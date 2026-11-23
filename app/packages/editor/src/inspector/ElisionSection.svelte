<script lang="ts">
/**
 * The elisions of the Properties tab, directly under the name
 * (`elisions.ts`). The root's block wherever the selection lies wholly under
 * one root whose drawing carries elisions: its title naming the root; the
 * mode, one radio group (arrow keys move between the options), each option
 * its commands, an option that cannot be chosen focusable with
 * `aria-disabled` and a visible hint saying why; in Proportional the
 * proportion (Automatic, or a number), the rows by depth (Automatic, or the
 * depths chosen) and what every default elision shows; in Custom the list of
 * the stored elisions the card draws, a click selecting one, `[×]` deleting
 * it, Add elision and Remove all. A root drawn once behind a row of groups
 * side by side also lists, read-only, the gaps and seams between two of its
 * groups, and its stored elisions lying there, kept and not drawn, with a
 * note saying so. The group's block wherever the selection
 * lies in a group's frame, or in its editor: Full or Custom, the group's
 * elisions, Add elision and Remove all. Below, the form of one selected
 * elision: From and To in its timeline's unit, typed exactly, its gap's
 * width form and value, what it shows, the other timelines a group elision
 * elides, and Delete; a default elision's form is read-only. Typed text is
 * the inspector's `PropertyDrafts`; every action is one command.
 */
import type { Subject } from "@timetoalign/tilie-arranger";
import type { Address, Block, Command, Store } from "@timetoalign/tilie-core";
import { addressKey, sameAddress } from "@timetoalign/tilie-core";
import type { Drawing, WidthForm } from "@timetoalign/tilie-layout";
import type { ElisionField, ElisionForm, ElisionRow, ElisionWord, ModeOption } from "./elisions.ts";
import {
  DEFAULT_HINT,
  DEFAULT_WORDS,
  defaultsDisplayCommand,
  deleteCommand,
  depthCommand,
  depthsAutomaticCommand,
  elisionDisplayCommand,
  elisionFormOf,
  FORM_WORDS,
  fieldCommand,
  formCommand,
  groupElisionsOf,
  MODE_WORDS,
  proportionAutomaticCommand,
  proportionCommand,
  rootElisionsOf,
  STORED_WORDS,
  WIDTH_FORMS,
} from "./elisions.ts";
import type { ElisionDraftField, ElisionOwner, PropertyDrafts } from "./propertyDrafts.svelte.ts";
import DisplayToggles from "./stamps/DisplayToggles.svelte";

let {
  store,
  block,
  subjects,
  drawing,
  edited,
  drafts,
  onselect,
}: {
  store: Store;
  block: Block;
  /** The selection, resolved. */
  subjects: readonly Subject[];
  /** The block's drawing as the canvas shows it. */
  drawing: Drawing;
  /** The group whose editor is the innermost one open; `null` for none. */
  edited: string | null;
  drafts: PropertyDrafts;
  /** Select the elision a row names on the canvas. */
  onselect: (address: Address) => void;
} = $props();

const uid = $props.id();

const root = $derived(rootElisionsOf(block, subjects, drawing));
const group = $derived(groupElisionsOf(block, subjects, drawing, edited));
const form = $derived(elisionFormOf(block, subjects, drawing));

/** The keys the refusals of the three parts are kept under. */
const rootKey = $derived(root === null ? "" : `root ${root.root}`);
const groupKey = $derived(group === null ? "" : `group ${group.group}`);
const formKey = $derived(form === null ? "" : addressKey(form.address));

/** The store's refusal of the last command sent, and the part it was sent from. */
let refusal = $state<{ readonly key: string; readonly message: string } | null>(null);

/** The refusal shown in the part of `key`; `null` for none. */
function problemOf(key: string): string | null {
  return refusal !== null && refusal.key === key ? refusal.message : null;
}

/** Send `commands` in order, stopping at a refusal, which is kept to show in the part of `key`. */
function send(key: string, commands: readonly (Command | null)[]): void {
  let message: string | null = null;
  for (const command of commands) {
    if (command === null) continue;
    message = store.dispatch(command)?.message ?? null;
    if (message !== null) break;
  }
  refusal = message === null ? null : { key, message };
}

/**
 * Check the radio of `stored` in the group of `input` again: a radio shows
 * what is stored until the store has taken the command its choice sends.
 */
function restore(input: HTMLInputElement, stored: string): void {
  for (const radio of document.getElementsByName(input.name)) {
    if (radio instanceof HTMLInputElement) radio.checked = radio.value === stored;
  }
}

/** A width form chosen: its value converted so that the drawn width does not jump. */
function chooseForm(
  event: Event & { currentTarget: HTMLInputElement },
  shown: ElisionForm,
  next: WidthForm,
): void {
  restore(event.currentTarget, shown.form);
  const edit = formCommand(shown, next);
  if (!edit.ok) refusal = { key: formKey, message: edit.problems[0]?.message ?? "" };
  else send(formKey, [edit.value]);
}

/** Whether `address` is the one selected subject. */
function isSelected(address: Address): boolean {
  const [subject, ...others] = subjects;
  return subject !== undefined && others.length === 0 && sameAddress(subject.address, address);
}

function onFieldKey(
  event: KeyboardEvent,
  owner: ElisionOwner,
  field: ElisionDraftField,
  edit: (text: string) => ReturnType<typeof fieldCommand>,
): void {
  if (event.key === "Enter") {
    event.preventDefault();
    drafts.commitElision(owner, field, store, edit);
  } else if (event.key === "Escape") {
    drafts.discardElision(owner, field);
  }
}

/** A checkbox shows what is stored until the store has taken the command its click sends. */
function toggled(
  event: Event & { currentTarget: HTMLInputElement },
  stored: boolean,
  key: string,
  command: Command | null,
): void {
  event.currentTarget.checked = stored;
  send(key, [command]);
}
</script>

{#snippet modes(
  options: readonly ModeOption<string>[],
  mode: string,
  words: { readonly [word: string]: string },
  key: string,
)}
  <fieldset class="mode">
    <legend class="hidden">Mode</legend>
    {#each options as option (option.mode)}
      <label class={{ held: option.reason !== null }}>
        <input
          type="radio"
          name="{uid}-{key}-mode"
          value={option.mode}
          checked={mode === option.mode}
          aria-disabled={option.reason === null ? undefined : "true"}
          aria-describedby={option.reason === null ? undefined : `${uid}-${key}-held-${option.mode}`}
          onchange={(event) => {
            restore(event.currentTarget, mode);
            send(key, option.commands);
          }}
        />
        {words[option.mode]}
      </label>
    {/each}
  </fieldset>
  {#each options as option (option.mode)}
    {#if option.reason !== null}
      <p class="hint" id="{uid}-{key}-held-{option.mode}">{words[option.mode]}: {option.reason}</p>
    {/if}
  {/each}
{/snippet}

{#snippet list(rows: readonly ElisionRow[], key: string)}
  {#if rows.length > 0}
    <ul class="rows">
      {#each rows as row (addressKey(row.address))}
        <li>
          <button
            type="button"
            class="row"
            aria-pressed={isSelected(row.address)}
            onclick={() => onselect(row.address)}
          >
            <span>{row.name}</span>
            <span>{row.timeline}</span>
            <span>{row.stretch}</span>
            {#if row.note !== null}
              <span class="note">{row.note}</span>
            {/if}
          </button>
          <button
            type="button"
            class="delete"
            aria-label="Delete the elision of {row.timeline}, {row.stretch}"
            onclick={() => send(key, [row.remove])}>×</button
          >
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

{#snippet actions(add: Command | null, removeAll: Command | null, key: string)}
  <div class="actions">
    <button type="button" disabled={add === null} onclick={() => send(key, [add])}>
      Add elision
    </button>
    <button type="button" disabled={removeAll === null} onclick={() => send(key, [removeAll])}>
      Remove all
    </button>
  </div>
{/snippet}

{#snippet problem(key: string)}
  {@const message = problemOf(key)}
  {#if message !== null}
    <p class="problem" role="status">{message}</p>
  {/if}
{/snippet}

{#snippet field(
  owner: ElisionOwner,
  name: ElisionDraftField,
  label: string,
  unit: string,
  stored: string,
  disabled: boolean,
  edit: (text: string) => ReturnType<typeof fieldCommand>,
)}
  {@const fieldProblem = drafts.elisionProblem(owner, name)}
  <label class="value">
    <span>{label}</span>
    <input
      type="text"
      inputmode="decimal"
      {name}
      {disabled}
      value={drafts.elisionValue(owner, name, stored)}
      aria-invalid={fieldProblem !== undefined}
      aria-describedby={fieldProblem !== undefined ? `${uid}-problem-${name}` : undefined}
      oninput={(event) => drafts.typeElision(owner, name, event.currentTarget.value)}
      onkeydown={(event) => onFieldKey(event, owner, name, edit)}
      onblur={() => drafts.commitElision(owner, name, store, edit)}
    />
    {#if unit !== ""}<span class="unit">{unit}</span>{/if}
  </label>
  {#if fieldProblem !== undefined}
    <p class="problem" id="{uid}-problem-{name}">{fieldProblem}</p>
  {/if}
{/snippet}

{#if root !== null}
  {@const shown = root}
  <section class="elisions" aria-labelledby="{uid}-root" data-testid="elisions">
    <h3 id="{uid}-root">{shown.title}</h3>
    {@render modes(shown.options, shown.mode, MODE_WORDS, rootKey)}
    {#if shown.arranged.length > 0}
      <div class="arranged" data-testid="arranged-gaps">
        <span class="label" id="{uid}-arranged">Side by side</span>
        <ul aria-labelledby="{uid}-arranged">
          {#each shown.arranged as gap (gap.key)}
            <li><span>{gap.between}</span> <span>{gap.stretch}</span></li>
          {/each}
        </ul>
      </div>
    {/if}
    {#if shown.proportional !== null}
      {@const settings = shown.proportional}
      <div class="setting" role="group" aria-labelledby="{uid}-proportion">
        <span class="label" id="{uid}-proportion">Proportion</span>
        <label>
          <input
            type="checkbox"
            name="proportion-automatic"
            checked={settings.automatic}
            onchange={(event) =>
              toggled(event, settings.automatic, rootKey, proportionAutomaticCommand(shown))}
          />
          Automatic
        </label>
        {@render field(shown, "proportion", "Proportion value", "", settings.proportion, settings.automatic, (text) =>
          proportionCommand(shown, text),
        )}
      </div>
      <div class="setting depths" role="group" aria-labelledby="{uid}-rows">
        <span class="label" id="{uid}-rows">Rows</span>
        <label>
          <input
            type="checkbox"
            name="depths-automatic"
            checked={settings.depthsAutomatic}
            onchange={(event) =>
              toggled(event, settings.depthsAutomatic, rootKey, depthsAutomaticCommand(shown))}
          />
          Automatic
        </label>
        {#each settings.depths as row (row.depth)}
          {@const command = depthCommand(shown, row.depth)}
          <label class="depth">
            <input
              type="checkbox"
              name="depth"
              value={row.depth}
              checked={row.chosen}
              disabled={settings.depthsAutomatic || command === null}
              onchange={(event) => toggled(event, row.chosen, rootKey, command)}
            />
            {row.names}
          </label>
        {/each}
      </div>
      <div class="setting" role="group" aria-labelledby="{uid}-show">
        <span class="label" id="{uid}-show">Show</span>
        <DisplayToggles
          words={DEFAULT_WORDS}
          display={settings.display}
          disabled={false}
          labelledby="{uid}-show"
          ontoggle={(word: ElisionWord) => send(rootKey, [defaultsDisplayCommand(shown, word)])}
        />
      </div>
    {/if}
    {#if shown.custom !== null}
      {@const custom = shown.custom}
      <p class="count">{custom.rows.length === 1 ? "1 elision" : `${custom.rows.length} elisions`}</p>
      {@render list(custom.rows, rootKey)}
      {@render actions(custom.add, custom.removeAll, rootKey)}
    {/if}
    {@render problem(rootKey)}
  </section>
{/if}

{#if group !== null}
  {@const shown = group}
  <section class="elisions" aria-labelledby="{uid}-group" data-testid="group-elisions">
    <h3 id="{uid}-group">{shown.title}</h3>
    {@render modes(shown.options, shown.mode, MODE_WORDS, groupKey)}
    <p class="count">{shown.count}</p>
    {@render list(shown.rows, groupKey)}
    {@render actions(shown.add, shown.removeAll, groupKey)}
    {@render problem(groupKey)}
  </section>
{/if}

{#if form !== null}
  {@const shown = form}
  {@const editable = shown.stored !== null}
  {@const remove = deleteCommand(shown)}
  {@const edit = (name: ElisionField) => (text: string) => fieldCommand(shown, name, text)}
  <fieldset class="elision" data-testid="elision-form">
    <legend>{shown.title}</legend>
    <div class="stretch">
      {@render field(shown, "start", "From", shown.unit, shown.start, !editable, edit("start"))}
      {@render field(shown, "end", "To", shown.unit, shown.end, !editable, edit("end"))}
    </div>
    {#if !editable}
      <p class="hint">{DEFAULT_HINT}</p>
    {:else}
      <fieldset class="width">
        <legend>Gap</legend>
        {#each WIDTH_FORMS as each (each)}
          <div class="form">
            <label>
              <input
                type="radio"
                name="{uid}-width"
                value={each}
                checked={shown.form === each}
                onchange={(event) => chooseForm(event, shown, each)}
              />
              {FORM_WORDS[each]}
            </label>
            {#if each !== "standard"}
              {@render field(
                shown,
                each,
                `${FORM_WORDS[each]} value`,
                each === "ratio" ? "of its length" : each === "span" ? shown.unit : "px",
                shown.widths[each],
                false,
                edit(each),
              )}
            {/if}
          </div>
        {/each}
      </fieldset>
      <div class="setting" role="group" aria-labelledby="{uid}-elision-show">
        <span class="label" id="{uid}-elision-show">Show</span>
        <DisplayToggles
          words={STORED_WORDS}
          display={shown.display}
          disabled={false}
          labelledby="{uid}-elision-show"
          ontoggle={(word: ElisionWord) => send(formKey, [elisionDisplayCommand(shown, word)])}
        />
      </div>
      {#if shown.also !== null}
        <div class="also" data-testid="also-elides">
          <span class="label">Also elides</span>
          <ul>
            {#each shown.also as other (other.timeline)}
              <li><span>{other.timeline}</span> <span>{other.stretch}</span></li>
            {/each}
          </ul>
        </div>
      {/if}
      <button type="button" disabled={remove === null} onclick={() => send(formKey, [remove])}>
        Delete elision
      </button>
    {/if}
    {@render problem(formKey)}
  </fieldset>
{/if}

<style>
  .elisions {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
    margin: 0.25rem 0 0.5rem;
  }

  h3 {
    margin: 0;
    font: inherit;
    font-weight: 600;
  }

  fieldset {
    margin: 0;
    padding: 0;
    border: none;
  }

  .mode {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* Cannot be chosen: greyed, its reason in the hint below the group. */
  label.held {
    color: #595959;
    cursor: not-allowed;
  }

  .hint,
  .count {
    margin: 0;
    color: #595959;
  }

  .setting {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  .depths {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.1rem;
  }

  .label {
    min-width: 5rem;
  }

  .rows,
  .also ul,
  .arranged ul {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    margin: 0;
    padding: 0;
    list-style: none;
    align-self: stretch;
  }

  .rows li {
    display: flex;
    gap: 0.25rem;
  }

  .row {
    display: grid;
    grid-template-columns: 2fr 2fr 2fr;
    flex: 1;
    gap: 0.5rem;
    text-align: start;
    font: inherit;
  }

  .row[aria-pressed="true"] {
    font-weight: 600;
  }

  .note {
    grid-column: 1 / -1;
    color: #595959;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  button {
    font: inherit;
  }

  .problem {
    margin: 0;
    color: #b00020;
  }

  .elision {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0 0 0.5rem;
    padding: 0.25rem 0.5rem 0.5rem;
    border: 1px solid #d0d0d0;
    border-radius: 4px;
  }

  .stretch,
  .form,
  .also,
  .arranged {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  .value {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .value input {
    width: 6rem;
    font: inherit;
  }

  .form .value span:first-child,
  .setting .value span:first-child {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
</style>
