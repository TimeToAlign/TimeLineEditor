<script lang="ts">
/**
 * The Timestamp tab, three areas one below the other. **Coordinates**, a
 * bordered panel: a hint while no timestamp is shown, else the format
 * switch and the timestamp's values, in Editor one group per timeline
 * crossed whose exact values can be edited and copied (the value, the raw
 * text with its unit written out, the pretty text), else its text in JSON,
 * YAML or TOML with one Copy. **Properties**, a key/value grid: the name
 * (naming an unnamed timestamp stores it), what it displays, and Delete;
 * only the name while it is unnamed. **Coordinate granularity**, the
 * workspace's two settings on one line at the pane's bottom. An edit of an
 * unnamed timestamp moves its pin; every change of a named one is a
 * command. Every value, row, position and text is core's; the panel lays
 * them out, reads typed text and sends commands. A copy is confirmed in the
 * message bar; a refusal shows at its field.
 */
import type { LiveStore } from "@timetoalign/tilie-arranger";
import type { Command, Granularity, Pin, TimestampDisplay } from "@timetoalign/tilie-core";
import { parseAxisValue, pinAt, positionFor, timestampJson } from "@timetoalign/tilie-core";
import { Rational } from "@timetoalign/tilie-core/numbers";
import { informOf } from "../messages.svelte.ts";
import FormatSwitch from "./FormatSwitch.svelte";
import type { Format } from "./formats.svelte.ts";
import { FORMAT_LABELS, FORMATS, isLoaded, loadCodec, writeText } from "./formats.svelte.ts";
import type { Copies, ValueRow } from "./timestamp.ts";
import {
  addedTimestamp,
  DISPLAY_WORDS,
  displayCommand,
  displayOf,
  moveCommand,
  nameCommand,
  removeCommand,
  timelineRows,
} from "./timestamp.ts";

interface Props {
  /** The open workspace's store, read as Svelte state. */
  live: LiveStore;
  /** The timestamp shown; `null` while none is. */
  pin: Pin | null;
  /** The timestamp shown is now `next`: an unnamed one moved, or named. */
  onpin: (next: Pin) => void;
}

let { live, pin, onpin }: Props = $props();

const uid = $props.id();
const inform = informOf();

const HINT =
  "Turn on Show coordinates (C) and click a timeline to pin a timestamp. With Show coordinates off, click a timestamp to edit it.";
const READ_ONLY = "This value cannot be solved for a position, so it cannot be edited.";
const EMPTY_NAME = "A named timestamp keeps a name; Delete removes it.";
const UNNAMED =
  "Naming the timestamp stores it; then its display can be set and it can be deleted.";
const NAME_PLACEHOLDER = "Type a name to keep it";

/** The Copy columns: what each copies, its heading and its buttons' title, which their label extends with the row. */
const COPY_COLUMNS: readonly {
  readonly copies: keyof Copies;
  readonly heading: string;
  readonly label: string;
}[] = [
  { copies: "value", heading: "value", label: "Copy the value" },
  { copies: "raw", heading: "value + unit", label: "Copy the value with its unit written out" },
  { copies: "pretty", heading: "pretty", label: "Copy the value with symbols" },
];

/** What the Coordinates area shows: the values to edit, or the timestamp's text in a format. */
type Shown = "editor" | Format;
const SHOWN: readonly { readonly value: Shown; readonly label: string }[] = [
  { value: "editor", label: "Editor" },
  ...FORMATS.map((value) => ({ value, label: FORMAT_LABELS[value] })),
];

const view = $derived(live.view);
const groups = $derived(pin === null ? [] : timelineRows(pin));
const display = $derived(pin === null ? [] : displayOf(pin));

// --- Typed text -------------------------------------------------------------

type Texts = { readonly [key: string]: string };

/**
 * The texts typed into the name field (`name`) and the value fields (each
 * row's key) while they differ from what is shown, and the refusals, by
 * the same keys (`display` and `delete` for those controls): held for the
 * pin they were typed for, so that another pin shows none.
 */
let typed: { readonly owner: Pin | null; readonly drafts: Texts; readonly problems: Texts } =
  $state.raw({ owner: null, drafts: {}, problems: {} });
const drafts: Texts = $derived(typed.owner === pin ? typed.drafts : {});
const problems: Texts = $derived(typed.owner === pin ? typed.problems : {});

function without(texts: Texts, key: string): Texts {
  const { [key]: _, ...rest } = texts;
  return rest;
}

function draft(key: string, text: string): void {
  typed = { owner: pin, drafts: { ...drafts, [key]: text }, problems: without(problems, key) };
}

/** Drop the draft and the refusal of `key`: the field shows what is stored again. */
function settled(key: string): void {
  typed = { owner: pin, drafts: without(drafts, key), problems: without(problems, key) };
}

/** Keep the draft of `key` and show why it was refused. */
function refused(key: string, message: string): void {
  typed = { owner: pin, drafts, problems: { ...problems, [key]: message } };
}

/** Dispatch `command`; a refusal is shown at `key`, an acceptance settles it. */
function send(key: string, command: Command): boolean {
  const refusal = live.store.dispatch(command);
  if (refusal === null) settled(key);
  else refused(key, refusal.message);
  return refusal === null;
}

/** Enter commits a field, Escape shows what is stored again. */
function onFieldKey(event: KeyboardEvent, key: string, commit: () => void): void {
  if (event.key === "Enter") {
    event.preventDefault();
    commit();
  } else if (event.key === "Escape") settled(key);
}

// --- Coordinates ------------------------------------------------------------

/** Enter or leaving a value field: the position that gives the typed value, as the pin or as a `set`. */
function commitValue(row: ValueRow): void {
  const text = drafts[row.key];
  if (pin === null || text === undefined || !row.editable || row.numberType === null) return;
  const value = parseAxisValue(text, row.numberType);
  const position = value instanceof Rational ? positionFor(pin, row.row, value) : value;
  if (!(position instanceof Rational)) {
    refused(row.key, position.message);
    return;
  }
  const moved = pinAt(pin, position);
  if (pin.named === null) {
    settled(row.key);
    onpin(moved);
    return;
  }
  const command = moveCommand(pin, moved);
  if (command === null) settled(row.key);
  else send(row.key, command);
}

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

/** The timestamp as text in the chosen format, or why it cannot be written; `null` while its codec loads. */
const text = $derived.by(() => {
  if (pin === null || shown === "editor" || !isLoaded(shown)) return null;
  const written = writeText(shown, timestampJson(pin));
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

// --- Properties -------------------------------------------------------------

/** Enter or leaving the name field: name an unnamed timestamp, storing it, or rename a named one. */
function commitName(): void {
  const name = drafts.name;
  if (pin === null || name === undefined) return;
  const { named } = pin;
  if (named === null) {
    if (name === "") {
      settled("name");
      return;
    }
    const before = live.store.view;
    if (!send("name", nameCommand(pin, name))) return;
    const added = addedTimestamp(before, live.store.view, pin.spec.block);
    if (added !== null) onpin({ ...pin, named: added });
  } else if (name === "") {
    typed = {
      owner: pin,
      drafts: without(drafts, "name"),
      problems: { ...problems, name: EMPTY_NAME },
    };
  } else if (name === named.name) settled("name");
  else send("name", nameCommand(pin, name));
}

function toggle(word: TimestampDisplay): void {
  if (pin !== null && pin.named !== null) send("display", displayCommand(pin, word));
}

function remove(): void {
  if (pin !== null && pin.named !== null) send("delete", removeCommand(pin));
}

// --- Coordinate granularity -------------------------------------------------

type Kind = keyof Granularity;

/** One granularity setting: its label and its hover hint. */
const SETTINGS: readonly { readonly kind: Kind; readonly label: string; readonly hint: string }[] =
  [
    {
      kind: "denominator",
      label: "Denominator",
      hint: "A fraction position is never finer than 1 / denominator.",
    },
    {
      kind: "decimals",
      label: "Decimals",
      hint: "A float position has at most this many decimal places, and floats are shown with them.",
    },
  ];

const granularity = $derived(view.settings.granularity);

/** The text typed into a setting while it differs from what is stated, and the store's refusal of it. */
const settingDrafts: { [kind in Kind]?: string } = $state({});
const settingProblems: { [kind in Kind]?: string } = $state({});

/** A field's text as the setting's number; text that is no integer gives NaN, which the store refuses. */
function numberOf(text: string): number {
  return /^\s*\d+\s*$/.test(text) ? Number(text) : Number.NaN;
}

function configure(kind: Kind, text: string): void {
  settingDrafts[kind] = text;
  const value = numberOf(text);
  const change = kind === "denominator" ? { denominator: value } : { decimals: value };
  const refusal = live.store.configure({ granularity: change });
  if (refusal === null) delete settingProblems[kind];
  else settingProblems[kind] = refusal.message;
}

/** Leaving a setting shows what is stated again. */
function leave(kind: Kind): void {
  delete settingDrafts[kind];
  delete settingProblems[kind];
}
</script>

{#snippet copyIcon()}
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
    <rect x="5.5" y="5.5" width="8" height="9" rx="1" />
    <path d="M3.5 10.5h-1v-8a1 1 0 0 1 1-1h7v1" />
  </svg>
{/snippet}

<div class="pane">
  <section class="area coordinates" aria-labelledby="{uid}-coordinates">
    <h3 id="{uid}-coordinates">Coordinates</h3>
    {#if pin === null}
      <p class="hint" data-testid="timestamp-hint">{HINT}</p>
    {:else}
      <FormatSwitch options={SHOWN} bind:value={() => shown, choose} label="Timestamp format" />

      {#if shown === "editor"}
        <span class="visually-hidden" id="{uid}-read-only">{READ_ONLY}</span>
        <table>
          <thead>
            <tr>
              <th scope="col"><span class="visually-hidden">Label</span></th>
              <th scope="col"><span class="visually-hidden">Value</span></th>
              {#each COPY_COLUMNS as column (column.copies)}
                <th scope="col" class="copy">{column.heading}</th>
              {/each}
            </tr>
          </thead>
          {#each groups as group, g (group.timeline)}
            <tbody data-timeline={group.timeline}>
              <tr>
                <th colspan={2 + COPY_COLUMNS.length} scope="colgroup">{group.name}</th>
              </tr>
              {#each group.rows as row, r (row.key)}
                {@const locked = row.numberType !== null && !row.editable}
                {@const problem = `${uid}-${g}-${r}-problem`}
                {@const named = `${row.label} of ${group.name}`}
                <tr data-row={row.key}>
                  <th scope="row">{row.label}</th>
                  <td class="value" title={locked ? READ_ONLY : undefined}>
                    {#if row.numberType === null}
                      <span class="text">{row.text}</span>
                    {:else}
                      <input
                        type="text"
                        size="10"
                        value={drafts[row.key] ?? row.text}
                        readonly={locked}
                        title={locked ? READ_ONLY : undefined}
                        aria-label={named}
                        aria-invalid={problems[row.key] !== undefined}
                        aria-describedby={locked ? `${problem} ${uid}-read-only` : problem}
                        oninput={(event) => draft(row.key, event.currentTarget.value)}
                        onkeydown={(event) => onFieldKey(event, row.key, () => commitValue(row))}
                        onblur={() => commitValue(row)}
                      />
                      {#if row.unit !== null}<span class="unit">{row.unit}</span>{/if}
                    {/if}
                    <span class="problem" id={problem} role="status"
                      >{problems[row.key] ?? ""}</span
                    >
                  </td>
                  {#each COPY_COLUMNS as column (column.copies)}
                    {@const copied = row.copies?.[column.copies] ?? null}
                    <td class="copy">
                      {#if copied !== null}
                        <button
                          type="button"
                          class="icon"
                          aria-label="{column.label} of {named}"
                          title={column.label}
                          onclick={() => copy(copied, copied)}>{@render copyIcon()}</button
                        >
                      {/if}
                    </td>
                  {/each}
                </tr>
              {/each}
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
          <p class="problem text-problem" role="status">{text.message}</p>
        {:else}
          {@const written = text.text}
          <div class="text-head">
            <button type="button" onclick={() => copy(written, `the ${label}`)}>Copy</button>
          </div>
          <pre aria-label="The timestamp as {label}">{written}</pre>
        {/if}
      {/if}
    {/if}
  </section>

  {#if pin !== null}
    {@const unnamed = pin.named === null}
    <section
      class={["area", "properties", { unnamed }]}
      aria-labelledby="{uid}-properties"
      data-testid="timestamp-properties"
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
            value={drafts.name ?? pin.named?.name ?? ""}
            aria-invalid={problems.name !== undefined}
            aria-describedby={unnamed ? `${uid}-name-problem ${uid}-unnamed` : `${uid}-name-problem`}
            oninput={(event) => draft("name", event.currentTarget.value)}
            onkeydown={(event) => onFieldKey(event, "name", commitName)}
            onblur={commitName}
          />
          <span class="problem" id="{uid}-name-problem" role="status">{problems.name ?? ""}</span>
        </div>

        <span class="key needs-name" id="{uid}-display">Display</span>
        <div class="field needs-name">
          <div
            class="toggles"
            role="group"
            aria-labelledby="{uid}-display"
            aria-describedby={unnamed ? `${uid}-unnamed` : undefined}
          >
            {#each DISPLAY_WORDS as { word, label } (word)}
              <button
                type="button"
                class="toggle"
                aria-pressed={display.includes(word)}
                disabled={unnamed}
                onclick={() => toggle(word)}>{label}</button
              >
            {/each}
          </div>
          <span class="problem" role="status">{problems.display ?? ""}</span>
        </div>

        <span class="key needs-name" aria-hidden="true"></span>
        <div class="field needs-name">
          <button
            type="button"
            class="delete"
            disabled={unnamed}
            aria-describedby={unnamed ? `${uid}-unnamed` : undefined}
            onclick={remove}>Delete</button
          >
          <span class="problem" role="status">{problems.delete ?? ""}</span>
        </div>
      </div>
      {#if unnamed}
        <p class="hint" id="{uid}-unnamed">{UNNAMED}</p>
      {/if}
    </section>
  {/if}

  <section class="area granularity" aria-labelledby="{uid}-granularity">
    <h3 id="{uid}-granularity">Coordinate granularity</h3>
    <div class="settings">
      {#each SETTINGS as setting (setting.kind)}
        <label class="setting" title={setting.hint}>
          {setting.label}
          <input
            type="text"
            inputmode="numeric"
            size="5"
            value={settingDrafts[setting.kind] ?? String(granularity[setting.kind])}
            aria-invalid={settingProblems[setting.kind] !== undefined}
            aria-describedby="{uid}-{setting.kind}-problem"
            oninput={(event) => configure(setting.kind, event.currentTarget.value)}
            onchange={() => leave(setting.kind)}
          />
        </label>
        <span class="problem" id="{uid}-{setting.kind}-problem" role="status"
          >{settingProblems[setting.kind] ?? ""}</span
        >
      {/each}
    </div>
  </section>
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

  h3 {
    margin: 0;
    color: #595959;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  /* The values: a bordered panel of their own. */
  .coordinates {
    padding: 0.5rem 0.6rem 0.6rem;
    border: 1px solid #c8c8c8;
    border-radius: 4px;
  }

  .hint {
    color: #595959;
  }

  input[type="text"] {
    font: inherit;
    font-variant-numeric: tabular-nums;
  }

  .problem {
    color: #b00020;
  }

  .problem:empty {
    display: none;
  }

  .value .problem,
  .field .problem {
    display: block;
    font-size: 0.75rem;
  }

  .value .problem:empty,
  .field .problem:empty {
    display: none;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  thead th {
    color: #595959;
    font-size: 0.7rem;
    font-weight: normal;
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

  .value input {
    width: 9em;
    text-align: right;
  }

  /* Read-only: shown, copied, never edited. */
  .value input[readonly] {
    border: 1px solid #e0e0e0;
    background: #f4f4f4;
    color: #6b6b6b;
    cursor: default;
  }

  /*
   * The editor's face, then the bundled Noto Music the canvas declares, so
   * that a pretty unit no system face maps (the whole note) is drawn alike
   * on every host.
   */
  .unit {
    margin-left: 0.25rem;
    color: #595959;
    font-family: system-ui, "TiLiE Noto Music", sans-serif;
  }

  .copy {
    width: 1%;
    padding-left: 0.4rem;
    text-align: center;
    white-space: nowrap;
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

  /* Properties: keys in one column, their controls in the other. */
  .grid {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: baseline;
    gap: 0.4rem 0.75rem;
  }

  .key {
    color: #595959;
  }

  /* The name's placeholder gives way as soon as the field is entered. */
  .name:focus::placeholder {
    color: transparent;
  }

  /* While unnamed, everything but the name is greyed: naming stores the timestamp. */
  .unnamed .needs-name {
    opacity: 0.5;
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

  /* Coordinate granularity: one discreet line at the pane's bottom. */
  .granularity {
    position: sticky;
    bottom: 0;
    margin-top: auto;
    padding: 0.3rem 0;
    border-top: 1px solid #e4e4e4;
    background: #fff;
  }

  .settings {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 0.75rem;
    color: #595959;
    font-size: 0.75rem;
  }

  .setting input {
    width: 4.5em;
    margin-left: 0.3rem;
    padding: 0 0.2rem;
    font-size: 0.75rem;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
