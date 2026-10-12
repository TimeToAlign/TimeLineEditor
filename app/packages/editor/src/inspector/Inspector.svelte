<script lang="ts">
import type { LivePlacement } from "@timetoalign/tilie-arranger";
import type { Block, BlockId, Json, Store, View } from "@timetoalign/tilie-core";
import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";
import type { Property } from "./edit.ts";
import {
  applyText,
  follow,
  manifestOf,
  manifestText,
  PROPERTIES,
  problemPointer,
  propertyCommand,
  STEPS,
  selectedBlock,
  shownValue,
  stepValue,
} from "./edit.ts";
import type { Format, Source } from "./formats.ts";
import { FORMATS, isLoaded, loadCodec } from "./formats.ts";
import type { InspectorProblem } from "./problems.ts";

let {
  store,
  selection,
  live = null,
}: {
  store: Store;
  selection: ReadonlySet<string>;
  /** The placement a canvas gesture shows before release; the form shows it for its block. */
  live?: LivePlacement | null;
} = $props();

const FORMAT_LABELS: { readonly [format in Format]: string } = {
  json: "JSON",
  yaml: "YAML",
  toml: "TOML",
};

/** The store's view, followed through `subscribe`. */
let view: View = $state.raw(untrack(() => store.view));
$effect(() => {
  view = store.view;
  return store.subscribe((next) => {
    view = next;
  });
});

const block = $derived(selectedBlock(view, selection));

let format: Format = $state("json");
let showStyling = $state(false);

/** The text in the editor, and the text as last written from the manifest. */
let text = $state("");
let shownText = $state("");
/** Which block, manifest and options the shown text was written from; `null` while it shows nothing. */
let shown: {
  block: BlockId;
  manifest: Json;
  format: Format;
  showStyling: boolean;
} | null = $state.raw(null);
/** The parsed document behind the shown text, patched in place so its comments survive. */
let source: Source | null = null;
let problems: readonly InspectorProblem[] = $state.raw([]);
/** The manifest changed while the text held unapplied edits. */
let stale = $state(false);

/** Counts the codecs loaded so far, so that what reads `isLoaded` is read again. */
let codecsLoaded = $state(0);
/** Why the chosen format's codec could not be loaded; empty while none failed. */
let loadFailure = $state("");
/** Whether the chosen format can be written and read now (JSON always; YAML and TOML once loaded). */
const ready = $derived(codecsLoaded >= 0 && isLoaded(format));

/** Start loading the codec of `wanted`, unless it is there already. */
function ensureCodec(wanted: Format): void {
  if (isLoaded(wanted)) return;
  loadFailure = "";
  loadCodec(wanted).then(
    () => {
      codecsLoaded += 1;
    },
    (error: unknown) => {
      if (format !== wanted) return;
      const reason = error instanceof Error ? error.message : String(error);
      loadFailure = `${FORMAT_LABELS[wanted]} could not be loaded (${reason}).`;
    },
  );
}

const dirty = $derived(text !== shownText);
/** Whether there is a text to apply: a written manifest, or an edit. */
const canApply = $derived(shown !== null && (dirty || shownText !== ""));

/** Show the manifest of `id` in the text, patching the current document when it already shows that block. */
function show(id: BlockId, manifest: Json): void {
  const patchable =
    source !== null &&
    shown !== null &&
    shown.block === id &&
    shown.format === format &&
    shown.showStyling === showStyling;
  const written =
    patchable && source !== null
      ? follow(source, manifest, showStyling)
      : manifestText(manifest, format, showStyling);
  shown = { block: id, manifest, format, showStyling };
  stale = false;
  if (written.ok) {
    source = written.value.source;
    text = shownText = written.value.text;
    problems = [];
  } else {
    source = null;
    text = shownText = "";
    problems = written.problems;
  }
}

// Follow the selection, the manifest and the options while the text holds no unapplied edit.
$effect(() => {
  const id = block?.id ?? null;
  const manifest = block === null ? null : manifestOf(block);
  const options = { format, showStyling };
  const codecReady = ready;
  untrack(() => {
    if (!codecReady) {
      ensureCodec(options.format);
      return;
    }
    const current = shown;
    if (
      current !== null &&
      current.block === id &&
      current.manifest === manifest &&
      current.format === options.format &&
      current.showStyling === options.showStyling
    ) {
      return;
    }
    if (dirty) {
      stale = true;
      return;
    }
    if (id === null || manifest === null) {
      shown = null;
      source = null;
      text = shownText = "";
      problems = [];
      stale = false;
      return;
    }
    show(id, manifest);
  });
});

function apply(): void {
  if (shown === null) return;
  const id = shown.block;
  const result = applyText(store, id, shown.format, text, shown.showStyling);
  if (!result.ok) {
    problems = result.problems;
    return;
  }
  source = result.value.source;
  text = shownText = result.value.text;
  shown = { ...shown, manifest: manifestOf(store.view.blocks[id] as Block) };
  problems = [];
  stale = false;
}

function revert(): void {
  source = null;
  shown = null;
  stale = false;
  if (block === null) {
    text = shownText = "";
    problems = [];
    return;
  }
  show(block.id, manifestOf(block));
}

function onTextKey(event: KeyboardEvent): void {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    apply();
  }
}

/** What the user typed into a property field and has not committed yet. */
let drafts: { [property in Property]?: string } = $state({});
let propertyProblems: { [property in Property]?: string } = $state({});

/** What a field shows: its draft, else the live or stored value rounded to two decimals. */
function fieldValue(property: Property): string {
  const draft = drafts[property];
  if (draft !== undefined) return draft;
  if (block === null) return "";
  return shownValue((live !== null && live.id === block.id ? live : block)[property]);
}

function commitProperty(property: Property): void {
  const draft = drafts[property];
  if (block === null || draft === undefined) return;
  const command = propertyCommand(block.id, property, draft);
  const refusal = command.ok ? store.dispatch(command.value) : command.problems[0];
  if (refusal !== null && refusal !== undefined) {
    propertyProblems[property] = refusal.message;
    return;
  }
  delete drafts[property];
  delete propertyProblems[property];
}

/**
 * Commit one step of the property's `STEPS` (`direction` ±1) at once: from
 * the draft when there is one, else from the stored value (never from the
 * rounded text the field shows); an empty field counts as 0. A draft that
 * is no number is not stepped.
 */
function step(property: Property, direction: 1 | -1): void {
  if (block === null) return;
  const draft = drafts[property]?.trim();
  const base = draft === undefined ? block[property] : draft === "" ? null : Number(draft);
  if (base !== null && !Number.isFinite(base)) return;
  drafts[property] = String(stepValue(base, direction, STEPS[property]));
  commitProperty(property);
}

/**
 * The field a pointer is pressed on. An input while it is pressed, of a
 * kind spin buttons send (Chromium and WebKit no `inputType`, Firefox
 * `insertReplacementText`), comes from the field's spin buttons; typing
 * needs no press, and a paste or a drop with the pointer has a kind of its own.
 */
let pressed: EventTarget | null = null;

const SPIN_INPUTS: ReadonlySet<string> = new Set(["", "insertReplacementText"]);

/**
 * A wheel turn over the focused field steps it, as a stepping key does.
 * Listened to actively: Svelte's own wheel listeners are passive, and the
 * browser's own wheel stepping would start from the shown text.
 */
function wheelSteps(property: Property): Attachment<HTMLInputElement> {
  return (input) => {
    const onwheel = (event: WheelEvent) => {
      if (document.activeElement !== input || event.deltaY === 0) return;
      event.preventDefault();
      step(property, event.deltaY < 0 ? 1 : -1);
    };
    input.addEventListener("wheel", onwheel, { passive: false });
    return () => input.removeEventListener("wheel", onwheel);
  };
}

function onPropertyInput(event: Event & { currentTarget: HTMLInputElement }, property: Property) {
  const input = event.currentTarget;
  const kind = event instanceof InputEvent ? event.inputType : "";
  if (pressed === input && SPIN_INPUTS.has(kind)) {
    // The browser stepped from the shown text; the step is applied to the exact value instead.
    const direction = Math.sign(Number(input.value) - Number(fieldValue(property)));
    if (direction === 1 || direction === -1) {
      step(property, direction);
      input.value = fieldValue(property);
      return;
    }
  }
  drafts[property] = input.value;
}

function onPropertyKey(event: KeyboardEvent, property: Property): void {
  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    event.preventDefault();
    step(property, event.key === "ArrowUp" ? 1 : -1);
  } else if (event.key === "Enter") {
    event.preventDefault();
    commitProperty(property);
  } else if (event.key === "Escape") {
    delete drafts[property];
    delete propertyProblems[property];
  }
}

const blockId = $derived(block?.id ?? null);

// A draft belongs to the block it was typed for.
$effect(() => {
  void blockId;
  untrack(() => {
    drafts = {};
    propertyProblems = {};
  });
});

function position(problem: InspectorProblem): string {
  if (problem.line === undefined) return "";
  return problem.column === undefined
    ? `line ${problem.line}`
    : `line ${problem.line}, column ${problem.column}`;
}
</script>

<svelte:window onpointerup={() => (pressed = null)} onpointercancel={() => (pressed = null)} />

{#if shown === null && block === null}
  <p class="hint">Select a block to inspect its manifest.</p>
{:else}
  <div class="inspector-body">
    {#if block !== null}
      <form class="properties" aria-label="Block properties" onsubmit={(event) => event.preventDefault()}>
        {#each PROPERTIES as property (property)}
          <label>
            <span>{property}</span>
            <input
              type="number"
              step="any"
              name={property}
              value={fieldValue(property)}
              placeholder={property === "width" || property === "height" ? "auto" : undefined}
              aria-invalid={propertyProblems[property] !== undefined}
              aria-describedby={propertyProblems[property] !== undefined
                ? `property-problem-${property}`
                : undefined}
              onpointerdown={(event) => (pressed = event.currentTarget)}
              oninput={(event) => onPropertyInput(event, property)}
              {@attach wheelSteps(property)}
              onkeydown={(event) => onPropertyKey(event, property)}
              onblur={() => commitProperty(property)}
            />
          </label>
          {#if propertyProblems[property] !== undefined}
            <p class="problem" id={`property-problem-${property}`}>{propertyProblems[property]}</p>
          {/if}
        {/each}
      </form>
    {/if}

    <div class="options">
      <div
        class="formats"
        role="radiogroup"
        aria-label="Manifest format"
        aria-describedby={dirty ? "inspector-switch-hint" : undefined}
      >
        {#each FORMATS as item (item)}
          <label class={["segment", { checked: format === item }]}>
            <input
              type="radio"
              name="inspector-format"
              value={item}
              bind:group={format}
              disabled={dirty}
            />
            {FORMAT_LABELS[item]}
          </label>
        {/each}
      </div>
      <label class="styling">
        <input
          type="checkbox"
          bind:checked={showStyling}
          disabled={dirty}
          aria-describedby={dirty ? "inspector-switch-hint" : undefined}
        />
        Show styling
      </label>
      {#if dirty}
        <p class="switch-hint" id="inspector-switch-hint">Apply or Revert to switch</p>
      {/if}
    </div>

    {#if stale}
      <p class="notice" role="status">The manifest changed; Revert to see it</p>
    {/if}

    {#if !ready}
      {#if loadFailure}
        <p class="load-failure" role="alert">{loadFailure}</p>
      {:else}
        <p class="loading" role="status">Loading {FORMAT_LABELS[format]}…</p>
      {/if}
    {:else}
    <label class="manifest-label" for="inspector-text">Manifest ({FORMAT_LABELS[format]})</label>
    <textarea
      id="inspector-text"
      spellcheck="false"
      autocomplete="off"
      rows="20"
      bind:value={text}
      onkeydown={onTextKey}
      aria-invalid={problems.length > 0}
      aria-describedby={problems.length > 0 ? "inspector-problems" : undefined}
    ></textarea>

    <div class="actions">
      <button type="button" onclick={apply} disabled={!canApply}>Apply</button>
      <button type="button" onclick={revert} disabled={!dirty && !stale && problems.length === 0}
        >Revert</button
      >
    </div>

    <ul id="inspector-problems" class="problems" aria-live="polite">
      {#each problems as problem, index (index)}
        <li>
          <code class="code">{problem.code}</code>
          {problem.message}
          {#if problem.line !== undefined}
            <span class="where">at {position(problem)}</span>
          {:else}
            <span class="where"
              >at {#if problemPointer(problem) === ""}the top level{:else}<code class="pointer"
                  >{problemPointer(problem)}</code
                >{/if}</span
            >
          {/if}
        </li>
      {/each}
    </ul>
    {/if}
  </div>
{/if}

<style>
  .hint {
    margin: 0.5rem 0.75rem;
    font-size: 0.85rem;
    color: #595959;
  }

  .inspector-body {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0 0.75rem 0.75rem;
    font-size: 0.85rem;
  }

  .properties {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.25rem 0.5rem;
  }

  .properties label {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .properties span {
    color: #595959;
  }

  .properties input {
    min-width: 0;
    font: inherit;
  }

  .properties .problem {
    grid-column: 1 / -1;
    margin: 0;
    color: #b00020;
  }

  .options {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .formats {
    display: inline-flex;
    border: 1px solid #b0b0b0;
    border-radius: 4px;
    overflow: hidden;
  }

  .segment {
    position: relative;
    padding: 0.15rem 0.5rem;
    cursor: pointer;
  }

  .segment + .segment {
    border-left: 1px solid #b0b0b0;
  }

  .segment.checked {
    background: #1a1a1a;
    color: #fff;
  }

  /* The radio itself is invisible but stays focusable; the segment shows its state. */
  .segment input {
    position: absolute;
    opacity: 0;
    inset: 0;
    margin: 0;
    cursor: inherit;
  }

  .segment:has(input:focus-visible) {
    outline: 2px solid #0a84ff;
    outline-offset: -2px;
  }

  .segment:has(input:disabled) {
    cursor: not-allowed;
  }

  .switch-hint {
    flex-basis: 100%;
    margin: 0;
    color: #595959;
  }

  .notice {
    margin: 0;
    padding: 0.25rem 0.5rem;
    border-left: 3px solid #8a6d00;
    background: #fff8e1;
  }

  .loading {
    margin: 0;
    color: #595959;
  }

  .load-failure {
    margin: 0;
    color: #b00020;
  }

  .manifest-label {
    color: #595959;
  }

  textarea {
    box-sizing: border-box;
    width: 100%;
    resize: vertical;
    font-family: ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace;
    font-size: 0.8rem;
    line-height: 1.35;
    tab-size: 2;
    white-space: pre;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  .actions button {
    font: inherit;
    padding: 0.15rem 0.75rem;
  }

  .problems {
    margin: 0;
    padding: 0;
    list-style: none;
    color: #b00020;
  }

  .problems li + li {
    margin-top: 0.25rem;
  }

  .problems .code,
  .problems .pointer {
    font-family: ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace;
  }
</style>
