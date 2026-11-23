<script lang="ts">
/**
 * The elision section of the Properties tab, directly under the name,
 * wherever the selection lies wholly under one root whose drawing can carry
 * elisions (`elisions.ts`): its title naming the root; the mode, one radio
 * group (arrow keys move between the options), each option one `style`
 * command (two where the card's rule and the elisions' rule both change),
 * an option another rule holds focusable with `aria-disabled` and a visible
 * hint saying why; the status line; Root left and right; the list of the
 * elisions drawn in the card, a click selecting one, `[×]` deleting it; and
 * Reset to automatic. Below, the form of one selected elision: From and To
 * in its timeline's unit, typed exactly, its share of the timeline, its
 * width's form and value, what it shows, and Delete. Typed text is the
 * inspector's `PropertyDrafts`; every commit is one command.
 */
import type { Subject } from "@timetoalign/tilie-arranger";
import { selectionOf } from "@timetoalign/tilie-arranger";
import type { Address, Block, Command, Store, View } from "@timetoalign/tilie-core";
import { addressKey, sameAddress } from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import { ELISION_DISPLAY } from "@timetoalign/timetoshare";
import type { ElisionField, ElisionForm, ModeOption, WidthForm } from "./elisions.ts";
import {
  deleteCommand,
  displayCommand,
  elisionFormOf,
  elisionSectionOf,
  formCommand,
  MODE_WORDS,
  WIDTH_FORMS,
} from "./elisions.ts";
import type { PropertyDrafts } from "./propertyDrafts.svelte.ts";

let {
  view,
  store,
  block,
  subjects,
  drawing,
  drafts,
  onselect,
}: {
  view: View;
  store: Store;
  block: Block;
  /** The selection, resolved. */
  subjects: readonly Subject[];
  /** The block's drawing as the canvas shows it. */
  drawing: Drawing;
  drafts: PropertyDrafts;
  /** Select the elision a row names on the canvas. */
  onselect: (address: Address) => void;
} = $props();

const uid = $props.id();

const section = $derived(elisionSectionOf(view, block, subjects, drawing));
const form = $derived(elisionFormOf(block, subjects, drawing));

/** The words of the width forms. */
const FORM_WORDS: { readonly [form in WidthForm]: string } = {
  automatic: "Automatic",
  ratio: "Proportional",
  span: "As wide as",
  canvas: "Fixed",
};

/** The store's refusal of the last command the section sent, and the address it was sent for. */
let refusal = $state<{ readonly key: string; readonly message: string } | null>(null);
const problem = $derived(
  refusal !== null && section !== null && refusal.key === section.root ? refusal.message : null,
);

/** Send `commands` in order, stopping at a refusal, which is kept to show. */
function send(commands: readonly Command[]): void {
  if (section === null) return;
  let message: string | null = null;
  for (const command of commands) {
    message = store.dispatch(command)?.message ?? null;
    if (message !== null) break;
  }
  refusal = message === null ? null : { key: section.root, message };
}

/**
 * Check the radio of `stored` in the group of `input` again: a radio shows
 * what is stored until the store has taken the command its choice sends.
 */
function restore(input: HTMLInputElement, stored: string | undefined): void {
  for (const radio of document.getElementsByName(input.name)) {
    if (radio instanceof HTMLInputElement) radio.checked = radio.value === stored;
  }
}

/** A mode chosen: its commands, none for a held option. */
function choose(event: Event & { currentTarget: HTMLInputElement }, option: ModeOption): void {
  restore(event.currentTarget, section?.mode);
  if (option.commands !== null && option.commands.length > 0) send(option.commands);
}

/** A width form chosen: its value converted so that the drawn width does not jump. */
function chooseForm(
  event: Event & { currentTarget: HTMLInputElement },
  shown: ElisionForm,
  next: WidthForm,
): void {
  restore(event.currentTarget, shown.form);
  const edit = formCommand(shown, next);
  if (!edit.ok) refusal = { key: section?.root ?? "", message: edit.problems[0]?.message ?? "" };
  else if (edit.value !== null) send([edit.value]);
}

function onFieldKey(event: KeyboardEvent, shown: ElisionForm, field: ElisionField): void {
  if (event.key === "Enter") {
    event.preventDefault();
    drafts.commitElision(shown, field, store);
  } else if (event.key === "Escape") {
    drafts.discardElision(shown, field);
  }
}

/** Whether `address` is the one selected subject. */
function isSelected(address: Address): boolean {
  const [subject, ...others] = subjects;
  return subject !== undefined && others.length === 0 && sameAddress(subject.address, address);
}
</script>

{#snippet field(shown: ElisionForm, name: ElisionField, label: string, unit: string)}
  {@const fieldProblem = drafts.elisionProblem(shown, name)}
  <label class="value">
    <span>{label}</span>
    <input
      type="text"
      inputmode="decimal"
      {name}
      value={drafts.elisionValue(shown, name)}
      aria-invalid={fieldProblem !== undefined}
      aria-describedby={fieldProblem !== undefined ? `${uid}-problem-${name}` : undefined}
      oninput={(event) => drafts.typeElision(shown, name, event.currentTarget.value)}
      onkeydown={(event) => onFieldKey(event, shown, name)}
      onblur={() => drafts.commitElision(shown, name, store)}
    />
    {#if unit !== ""}<span class="unit">{unit}</span>{/if}
  </label>
  {#if fieldProblem !== undefined}
    <p class="problem" id="{uid}-problem-{name}">{fieldProblem}</p>
  {/if}
{/snippet}

{#if section !== null}
  {@const shownSection = section}
  {@const reset = section.reset}
  <section class="elisions" aria-labelledby="{uid}-title" data-testid="elisions">
    <h3 id="{uid}-title">{shownSection.title}</h3>
    <fieldset class="mode">
      <legend class="hidden">Mode</legend>
      {#each shownSection.options as option (option.mode)}
        <label class:held={option.commands === null}>
          <input
            type="radio"
            name="{uid}-mode"
            value={option.mode}
            checked={shownSection.mode === option.mode}
            aria-disabled={option.commands === null ? "true" : undefined}
            aria-describedby={option.reason === null ? undefined : `${uid}-held-${option.mode}`}
            onchange={(event) => choose(event, option)}
          />
          {MODE_WORDS[option.mode]}
        </label>
      {/each}
    </fieldset>
    {#each shownSection.options as option (option.mode)}
      {#if option.reason !== null}
        <p class="hint" id="{uid}-held-{option.mode}">{MODE_WORDS[option.mode]}: {option.reason}</p>
      {/if}
    {/each}
    <p class="status" data-testid="elision-status">Elisions: {shownSection.status}</p>
    {#if shownSection.options.some((option) => option.mode === "hidden")}
      {@const preset = shownSection.rootLeftRight}
      <button type="button" disabled={preset === null} onclick={() => preset !== null && send([preset])}>
        Root left and right
      </button>
    {/if}
    {#if shownSection.rows.length > 0}
      <ul class="rows">
        {#each shownSection.rows as row (addressKey(row.address))}
          <li>
            <button
              type="button"
              class="row"
              aria-pressed={isSelected(row.address)}
              onclick={() => onselect(row.address)}
            >
              <span>{row.timeline}</span>
              <span>{row.stretch}</span>
              <span>{row.width}</span>
            </button>
            <button
              type="button"
              class="delete"
              aria-label="Delete the elision of {row.timeline}, {row.stretch}"
              disabled={row.remove === null}
              onclick={() => row.remove !== null && send([row.remove])}>×</button
            >
          </li>
        {/each}
      </ul>
    {/if}
    <button type="button" disabled={reset === null} onclick={() => reset !== null && send([reset])}>
      Reset to automatic
    </button>
    {#if problem !== null}
      <p class="problem" role="status">{problem}</p>
    {/if}
  </section>
{/if}

{#if form !== null}
  {@const shown = form}
  {@const remove = deleteCommand(shown)}
  <fieldset class="elision" data-testid="elision-form">
    <legend>{shown.title}</legend>
    <div class="stretch">
      {@render field(shown, "start", "From", shown.unit)}
      {@render field(shown, "end", "To", shown.unit)}
    </div>
    <p class="share">{shown.share}</p>
    <fieldset class="width">
      <legend>Width</legend>
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
          {#if each === "automatic"}
            {#if shown.proportion !== null}<span>({shown.proportion})</span>{/if}
          {:else}
            {@render field(
              shown,
              each,
              `${FORM_WORDS[each]} value`,
              each === "ratio" ? "of its length" : each === "span" ? shown.unit : "px",
            )}
          {/if}
        </div>
      {/each}
    </fieldset>
    <fieldset class="show">
      <legend>Show</legend>
      {#each ELISION_DISPLAY as word (word)}
        <label>
          <input
            type="checkbox"
            name="display"
            value={word}
            checked={shown.display.includes(word)}
            onchange={(event) => {
              // The box shows the stored display until the store has taken the command.
              event.currentTarget.checked = shown.display.includes(word);
              send([displayCommand(shown, word, !shown.display.includes(word))]);
            }}
          />
          {word === "coordinate" ? "coordinates" : word}
        </label>
      {/each}
    </fieldset>
    <button type="button" disabled={remove === null} onclick={() => remove !== null && send([remove])}>
      Delete elision
    </button>
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

  /* Held by another rule: greyed, its reason in the hint below the group. */
  label.held {
    color: #595959;
    cursor: not-allowed;
  }

  .hint,
  .status,
  .share {
    margin: 0;
    color: #595959;
  }

  .rows {
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
    grid-template-columns: 2fr 2fr 1fr;
    flex: 1;
    gap: 0.5rem;
    text-align: start;
    font: inherit;
  }

  .row[aria-pressed="true"] {
    font-weight: 600;
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
  .show {
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

  .form .value span:first-child {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
</style>
