<script lang="ts">
/**
 * The composer: three fields, each filtering the next. The verb; the
 * vocabulary, only those with a pattern for the verb; the value, looked
 * up in that vocabulary, an element of the manifest, a type, or an IRI or
 * identifier checked against the catalogue. A URL pasted into any field is
 * recognised and fills vocabulary and value, the verb asked after. In
 * vocabulary mode ("＋ Add vocabulary") the verb is the rectangle's and the
 * value is first offered from the cross-references of its first thing.
 * An element of the manifest may also be picked on the canvas. Add states
 * the pairs with their paradata (who, when and how) and the user's belief
 * `true`. An option's IRI shows as a slug, the full IRI its title.
 */
import { statementHolders } from "@timetoalign/tilie-core";
import { recognize } from "@timetoalign/timetoshare";
import { onDestroy, onMount, tick } from "svelte";
import type { Attachment } from "svelte/attachments";
import Combobox from "../../combobox/Combobox.svelte";
import { shownIri } from "../../iris.ts";
import type { Candidate } from "../../lookup/index.ts";
import { lookupOf } from "../../lookup/index.ts";
import { informOf } from "../../messages.svelte.ts";
import { hasPicking, pickingOf } from "../../pick.svelte.ts";
import { profilesOf } from "../../profiles/profiles.svelte.ts";
import { userOf } from "../../user.svelte.ts";
import type { SystemChoice, TypeOption, VerbChoice } from "./catalogue.ts";
import {
  alternativeAt,
  alternativesOf,
  defaultAlternative,
  ELEMENT,
  FALLBACK,
  namedSlots,
  OTHER,
  systemChoice,
  systemChoices,
  takesLiteral,
  typeOptions,
  typesOf,
  valueKindOf,
  verbChoices,
} from "./catalogue.ts";
import type { ComposerState, ValueChoice } from "./composer.svelte.ts";
import { valueText } from "./composer.svelte.ts";
import type { EntryFields } from "./edits.ts";
import { dayOf, tied } from "./edits.ts";
import type { Frame, Pair, RectangleView, Thing } from "./frame.ts";
import { frameNames, framePrefixes, states } from "./frame.ts";
import OtherProperty from "./OtherProperty.svelte";
import { Search } from "./search.svelte.ts";

let {
  frame,
  state: composer,
  rectangles,
  onadd,
  oncancel,
}: {
  frame: Frame;
  /** What the composer holds; it belongs to the frame it was opened on. */
  state: ComposerState;
  /** The frame's rectangles: the types its "is a" states, the rectangle a vocabulary extends. */
  rectangles: readonly RectangleView[];
  onadd: (pairs: readonly Pair[], fields: EntryFields) => void;
  oncancel: () => void;
} = $props();

const uid = $props.id();
const lookup = lookupOf();
const user = userOf();
const inform = informOf();
const profiles = profilesOf();
/** The catalogue the editor's type profiles offer. */
const catalogue = $derived(profiles.catalogue);
/** The names the options' IRIs are shown with. */
const names = $derived(frameNames(frame, catalogue));
/** The canvas to pick an element on; none where the panel is shown without one. */
const picking = hasPicking() ? pickingOf() : null;

/** What a pasted address the catalogue does not know gives. */
const UNKNOWN_ADDRESS =
  "The address is no identifier the catalogue knows; choose “Other property…” to state it.";

let verbBox: ReturnType<typeof Combobox<VerbChoice>> | undefined = $state();
let systemBox: ReturnType<typeof Combobox<SystemChoice>> | undefined = $state();
let valueBox: ReturnType<typeof Combobox<ValueChoice>> | undefined = $state();

const search = new Search(lookup, () =>
  composer.system === null || composer.verb === null
    ? null
    : {
        system: composer.system.id,
        label: composer.system.label,
        kind: valueKindOf(composer.verb.id),
      },
);
onDestroy(() => search.dispose());

/** The rectangle a vocabulary extends, in vocabulary mode. */
const extended = $derived(
  composer.mode === "vocabulary"
    ? (rectangles.find((rectangle) => rectangle.key === composer.rectangle) ?? null)
    : null,
);
/** The catalogue types the frame's "is a" states, which order the verbs. */
const types = $derived(
  typesOf(
    catalogue,
    frame.skeleton["@context"],
    rectangles.find((rectangle) => rectangle.verb === "is_a")?.pairs ?? [],
  ),
);

/** The value candidates offered from the extended rectangle's cross-references, and their basis. */
let offered: readonly Candidate[] = $state.raw([]);
let basis: string | null = $state(null);

const matches = (label: string, text: string): boolean =>
  label.toLocaleLowerCase().includes(text.trim().toLocaleLowerCase());

const verbOptions = $derived(
  verbChoices(catalogue, types, composer.system?.id).filter(
    (choice) =>
      composer.verbText === composer.verb?.label || matches(choice.label, composer.verbText),
  ),
);

const systemOptions = $derived.by((): readonly SystemChoice[] => {
  if (composer.verb === null || composer.verb.id === OTHER) return [];
  const all =
    extended === null
      ? systemChoices(catalogue, composer.verb, types)
      : extended.addable.map((id) => systemChoice(catalogue, id));
  return all.filter(
    (choice) =>
      composer.systemText === composer.system?.label || matches(choice.label, composer.systemText),
  );
});

/** The alternatives of the verb's pattern for the chosen system; several make a Form choice. */
const alternatives = $derived(
  composer.verb === null || composer.system === null || composer.verb.id === OTHER
    ? []
    : alternativesOf(catalogue, composer.verb, composer.system.id),
);
const pattern = $derived(
  composer.verb === null || composer.system === null || composer.verb.id === OTHER
    ? undefined
    : alternativeAt(catalogue, composer.verb, composer.system.id, composer.alternative)?.pattern,
);
/** The named slots the form asks for; `value` is filled from the value. */
const slots = $derived(namedSlots(pattern).filter((name) => name !== "value"));

/** The option key of a value choice. */
function keyOf(choice: ValueChoice): string {
  switch (choice.kind) {
    case "candidate":
      return `candidate ${choice.candidate.system} ${choice.candidate.iri}`;
    case "recognized":
      return `recognized ${choice.recognition.iri ?? choice.recognition.value}`;
    case "element":
      return `element ${choice.id}`;
    case "type":
      return `type ${choice.label}`;
    case "literal":
      return `literal ${choice.text}`;
  }
}

const valueOptions = $derived.by((): readonly ValueChoice[] => {
  const system = composer.system;
  const verb = composer.verb;
  if (system === null || verb === null || verb.id === OTHER) return [];
  const text = search.text;
  if (system.id === ELEMENT) {
    return elementsOf().filter(
      (choice) =>
        choice.kind === "element" && (matches(choice.label, text) || matches(choice.id, text)),
    );
  }
  const found: ValueChoice[] = [];
  if (extended !== null) {
    for (const candidate of offered) found.push({ kind: "candidate", candidate });
  }
  if (verb.id === "is_a") {
    for (const option of typeOptions(catalogue, system.id)) {
      if (matches(option.label, text)) found.push(typeChoice(option));
    }
  }
  for (const candidate of search.results) found.push({ kind: "candidate", candidate });
  return found;
});

function typeChoice(option: TypeOption): ValueChoice {
  return { kind: "type", type: option.type, label: option.label, pairs: option.pairs };
}

/** What the status line says while a pick on the canvas is awaited. */
const PICK_PROMPT = "Pick a timeline or a region on the canvas; Escape cancels.";

/** The "Pick on the canvas" button, held by an attachment, not state: the focus returns to it. */
let pickButton: HTMLButtonElement | undefined;
const heldPickButton: Attachment<HTMLButtonElement> = (element) => {
  pickButton = element;
  return () => {
    pickButton = undefined;
  };
};
/** Whether this composer awaits a pick on the canvas. */
let awaiting = $state(false);

/**
 * "Pick on the canvas": the canvas picks a timeline or a region, which
 * becomes the value as if chosen from the list; pressed again, or Escape,
 * cancels. A pick in another block, or of the element shown, is refused.
 */
async function pickOnCanvas(): Promise<void> {
  if (picking === null) return;
  if (awaiting) {
    picking.cancel();
    return;
  }
  awaiting = true;
  const address = await picking.start();
  awaiting = false;
  if (address === null || composer.system?.id !== ELEMENT) {
    pickButton?.focus();
    return;
  }
  const choice = elementsOf().find(
    (candidate) => candidate.kind === "element" && candidate.id === address.id,
  );
  if (address.block !== frame.block.id || choice === undefined) {
    inform(
      address.id === frame.id && address.block === frame.block.id
        ? "The element shown cannot be its own value; pick another timeline or region."
        : "That element lies in another block; pick a timeline or a region of this one.",
    );
    pickButton?.focus();
    return;
  }
  pickValue(choice);
  await tick();
  valueBox?.focus();
}

// A composer closed while it awaits a pick ends the pick.
onDestroy(() => {
  if (awaiting) picking?.cancel();
});

/** The other timelines and regions of the manifest, each a possible value: `#` and its ID. */
function elementsOf(): ValueChoice[] {
  const found: ValueChoice[] = [];
  for (const holder of statementHolders(frame.block.manifest)) {
    if (holder.id === null || holder.id === frame.id) continue;
    found.push({
      kind: "element",
      id: holder.id,
      label: `${holder.name ?? holder.id} (${holder.kind})`,
    });
  }
  return found;
}

const result = $derived(composer.pairs(catalogue, frame));
/** What Add would state; a text where something is missing or already stated. */
const addable = $derived.by((): readonly Pair[] | string => {
  if (typeof result === "string") return result;
  if (result.length === 0) return "Choose a value.";
  return result.some((pair) => states(frame, pair)) ? "This is already stated." : result;
});

/** The pairs as Add states them on `day`: in vocabulary mode tied by "same as" to the rectangle's first thing. */
function extendedPairs(pairs: readonly Pair[], day: string): readonly Pair[] {
  const first = firstThing();
  return extended === null || first === null || composer.value?.kind === "element"
    ? pairs
    : tied(pairs, first, framePrefixes(frame, catalogue), day);
}

/** The extended rectangle's first thing the lookup resolves, else its first thing. */
function firstThing(): Thing | null {
  if (extended === null) return null;
  return (
    extended.things.find((thing) => thing.system !== null && lookup.resolvable(thing.system)) ??
    extended.things[0] ??
    null
  );
}

/** Whether `system` can state `verb`. */
function fits(verb: VerbChoice, system: string): boolean {
  return verbChoices(catalogue, types, system).some(
    (choice) => choice.id === verb.id && choice.inverse === verb.inverse,
  );
}

function thingOfValue(value: ValueChoice | null): string | null {
  if (value === null) return null;
  const iri =
    value.kind === "candidate"
      ? value.candidate.iri
      : value.kind === "recognized"
        ? value.recognition.iri
        : null;
  return iri === null ? null : (recognize(catalogue, iri)?.thing ?? null);
}

/** Start the form on its default alternative for the chosen verb, system and value. */
function resetAlternative(): void {
  if (composer.verb === null || composer.system === null || composer.verb.id === OTHER) return;
  composer.alternative = defaultAlternative(
    catalogue,
    composer.verb,
    composer.system.id,
    types,
    thingOfValue(composer.value),
  );
}

function pickVerb(choice: VerbChoice): void {
  composer.verb = choice;
  composer.verbText = choice.label;
  if (composer.system !== null && (choice.id === OTHER || !fits(choice, composer.system.id))) {
    composer.system = null;
    composer.systemText = "";
    composer.value = null;
    search.input("");
  }
  resetAlternative();
  void tick().then(() =>
    choice.id === OTHER
      ? undefined
      : composer.system === null
        ? systemBox?.focus()
        : valueBox?.focus(),
  );
}

function setVerbText(text: string): void {
  composer.verbText = text;
}

function pickSystem(choice: SystemChoice): void {
  composer.system = choice;
  composer.systemText = choice.label;
  composer.value = null;
  search.input("");
  resetAlternative();
  if (extended !== null) void offer(extended, choice.id);
  void tick().then(() => valueBox?.focus());
}

function setSystemText(text: string): void {
  composer.systemText = text;
}

/**
 * Offer, in vocabulary mode, the things of `system` the rectangle's first
 * resolvable thing names as its own (its cross-references), each resolved
 * once in that system for its label; the annotation names that first
 * thing as basis and its source's service.
 */
async function offer(rectangle: RectangleView, system: string): Promise<void> {
  offered = [];
  const first = firstThing();
  if (first === null || first.system === null || !lookup.resolvable(first.system)) return;
  const owner = composer.owner;
  const still = () => composer.owner === owner && composer.system?.id === system;
  try {
    const source = await lookup.resolve(first.system, first.iri);
    if (source === null || !still()) return;
    const found: Candidate[] = [];
    for (const reference of source.crossReferences) {
      if (reference.system !== system) continue;
      const resolved = lookup.resolvable(system)
        ? await lookup.resolve(system, reference.iri)
        : null;
      found.push({
        system,
        iri: reference.iri,
        label: resolved?.label ?? reference.iri,
        description: resolved?.description ?? null,
        image: resolved?.image ?? null,
        crossReferences: resolved?.crossReferences ?? [],
        service: source.service,
        match: true,
      });
    }
    if (!still() || rectangle.key !== composer.rectangle) return;
    basis = first.iri;
    offered = found;
  } catch (error) {
    if (still())
      inform(
        `${systemChoice(catalogue, first.system).label} could not be read: ${error instanceof Error ? error.message : String(error)}`,
      );
  }
}

function pickValue(choice: ValueChoice): void {
  composer.value = choice;
  search.text = valueText(choice);
  resetAlternative();
}

/**
 * Enter in the Value field without an option: before a vocabulary is
 * chosen, the text as a paste; else as an address the catalogue recognises, an identifier of the system's thing, an IRI for
 * the fallback, or a literal where the pattern takes one.
 */
function enterValue(text: string): void {
  const given = text.trim();
  const system = composer.system;
  if (given === "") return;
  if (system === null) {
    paste(given);
    return;
  }
  const recognition = recognize(catalogue, given);
  if (recognition !== null && (recognition.system === system.id || system.id === FALLBACK)) {
    pickValue({ kind: "recognized", recognition, label: null });
    label(recognition.system, recognition.iri);
    return;
  }
  const holder = catalogue.systems.find((candidate) => candidate.id === system.id);
  const thing = holder?.things.find((candidate) => candidate.iri !== null);
  if (thing?.iri != null && /^[^\s:/]+$/u.test(given)) {
    const value = thing.lowercase ? given.toLowerCase() : given;
    const iri = thing.iri.split("{value}").join(value);
    pickValue({
      kind: "recognized",
      recognition: { system: system.id, thing: thing.id, value, iri },
      label: null,
    });
    label(system.id, iri);
    return;
  }
  if (system.id === FALLBACK && /^[A-Za-z][A-Za-z0-9+.-]*:\S+$/u.test(given)) {
    pickValue({
      kind: "recognized",
      recognition: { system: FALLBACK, thing: "", value: given, iri: given },
      label: null,
    });
    return;
  }
  if (takesLiteral(pattern)) {
    pickValue({ kind: "literal", text: given });
    return;
  }
  inform(`'${given}' is no value of ${system.label}.`);
}

/** Fill a recognised value's label when the lookup answers, if it is still the value. */
function label(system: string, iri: string | null): void {
  if (iri === null || !lookup.resolvable(system)) return;
  const asked = composer.value;
  lookup.resolve(system, iri).then(
    (candidate) => {
      if (candidate === null || composer.value !== asked || asked?.kind !== "recognized") return;
      const named: ValueChoice = { ...asked, label: candidate.label };
      composer.value = named;
      search.text = valueText(named);
    },
    () => undefined,
  );
}

/**
 * A paste into any field: a URL the catalogue recognises sets vocabulary
 * and value (its label filled when the lookup answers); a verb that system
 * cannot state is cleared, and the Verb field asked next. Any other
 * address is refused with a hint; any other text is typed.
 */
function paste(text: string): boolean {
  const given = text.trim();
  const recognition = recognize(catalogue, given);
  if (recognition === null) {
    if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(given)) {
      inform(UNKNOWN_ADDRESS);
      return true;
    }
    return false;
  }
  const system = systemChoice(catalogue, recognition.system);
  composer.system = system;
  composer.systemText = system.label;
  const value: ValueChoice = { kind: "recognized", recognition, label: null };
  composer.value = value;
  search.text = valueText(value);
  label(recognition.system, recognition.iri);
  if (composer.verb !== null && !fits(composer.verb, recognition.system)) {
    composer.verb = null;
    composer.verbText = "";
  }
  resetAlternative();
  if (composer.verb === null) void tick().then(() => verbBox?.focus());
  return true;
}

/**
 * The annotation of what Add states. A candidate the lookup found is
 * `reconciled` by its service; in vocabulary mode only a cross-reference
 * offered from the rectangle's thing is, with that thing as basis and an
 * exact match. A candidate searched there instead is tied to the thing
 * because the user chose it for the same thing, so it is `manual`, as is
 * every other value.
 */
function fieldsOf(value: ValueChoice | null): EntryFields {
  const stated: Pick<EntryFields, "stated_by" | "date"> = {
    stated_by: [user.state.statedBy],
    date: dayOf(new Date()),
  };
  if (value?.kind !== "candidate") return { ...stated, method: "manual" };
  if (extended === null) {
    return { ...stated, method: "reconciled", service: value.candidate.service };
  }
  return basis !== null && offered.includes(value.candidate)
    ? {
        ...stated,
        method: "reconciled",
        service: value.candidate.service,
        basis: [basis],
        match: "exact",
      }
    : { ...stated, method: "manual" };
}

function add(): void {
  if (typeof addable === "string") return;
  const fields = fieldsOf(composer.value);
  onadd(extendedPairs(addable, fields.date), fields);
}

onMount(() => {
  if (composer.mode === "vocabulary") systemBox?.focus();
  else verbBox?.focus();
});
</script>

{#snippet verbOption(choice: VerbChoice)}{choice.label}{/snippet}
{#snippet systemOption(choice: SystemChoice)}{choice.label}{/snippet}
{#snippet valueOption(choice: ValueChoice)}
  {#if choice.kind === "candidate"}
    {@const candidateIri = shownIri(names, choice.candidate.iri)}
    <span class="candidate">
      {#if choice.candidate.image !== null}<img src={choice.candidate.image} alt="" width="24" height="24" />{/if}
      <span>
        <strong>{choice.candidate.label}</strong>
        {#if choice.candidate.description !== null}<span class="description">{choice.candidate.description}</span>{/if}
        <code title={candidateIri.iri ?? undefined}>{candidateIri.text}</code>
      </span>
    </span>
  {:else if choice.kind === "element"}
    <code>#{choice.id}</code> {choice.label}
  {:else if choice.kind === "recognized" && choice.label === null && choice.recognition.iri !== null}
    {@const shown = shownIri(names, choice.recognition.iri)}
    <span title={shown.iri ?? undefined}>{shown.text}</span>
  {:else}
    {valueText(choice)}
  {/if}
{/snippet}
{#snippet nothing(text: string)}
  {#if search.error !== null}
    {search.error}
  {:else if composer.system?.id === ELEMENT}
    No element matches “{text}”.
  {:else}
    No results; press Enter to take “{text}” as written.
  {/if}
{/snippet}

<section class="composer" aria-labelledby="{uid}-title" data-testid="metadata-composer">
  <h3 id="{uid}-title">{composer.mode === "vocabulary" ? "State it in another vocabulary" : "Add statement"}</h3>
  <div class="field">
    <span id="{uid}-verb">Verb</span>
    <Combobox
      bind:this={verbBox}
      label="Verb"
      labelledby="{uid}-verb"
      bind:text={() => composer.verbText, setVerbText}
      options={verbOptions}
      keyOf={(choice) => `${choice.id} ${choice.inverse}`}
      option={verbOption}
      disabled={composer.mode === "vocabulary"}
      onpick={pickVerb}
      onpaste={paste}
    />
  </div>
  {#if composer.verb?.id === OTHER}
    <OtherProperty {frame} state={composer} />
  {:else}
    <div class="field">
      <span id="{uid}-system">Vocabulary</span>
      <Combobox
        bind:this={systemBox}
        label="Vocabulary"
        labelledby="{uid}-system"
        bind:text={() => composer.systemText, setSystemText}
        options={systemOptions}
        keyOf={(choice) => choice.id}
        option={systemOption}
        onpick={pickSystem}
        onpaste={paste}
      />
    </div>
    {#if alternatives.length > 1}
      <label class="field">
        <span>Form</span>
        <select
          bind:value={() => String(composer.alternative), (next) => (composer.alternative = Number(next))}
        >
          {#each alternatives as index, position (index)}
            <option value={String(index)}
              >{composer.verb === null || composer.system === null
                ? ""
                : (alternativeAt(catalogue, composer.verb, composer.system.id, index)?.note ??
                  `Form ${position + 1}`)}</option
            >
          {/each}
        </select>
      </label>
    {/if}
    <div class="field">
      <span id="{uid}-value">Value</span>
      <Combobox
        bind:this={valueBox}
        label="Value"
        labelledby="{uid}-value"
        bind:text={() => search.text, search.input}
        options={valueOptions}
        {keyOf}
        option={valueOption}
        empty={nothing}
        loading={search.loading}
        onpick={pickValue}
        onenter={enterValue}
        onpaste={paste}
      />
      {#if picking !== null && composer.system?.id === ELEMENT}
        <button
          type="button"
          class="pick"
          data-testid="metadata-pick"
          aria-pressed={awaiting}
          {@attach heldPickButton}
          onclick={() => void pickOnCanvas()}>Pick on the canvas</button
        >
        <p class="prompt" role="status">{awaiting ? PICK_PROMPT : ""}</p>
      {/if}
    </div>
    {#each slots as slot (slot)}
      <label class="field">
        <span>{slot}</span>
        <input
          type="text"
          bind:value={() => composer.slots[slot] ?? "", (next) => (composer.slots[slot] = next)}
        />
      </label>
    {/each}
  {/if}
  {#if typeof addable === "string"}
    <p id="{uid}-missing" class="missing">{addable}</p>
  {/if}
  <div class="buttons">
    <button
      type="button"
      disabled={typeof addable === "string"}
      aria-describedby={typeof addable === "string" ? `${uid}-missing` : undefined}
      onclick={add}>Add</button
    >
    <button type="button" onclick={oncancel}>Cancel</button>
  </div>
</section>

<style>
  .composer {
    display: grid;
    gap: 0.35rem;
    padding: 0.5rem;
    border: 1px solid #9fb8d6;
    border-radius: 4px;
    background: #f7faff;
  }

  h3 {
    margin: 0;
    font-size: 0.85rem;
  }

  .field {
    display: grid;
    gap: 0.15rem;
  }

  .field > span {
    font-weight: 600;
  }

  .candidate {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
  }

  .candidate > span {
    display: grid;
  }

  .description {
    color: #595959;
    font-size: 0.78rem;
  }

  code {
    font-family: ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace;
    font-size: 0.75rem;
    overflow-wrap: anywhere;
  }

  .pick {
    justify-self: start;
  }

  .pick[aria-pressed="true"] {
    border-color: #0a84ff;
    background: #e8f2ff;
  }

  .missing,
  .prompt {
    margin: 0;
    color: #595959;
    font-size: 0.78rem;
  }

  .buttons {
    display: flex;
    gap: 0.4rem;
  }

  button,
  select,
  input {
    padding: 0.15rem 0.5rem;
    border: 1px solid #bdbdbd;
    border-radius: 3px;
    background: #fafafa;
    font: inherit;
    color: inherit;
  }

  button {
    cursor: pointer;
  }

  button:disabled {
    cursor: default;
    opacity: 0.6;
  }

  button:focus-visible,
  select:focus-visible,
  input:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }
</style>
