<script lang="ts">
/**
 * The Timestamp tab: one main panel holding the shown timestamp or a hint,
 * and one line at the pane's bottom with the workspace's two granularity
 * settings. A timestamp shows a header (its name, whether its
 * cross-section line is shown, Delete for a named one), the format switch
 * and its values: in Pretty a table whose values can be edited and copied,
 * else its text in JSON, YAML or TOML with one Copy. An edit of an unnamed
 * timestamp moves its pin; naming it adds it to the manifest; every change
 * of a named one is a command. Every value, position and text is core's;
 * the panel lays them out, reads typed text and sends commands.
 */
import type { LiveStore } from "@timetoalign/tilie-arranger";
import type { Address, Command, Granularity, Pin } from "@timetoalign/tilie-core";
import {
  copyValue,
  parseAxisValue,
  pinAt,
  positionFor,
  timestampPlace,
} from "@timetoalign/tilie-core";
import { Rational } from "@timetoalign/tilie-core/numbers";
import { fontMetrics } from "@timetoalign/timetoshare";
import FormatSwitch from "./FormatSwitch.svelte";
import type { Format } from "./formats.svelte.ts";
import { FORMAT_LABELS, FORMATS, isLoaded, loadCodec, writeText } from "./formats.svelte.ts";
import type { LineToggle, TimestampRow } from "./timestamp.ts";
import {
  addedTimestamp,
  addTimestamp,
  lineToggle,
  moveTimestamp,
  namedTimestampOf,
  removeTimestamp,
  renameTimestamp,
  showLine,
  timestampSections,
  timestampValue,
} from "./timestamp.ts";

interface Props {
  /** The open workspace's store, read as Svelte state. */
  live: LiveStore;
  /** The timestamp shown; `null` while none is. */
  pin: Pin | null;
  /** An edit of an unnamed timestamp moved its pin to `next`. */
  onpin: (next: Pin) => void;
  /** The unnamed timestamp shown was named: the named timestamp at `address` is to be shown. */
  onnamed: (address: Address) => void;
}

let { live, pin, onpin, onnamed }: Props = $props();

const uid = $props.id();

const HINT =
  "Turn on Show coordinates (C) and click a timeline to read a timestamp. With Show coordinates off, click a named timestamp to edit it.";
const LOCKED = "This conversion map cannot be solved for a position";
const EMPTY_NAME = "A named timestamp keeps a name; Delete removes it.";

type Shown = "pretty" | Format;
const SHOWN: readonly { readonly value: Shown; readonly label: string }[] = [
  { value: "pretty", label: "Pretty" },
  ...FORMATS.map((value) => ({ value, label: FORMAT_LABELS[value] })),
];

const view = $derived(live.view);
const address = $derived(
  pin === null || pin.named === null ? null : { block: pin.spec.block, id: pin.named },
);
const named = $derived(address === null ? null : namedTimestampOf(view, address));
const sections = $derived(pin === null ? [] : timestampSections(pin));
/** The line's box: an unnamed timestamp's line is shown and fixed; a named one's follows its display. */
const line: LineToggle = $derived(
  address === null ? { checked: true, blocked: null } : lineToggle(view, address, fontMetrics),
);

// --- Typed text -------------------------------------------------------------

type Texts = { readonly [key: string]: string };

/**
 * The texts typed into the name field (`name`) and the value fields (each
 * row's key) while they differ from what is shown, and the refusals, by
 * the same keys (`line` and `delete` for the header's controls): held for
 * the pin they were typed for, so that another pin shows none.
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

// --- The header -------------------------------------------------------------

/** Enter or leaving the name field: name an unnamed timestamp, rename a named one. */
function commitName(): void {
  const text = drafts.name;
  if (pin === null || text === undefined) return;
  if (pin.named === null) {
    if (text === "") {
      settled("name");
      return;
    }
    const before = live.store.view;
    const block = pin.spec.block;
    if (!send("name", addTimestamp(pin, text))) return;
    const id = addedTimestamp(before, live.store.view, block);
    if (id !== null) onnamed({ block, id });
    return;
  }
  if (text === "") {
    typed = {
      owner: pin,
      drafts: without(drafts, "name"),
      problems: { ...problems, name: EMPTY_NAME },
    };
    return;
  }
  if (text === named?.name) settled("name");
  else send("name", renameTimestamp(pin, text));
}

function onNameKey(event: KeyboardEvent): void {
  if (event.key === "Enter") {
    event.preventDefault();
    commitName();
  } else if (event.key === "Escape") settled("name");
}

function toggleLine(event: Event & { currentTarget: HTMLInputElement }): void {
  const box = event.currentTarget;
  if (pin === null || pin.named === null || line.blocked !== null) return;
  if (!send("line", showLine(pin, box.checked))) box.checked = !box.checked;
}

function remove(): void {
  if (pin !== null && pin.named !== null) send("delete", removeTimestamp(pin));
}

// --- The values -------------------------------------------------------------

/** Enter or leaving a value field: the position that gives the typed value, as the pin or as a `set`. */
function commitValue(row: TimestampRow): void {
  const text = drafts[row.key];
  if (pin === null || text === undefined || row.edit === null || row.numberType === null) return;
  const value = parseAxisValue(text, row.numberType);
  const position = value instanceof Rational ? positionFor(pin, row.edit, value) : value;
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
  const [was] = pin.timestamp.parts;
  const [now] = moved.timestamp.parts;
  const same =
    was !== undefined &&
    now !== undefined &&
    copyValue(was.position, was.numberType) === copyValue(now.position, now.numberType);
  if (same) settled(row.key);
  else send(row.key, moveTimestamp(moved));
}

function onValueKey(event: KeyboardEvent, row: TimestampRow): void {
  if (event.key === "Enter") {
    event.preventDefault();
    commitValue(row);
  } else if (event.key === "Escape") settled(row.key);
}

// --- The text formats -------------------------------------------------------

let shown: Shown = $state("pretty");
/** Why the chosen format's codec could not be loaded; `null` while nothing failed. */
let loadFailure: string | null = $state(null);

function choose(next: Shown): void {
  shown = next;
  loadFailure = null;
  if (next === "pretty" || isLoaded(next)) return;
  loadCodec(next).catch((error: unknown) => {
    if (shown === next) loadFailure = `Loading ${FORMAT_LABELS[next]} failed: ${String(error)}`;
  });
}

/** The timestamp as text in the chosen format, or why it cannot be written; `null` while its codec loads. */
const text = $derived.by(() => {
  if (pin === null || shown === "pretty" || !isLoaded(shown)) return null;
  const written = writeText(shown, timestampValue(pin, named));
  return written.ok
    ? { ok: true as const, text: written.value.text }
    : { ok: false as const, message: written.problems.map((item) => item.message).join(" ") };
});

// --- Copying ----------------------------------------------------------------

/** What the last Copy did. */
let status = $state("");

async function copy(copied: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(copied);
    status = `Copied ${what}.`;
  } catch {
    status = `Copying ${what} failed; select its text to copy it.`;
  }
}

// --- The settings -----------------------------------------------------------

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
  <div class="main">
    {#if pin === null}
      <p class="hint" data-testid="timestamp-hint">{HINT}</p>
    {:else}
      <div class="header">
        <label class="name">
          Name
          <input
            type="text"
            size="12"
            value={drafts.name ?? named?.name ?? ""}
            aria-invalid={problems.name !== undefined}
            aria-describedby="{uid}-name-problem"
            oninput={(event) => draft("name", event.currentTarget.value)}
            onkeydown={onNameKey}
            onblur={commitName}
          />
        </label>
        <label class="line">
          <input
            type="checkbox"
            checked={line.checked}
            disabled={pin.named === null || line.blocked !== null}
            aria-describedby={line.blocked === null ? undefined : `${uid}-line-blocked`}
            onchange={toggleLine}
          />
          Show cross-section line
        </label>
        {#if pin.named !== null}
          <button type="button" class="delete" onclick={remove}>Delete</button>
        {/if}
      </div>
      {#if line.blocked !== null}
        <p class="hint" id="{uid}-line-blocked" data-testid="line-blocked">{line.blocked}</p>
      {/if}
      <p class="problem" id="{uid}-name-problem" role="status">
        {problems.name ?? problems.line ?? problems.delete ?? ""}
      </p>
      <p class="where" data-testid="timestamp-where">{timestampPlace(pin.timestamp)}</p>

      <FormatSwitch options={SHOWN} bind:value={() => shown, choose} label="Timestamp format" />

      {#if shown === "pretty"}
        <span class="visually-hidden" id="{uid}-locked">{LOCKED}</span>
        <table>
          <thead>
            <tr>
              <th scope="col"><span class="visually-hidden">Label</span></th>
              <th scope="col"><span class="visually-hidden">Value</span></th>
              <th scope="col" class="copy">value</th>
              <th scope="col" class="copy">value + unit</th>
            </tr>
          </thead>
          {#each sections as section, index (index)}
            <tbody>
              <tr>
                <th colspan="4" scope="colgroup">{section.heading}</th>
              </tr>
              {#each section.rows as row (row.key)}
                <tr data-row={row.key}>
                  <th scope="row">{row.label}</th>
                  <!-- A disabled field shows no hover hint in every browser: its cell carries it. -->
                  <td class="value" title={row.locked ? LOCKED : undefined}>
                    {#if row.numberType === null}
                      <span class="text">{row.shown}</span>
                    {:else}
                      <input
                        type="text"
                        size="10"
                        value={drafts[row.key] ?? row.shown}
                        disabled={row.edit === null}
                        aria-label="{row.label} of {section.name}"
                        aria-invalid={problems[row.key] !== undefined}
                        aria-describedby={row.locked
                          ? `${uid}-${row.key}-problem ${uid}-locked`
                          : `${uid}-${row.key}-problem`}
                        oninput={(event) => draft(row.key, event.currentTarget.value)}
                        onkeydown={(event) => onValueKey(event, row)}
                        onblur={() => commitValue(row)}
                      />
                      {#if row.unit !== null}<span class="unit">{row.unit}</span>{/if}
                    {/if}
                    <span class="problem" id="{uid}-{row.key}-problem" role="status"
                      >{problems[row.key] ?? ""}</span
                    >
                  </td>
                  <td class="copy">
                    {#if row.copied !== null}
                      {@const copied = row.copied}
                      <button
                        type="button"
                        class="icon"
                        aria-label="Copy the value"
                        title="Copy the value"
                        onclick={() => copy(copied, copied)}>{@render copyIcon()}</button
                      >
                    {/if}
                  </td>
                  <td class="copy">
                    {#if row.copiedWithUnit !== null}
                      {@const copied = row.copiedWithUnit}
                      <button
                        type="button"
                        class="icon"
                        aria-label="Copy the value with its unit"
                        title="Copy the value with its unit"
                        onclick={() => copy(copied, copied)}>{@render copyIcon()}</button
                      >
                    {/if}
                  </td>
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
    <p class="status" role="status">{status}</p>
  </div>

  <div class="settings" role="group" aria-label="Granularity">
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
</div>

<style>
  p {
    margin: 0;
  }

  .pane {
    display: flex;
    flex: 1 0 auto;
    flex-direction: column;
    gap: 0.5rem;
  }

  .main {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .hint,
  .where {
    color: #595959;
  }

  .header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.75rem;
  }

  .header input[type="text"],
  .value input,
  .setting input {
    font: inherit;
    font-variant-numeric: tabular-nums;
  }

  .name input {
    margin-left: 0.35rem;
  }

  .delete {
    margin-left: auto;
  }

  .problem {
    color: #b00020;
  }

  .problem:empty {
    display: none;
  }

  .value .problem {
    display: block;
    font-size: 0.75rem;
  }

  .value .problem:empty {
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
    color: #595959;
    font-size: 0.75rem;
    letter-spacing: 0.05em;
    text-align: left;
    text-transform: uppercase;
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
    width: 8em;
    text-align: right;
  }

  .value input:disabled {
    border-color: #e0e0e0;
    background: #f4f4f4;
    color: #8a8a8a;
  }

  .unit {
    margin-left: 0.25rem;
    color: #595959;
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

  button:hover {
    border-color: #0a84ff;
  }

  button:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
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

  .status:empty {
    display: none;
  }

  /* The settings: one discreet line at the pane's bottom. */
  .settings {
    position: sticky;
    bottom: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 0.75rem;
    margin-top: auto;
    padding: 0.3rem 0;
    border-top: 1px solid #e4e4e4;
    background: #fff;
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
