<script lang="ts">
import type { LivePlacement } from "@timetoalign/tilie-arranger";
import type { Block, BlockId, Json, Store, View } from "@timetoalign/tilie-core";
import { unknownKeys } from "@timetoalign/tilie-core";
import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";
import type { Property, TextOptions } from "./edit.ts";
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
  selectedTimeline,
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

/** The inspector's two sections, in tab order. */
const TABS = ["properties", "manifest"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: { readonly [tab in Tab]: string } = {
  properties: "Properties",
  manifest: "Manifest",
};

/** The section shown: Properties whenever the inspector is mounted, then kept while the selection changes. */
let tab: Tab = $state("properties");

/** The tab buttons, to move the focus with the keys. */
const tabButtons: { [tab in Tab]?: HTMLButtonElement } = {};

/**
 * The keys of a tab list: the arrows move to the other tab (wrapping), Home and End to the first
 * and last. A key held with Alt, Ctrl or Meta is left to the browser (Alt+ArrowLeft goes back).
 */
function onTabKey(event: KeyboardEvent, from: Tab): void {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const at = TABS.indexOf(from);
  const next =
    event.key === "ArrowRight"
      ? TABS[(at + 1) % TABS.length]
      : event.key === "ArrowLeft"
        ? TABS[(at + TABS.length - 1) % TABS.length]
        : event.key === "Home"
          ? TABS[0]
          : event.key === "End"
            ? TABS[TABS.length - 1]
            : undefined;
  if (next === undefined) return;
  event.preventDefault();
  tab = next;
  tabButtons[next]?.focus();
}

/** The store's view, followed through `subscribe`. */
let view: View = $state.raw(untrack(() => store.view));
$effect(() => {
  view = store.view;
  return store.subscribe((next) => {
    view = next;
  });
});

const block = $derived(selectedBlock(view, selection));

/** The one timeline selected, or one of its parts; its `locked` is shown. */
const timeline = $derived(selectedTimeline(view, selection));

/** Why the Locked checkbox is disabled. */
const LOCKING_UNAVAILABLE = "Locking and unlocking is not available yet.";

// The Locked checkbox only shows `locked` for now. When locking and unlocking
// is enabled, what it may do depends on where the timeline stands:
// - a plain segment (a child of a segment line that is no segment line
//   itself, `isSegment(manifest, id) && !is_segment_line`) is never locked:
//   its segment line's lock governs it, so its checkbox stays disabled and
//   unchecked;
// - a segment line that is a child, a segment or a group member is locked by
//   default, and unlocking it is not supported yet: the store refuses it;
// - every other timeline toggles through `set locked`.
// The checkbox then loses `disabled` (but for a plain segment) and its
// `title`, takes `onchange={(event) => toggleLocked(event.currentTarget)}`,
// shows `lockedProblem` as the property fields show theirs, and this is
// restored:
//
// let lockedProblem = $state("");
//
// function toggleLocked(input: HTMLInputElement): void {
//   if (timeline === null) return;
//   const refusal = store.dispatch({
//     type: "set",
//     changes: [{ target: timeline.address, values: { locked: input.checked } }],
//   });
//   lockedProblem = refusal === null ? "" : refusal.message;
//   // A refused toggle shows the stored value again.
//   if (refusal !== null) input.checked = timeline.timeline.locked;
// }

/** The keys of the block's manifest no definition declares: warnings, which never stop editing. */
const warnings = $derived(block === null ? [] : unknownKeys(manifestOf(block)));

let format: Format = $state("json");
let includeStyling = $state(false);
let minimal = $state(false);

/** What a text is written in: its format and its options. */
interface Choice extends TextOptions {
  readonly format: Format;
}

const choice: Choice = $derived({ format, includeStyling, minimal });

function sameChoice(left: Choice, right: Choice): boolean {
  return (
    left.format === right.format &&
    left.includeStyling === right.includeStyling &&
    left.minimal === right.minimal
  );
}

/** The text in the editor, and the text as last written from the manifest. */
let text = $state("");
let shownText = $state("");
/** Which block, manifest, format and options the shown text was written from; `null` while it shows nothing. */
let shown: (Choice & { readonly block: BlockId; readonly manifest: Json }) | null =
  $state.raw(null);
/** The parsed document behind the shown text, patched in place so its comments survive. */
let source: Source | null = null;
let problems: readonly InspectorProblem[] = $state.raw([]);
/**
 * Whether the listed problems are a refused Apply's, which belong to the text applied; otherwise
 * they are writing the manifest's, which belong to the manifest.
 */
let refused = false;
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

/** Whether the text differs from the text last written from the manifest; Apply and Revert act only then. */
const dirty = $derived(text !== shownText);

/**
 * Show the manifest of `id` in the text, patching the current document when
 * it already shows that block in the same format and options.
 */
function show(id: BlockId, manifest: Json): void {
  const current = choice;
  const options: TextOptions = {
    includeStyling: current.includeStyling,
    minimal: current.minimal,
  };
  const patchable =
    source !== null && shown !== null && shown.block === id && sameChoice(shown, current);
  const written =
    patchable && source !== null
      ? follow(source, manifest, options)
      : manifestText(manifest, current.format, options);
  shown = { ...current, block: id, manifest };
  stale = false;
  refused = false;
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

// Follow the selection, the manifest and the options while the text holds no unapplied edit;
// a text that becomes clean again (typed back to the shown text) follows at once.
$effect(() => {
  const id = block?.id ?? null;
  const manifest = block === null ? null : manifestOf(block);
  const wanted = choice;
  const codecReady = ready;
  const edited = dirty;
  untrack(() => {
    if (!codecReady) {
      ensureCodec(wanted.format);
      return;
    }
    const current = shown;
    const followed =
      current !== null &&
      current.block === id &&
      current.manifest === manifest &&
      sameChoice(current, wanted);
    if (edited) {
      if (!followed) stale = true;
      return;
    }
    if (followed) {
      // The text was typed back to the shown text: what was refused or stale about it is gone.
      stale = false;
      if (refused) {
        problems = [];
        refused = false;
      }
      return;
    }
    if (id === null || manifest === null) {
      shown = null;
      source = null;
      text = shownText = "";
      problems = [];
      refused = false;
      stale = false;
      return;
    }
    show(id, manifest);
  });
});

function apply(): void {
  if (shown === null) return;
  const id = shown.block;
  const result = applyText(store, id, shown.format, text, {
    includeStyling: shown.includeStyling,
    minimal: shown.minimal,
  });
  if (!result.ok) {
    problems = result.problems;
    refused = true;
    return;
  }
  source = result.value.source;
  text = shownText = result.value.text;
  shown = { ...shown, manifest: manifestOf(store.view.blocks[id] as Block) };
  problems = [];
  refused = false;
  stale = false;
  // The properties show the applied manifest: what was typed for the block before is dropped.
  if (block?.id === id) {
    drafts = {};
    propertyProblems = {};
  }
}

function revert(): void {
  source = null;
  shown = null;
  stale = false;
  if (block === null) {
    text = shownText = "";
    problems = [];
    refused = false;
    return;
  }
  show(block.id, manifestOf(block));
}

function onTextKey(event: KeyboardEvent): void {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    if (dirty) apply();
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
    <div class="tabs" role="tablist" aria-label="Inspector sections">
      {#each TABS as item (item)}
        <button
          type="button"
          role="tab"
          id={`inspector-tab-${item}`}
          aria-controls={`inspector-panel-${item}`}
          aria-selected={tab === item}
          tabindex={tab === item ? 0 : -1}
          bind:this={tabButtons[item]}
          onclick={() => (tab = item)}
          onkeydown={(event) => onTabKey(event, item)}>{TAB_LABELS[item]}</button
        >
      {/each}
    </div>

    <div
      class="panel"
      role="tabpanel"
      id="inspector-panel-properties"
      aria-labelledby="inspector-tab-properties"
      hidden={tab !== "properties"}
    >
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
            {#if property === "height" && timeline !== null}
              <!-- The cell right of height. -->
              <label class="locked">
                <input
                  type="checkbox"
                  checked={timeline.timeline.locked}
                  disabled
                  title={LOCKING_UNAVAILABLE}
                />
                Locked
              </label>
            {/if}
            {#if propertyProblems[property] !== undefined}
              <p class="problem" id={`property-problem-${property}`}>{propertyProblems[property]}</p>
            {/if}
          {/each}
        </form>
      {/if}
    </div>

    <div
      class="panel"
      role="tabpanel"
      id="inspector-panel-manifest"
      aria-labelledby="inspector-tab-manifest"
      hidden={tab !== "manifest"}
    >
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
        <div class="toggles">
          <label>
            <input
              type="checkbox"
              bind:checked={includeStyling}
              disabled={dirty}
              aria-describedby={dirty ? "inspector-switch-hint" : undefined}
            />
            Include styling
          </label>
          <label>
            <input
              type="checkbox"
              bind:checked={minimal}
              disabled={dirty}
              aria-describedby={dirty ? "inspector-switch-hint" : undefined}
            />
            Minimal
          </label>
        </div>
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
          <button type="button" onclick={apply} disabled={!dirty}>Apply</button>
          <button type="button" onclick={revert} disabled={!dirty}>Revert</button>
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

      {#if warnings.length > 0}
        <ul id="inspector-warnings" class="warnings" aria-label="Warnings">
          {#each warnings as warning (`${problemPointer(warning)}\u0000${warning.key}`)}
            {@const pointer = problemPointer(warning)}
            <li>
              Unknown key <code class="key">{warning.key}</code>
              <span class="where"
                >at {#if pointer === ""}the top level{:else}<code class="pointer">{pointer}</code
                  >{/if}</span
              >
            </li>
          {/each}
        </ul>
      {/if}
    </div>
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

  .tabs {
    display: flex;
    border-bottom: 1px solid #b0b0b0;
  }

  .tabs button {
    margin-bottom: -1px;
    padding: 0.2rem 0.75rem;
    border: 1px solid transparent;
    border-radius: 4px 4px 0 0;
    background: none;
    color: #595959;
    font: inherit;
    cursor: pointer;
  }

  .tabs button[aria-selected="true"] {
    border-color: #b0b0b0 #b0b0b0 #fff;
    background: #fff;
    color: #1a1a1a;
  }

  .tabs button:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: -2px;
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* `display` above would otherwise show the panel the tabs hide. */
  .panel[hidden] {
    display: none;
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

  /* Greyed out: the checkbox only shows the value for now. */
  .properties .locked {
    flex-direction: row;
    align-items: center;
    align-self: end;
    gap: 0.25rem;
    color: #595959;
    cursor: not-allowed;
  }

  /* Drawn here rather than by the browser, whose disabled checkbox shows its
     tick too faintly to read: grey, but checked and unchecked stay distinct. */
  .properties .locked input {
    appearance: none;
    display: inline-grid;
    place-content: center;
    width: 0.9rem;
    height: 0.9rem;
    margin: 0;
    border: 1px solid #595959;
    border-radius: 2px;
    background: #ffffff;
    cursor: not-allowed;
  }

  .properties .locked input:checked {
    background: #595959;
  }

  .properties .locked input:checked::before {
    content: "";
    width: 0.3rem;
    height: 0.55rem;
    margin-top: -0.1rem;
    border: solid #ffffff;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
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

  /* Disabled while the text holds an edit: greyed like the checkboxes beside
     it, the checked format still filled. */
  .formats:has(input:disabled),
  .formats:has(input:disabled) .segment + .segment {
    border-color: #d0d0d0;
  }

  .segment:has(input:disabled) {
    color: #595959;
    cursor: not-allowed;
  }

  .segment.checked:has(input:disabled) {
    background: #595959;
    color: #fff;
  }

  .toggles {
    display: flex;
    gap: 0.75rem;
  }

  /* Disabled while the text holds an edit: the label greys with its box. */
  .toggles label:has(input:disabled),
  .toggles input:disabled {
    color: #595959;
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
  .problems .pointer,
  .warnings .key,
  .warnings .pointer {
    font-family: ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace;
  }

  .warnings {
    margin: 0;
    padding: 0.25rem 0.5rem;
    list-style: none;
    border-left: 3px solid #8a6d00;
    background: #fff8e1;
  }

  .warnings li + li {
    margin-top: 0.25rem;
  }
</style>
