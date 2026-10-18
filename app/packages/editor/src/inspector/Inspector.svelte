<script lang="ts">
import type { LivePlacement, LiveStore } from "@timetoalign/tilie-arranger";
import type { Block, BlockId, EditorKind, Json } from "@timetoalign/tilie-core";
import { unknownKeys } from "@timetoalign/tilie-core";
import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";
import EditingBar from "./EditingBar.svelte";
import type { TextOptions } from "./edit.ts";
import {
  applyText,
  follow,
  manifestOf,
  manifestText,
  problemPointer,
  selectedBlock,
  selectedTimeline,
} from "./edit.ts";
import type { Format, Source } from "./formats.ts";
import { FORMATS, isLoaded, loadCodec } from "./formats.ts";
import JournalPanel from "./JournalPanel.svelte";
import { editorName, journalRows } from "./journal.ts";
import type { InspectorProblem } from "./problems.ts";
import type { Property } from "./properties.ts";
import {
  commonValue,
  FIELDS,
  fieldLabel,
  geometryOf,
  offered,
  propertyCommand,
  STEPS,
  shownValue,
  stepCommand,
  stepValue,
} from "./properties.ts";

let {
  live,
  selection,
  placement = null,
}: {
  /** The open workspace's store, read as Svelte state. */
  live: LiveStore;
  selection: ReadonlySet<string>;
  /** The placement a canvas gesture shows before release; the form shows it for its block. */
  placement?: LivePlacement | null;
} = $props();

const FORMAT_LABELS: { readonly [format in Format]: string } = {
  json: "JSON",
  yaml: "YAML",
  toml: "TOML",
};

/** The inspector's sections, in tab order; Editor is there only while an editor is open. */
const TABS = ["editor", "properties", "manifest", "journal"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: { readonly [tab in Tab]: string } = {
  editor: "Editor",
  properties: "Properties",
  manifest: "Manifest",
  journal: "Journal",
};

const KIND_LABELS: { readonly [kind in EditorKind]: string } = {
  bundle: "Bundle",
  group: "Group",
  timeline: "Timeline",
};

const view = $derived(live.view);
const editing = $derived(live.editing);
/** How many editors are open; it changes only when one opens or closes. */
const depth = $derived(editing.length);

/** The tabs present, in order. */
const tabs: readonly Tab[] = $derived(depth > 0 ? TABS : TABS.filter((item) => item !== "editor"));

/** The innermost open editor, which the Editor tab names. */
const innermost = $derived(editing.at(-1));

let depthSeen = untrack(() => depth);
let openingsSeen = 0;
/** How many editors were opened since mount, counted as the editing path grows. */
const openings = $derived.by(() => {
  if (depth > depthSeen) openingsSeen += 1;
  depthSeen = depth;
  return openingsSeen;
});

/** The tab last chosen, and how many editors had been opened then. */
let picked: { readonly tab: Tab; readonly openings: number } = $state.raw({
  tab: untrack(() => (depth > 0 ? "editor" : "properties")),
  openings: 0,
});

/**
 * The section shown: Editor while an editor is open at mount, else Properties; then Editor on
 * every opening, Properties when the last editor closes with Editor shown, and otherwise the
 * tab chosen, kept while the selection changes.
 */
const tab: Tab = $derived.by(() => {
  const chosen = openings > picked.openings ? "editor" : picked.tab;
  return depth === 0 && chosen === "editor" ? "properties" : chosen;
});

function choose(next: Tab): void {
  picked = { tab: next, openings };
}

/** The Journal tab's rows; they read the store's levels, so they follow its every change. */
const rows = $derived(journalRows(live, view));

/** The tab buttons, to move the focus with the keys. */
const tabButtons: { [tab in Tab]?: HTMLButtonElement } = {};

/**
 * The keys of a tab list: the arrows move to the next or previous tab present (wrapping), Home
 * and End to the first and last. A key held with Alt, Ctrl or Meta is left to the browser
 * (Alt+ArrowLeft goes back).
 */
function onTabKey(event: KeyboardEvent, from: Tab): void {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const at = tabs.indexOf(from);
  const next =
    event.key === "ArrowRight"
      ? tabs[(at + 1) % tabs.length]
      : event.key === "ArrowLeft"
        ? tabs[(at + tabs.length - 1) % tabs.length]
        : event.key === "Home"
          ? tabs[0]
          : event.key === "End"
            ? tabs[tabs.length - 1]
            : undefined;
  if (next === undefined) return;
  event.preventDefault();
  choose(next);
  tabButtons[next]?.focus();
}

const block = $derived(selectedBlock(view, selection));

/** The one timeline selected, or one of its parts; its `locked` is shown. */
const timeline = $derived(selectedTimeline(view, selection));

/**
 * The geometry the Properties form edits: elements of one kind in the block;
 * else `null`. Its items and cards follow a canvas gesture on their block
 * live, and an edit follows the gestures' rule of the current level.
 */
const geometry = $derived(geometryOf(view, selection, innermost?.kind ?? "arranger", placement));

/** The fields the form offers, in order: the geometry's kind's. */
const fields = $derived(geometry === null ? [] : FIELDS[geometry.kind]);

/** What the Properties and Manifest tabs show while there is no block to inspect. */
const HINT = "Select a block to inspect its manifest.";

/** What the Properties tab shows for a selection in one block without one kind of geometry. */
const GEOMETRY_HINT = "Select a block, a frame or a card to edit its geometry.";

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
//   const refusal = live.store.dispatch({
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
  const result = applyText(live.store, id, shown.format, text, {
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
  shown = { ...shown, manifest: manifestOf(live.store.view.blocks[id] as Block) };
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

/**
 * What a field shows: its draft, else the block's live value during a canvas
 * gesture, else the value every edited element shares (stated, else drawn),
 * rounded to two decimals; empty while the elements' values differ.
 */
function fieldValue(property: Property): string {
  const draft = drafts[property];
  if (draft !== undefined) return draft;
  if (geometry === null) return "";
  if (geometry.kind === "block" && placement !== null && placement.id === geometry.block.id) {
    return shownValue(placement[property]);
  }
  const value = commonValue(geometry, property);
  return value === undefined ? "" : shownValue(value);
}

/** A field's placeholder: "mixed" while the edited elements differ, "auto" for a block's own size. */
function placeholder(property: Property): string | undefined {
  if (geometry === null) return undefined;
  if (commonValue(geometry, property) === undefined) return "mixed";
  return geometry.kind === "block" && (property === "width" || property === "height")
    ? "auto"
    : undefined;
}

function commitProperty(property: Property): void {
  const draft = drafts[property];
  if (geometry === null || draft === undefined) return;
  const command = propertyCommand(geometry, property, draft);
  const refusal = command.ok ? live.store.dispatch(command.value) : command.problems[0];
  if (refusal !== null && refusal !== undefined) {
    propertyProblems[property] = refusal.message;
    return;
  }
  delete drafts[property];
  delete propertyProblems[property];
}

/**
 * Commit one step of the property's `STEPS` (`direction` ±1) at once: from
 * the draft when there is one (an empty field counts as 0, a draft that is
 * no number is not stepped), else each element from its own exact value
 * (never from the rounded text the field shows).
 */
function step(property: Property, direction: 1 | -1): void {
  if (geometry === null) return;
  const draft = drafts[property]?.trim();
  if (draft === undefined) {
    const refusal = live.store.dispatch(stepCommand(geometry, property, direction));
    if (refusal === null) delete propertyProblems[property];
    else propertyProblems[property] = refusal.message;
    return;
  }
  const base = draft === "" ? null : Number(draft);
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

/** The elements the form edits, as one text: a draft belongs to them. */
const editedElements = $derived(
  geometry === null
    ? ""
    : `${geometry.kind} ${geometry.elements.map((element) => element.target).join(" ")}`,
);

// A draft belongs to the elements it was typed for.
$effect(() => {
  void editedElements;
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

{#snippet lockedCell(locked: boolean)}
  <label class="locked">
    <input type="checkbox" checked={locked} disabled title={LOCKING_UNAVAILABLE} />
    Locked
  </label>
{/snippet}

<!-- Full width above the tabs, while an editor is open. -->
<EditingBar {live} />

<div class="inspector-body">
  <div class="tabs" role="tablist" aria-label="Inspector sections">
    {#each tabs as item (item)}
      <button
        type="button"
        role="tab"
        id={`inspector-tab-${item}`}
        aria-controls={`inspector-panel-${item}`}
        aria-selected={tab === item}
        tabindex={tab === item ? 0 : -1}
        bind:this={tabButtons[item]}
        onclick={() => choose(item)}
        onkeydown={(event) => onTabKey(event, item)}>{TAB_LABELS[item]}</button
      >
    {/each}
  </div>

  {#if innermost !== undefined}
    <div
      class="panel"
      role="tabpanel"
      id="inspector-panel-editor"
      aria-labelledby="inspector-tab-editor"
      hidden={tab !== "editor"}
    >
      <p class="editor">{KIND_LABELS[innermost.kind]} editor: {editorName(view, innermost.target)}</p>
    </div>
  {/if}

  <div
    class="panel"
    role="tabpanel"
    id="inspector-panel-properties"
    aria-labelledby="inspector-tab-properties"
    hidden={tab !== "properties"}
  >
    {#if shown === null && block === null}
      <p class="hint">{HINT}</p>
    {:else if block !== null}
      {#if geometry === null}
        <p class="hint">{GEOMETRY_HINT}</p>
      {/if}
      {#if geometry !== null || timeline !== null}
        <form
          class="properties"
          aria-label={geometry?.label ?? "Timeline properties"}
          onsubmit={(event) => event.preventDefault()}
        >
          {#each fields as property (property)}
            <label>
              <span>{geometry === null ? property : fieldLabel(geometry.kind, property)}</span>
              <input
                type="number"
                step="any"
                name={property}
                disabled={!offered(geometry, property)}
                value={fieldValue(property)}
                placeholder={placeholder(property)}
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
              {@render lockedCell(timeline.timeline.locked)}
            {/if}
            {#if propertyProblems[property] !== undefined}
              <p class="problem" id={`property-problem-${property}`}>{propertyProblems[property]}</p>
            {/if}
          {/each}
          {#if timeline !== null && !fields.includes("height")}
            <!-- A timeline drawn in no card of its own: its only cell. -->
            {@render lockedCell(timeline.timeline.locked)}
          {/if}
        </form>
      {/if}
    {/if}
  </div>

  <div
    class="panel"
    role="tabpanel"
    id="inspector-panel-manifest"
    aria-labelledby="inspector-tab-manifest"
    hidden={tab !== "manifest"}
  >
    {#if shown === null && block === null}
      <p class="hint">{HINT}</p>
    {:else}
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
    {/if}
  </div>

  <div
    class="panel"
    role="tabpanel"
    id="inspector-panel-journal"
    aria-labelledby="inspector-tab-journal"
    hidden={tab !== "journal"}
  >
    {#if tab === "journal"}
      <JournalPanel {rows} />
    {/if}
  </div>
</div>

<style>
  .hint {
    margin: 0;
    color: #595959;
  }

  .editor {
    margin: 0;
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
