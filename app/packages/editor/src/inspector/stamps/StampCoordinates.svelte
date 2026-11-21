<script lang="ts">
/**
 * The Coordinates area of both stamp tabs, a bordered panel: a hint while
 * no stamp is shown, else the format switch and the stamp's values, in
 * Editor one group per timeline (a timestamp's crossed timelines, a
 * MatchStamp's timestamps), each value an exact text field beside its
 * pretty unit with three Copy columns (the value, the raw text with its
 * unit written out, the pretty text), else its text in JSON, YAML or TOML
 * with one Copy. With `edit` a value field commits on Enter or leaving it;
 * without, every field is disabled and greyed. A copy is confirmed in the
 * message bar; a refusal shows at its field.
 */
import { informOf } from "../../messages.svelte.ts";
import FormatSwitch from "../FormatSwitch.svelte";
import type { Format, Text } from "../formats.svelte.ts";
import { FORMAT_LABELS, FORMATS, isLoaded, loadCodec } from "../formats.svelte.ts";
import type { Result } from "../problems.ts";
import type { Copies, TimelineRows, ValueRow } from "../timestamp.ts";
import type { StampDrafts } from "./drafts.svelte.ts";

/** How the values are edited: the drafts typed into them, and the commit of one row's. */
export interface CoordinateEdit {
  readonly drafts: StampDrafts<unknown>;
  readonly commit: (row: ValueRow) => void;
}

interface Props {
  /** Which tab's Coordinates: their hint's test ID is `<kind>-hint`, their words the tab's. */
  kind: "timestamp" | "matchstamp";
  /** The groups of the stamp shown; `null` while none is, the hint shown instead. */
  groups: readonly TimelineRows[] | null;
  /** What to do to show a stamp. */
  hint: string;
  /** The stamp as text in `format` (its codec loaded); `null` while none is shown. */
  textOf: (format: Format) => Result<Text> | null;
  /** How the values are edited; without it they are shown disabled. */
  edit?: CoordinateEdit | undefined;
}

let { kind, groups, hint, textOf, edit }: Props = $props();

const uid = $props.id();
const inform = informOf();

const READ_ONLY = "This value cannot be solved for a position, so it cannot be edited.";

/** The words of each tab: what its format switch is called, and its stamp in a text's label. */
const WORDS = {
  timestamp: { format: "Timestamp format", stamp: "The timestamp" },
  matchstamp: { format: "MatchStamp format", stamp: "The MatchStamp" },
} as const;
const words = $derived(WORDS[kind]);

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

/** What the area shows: the values, or the stamp's text in a format. */
type Shown = "editor" | Format;
const SHOWN: readonly { readonly value: Shown; readonly label: string }[] = [
  { value: "editor", label: "Editor" },
  ...FORMATS.map((value) => ({ value, label: FORMAT_LABELS[value] })),
];

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

/** The stamp as text in the chosen format, or why it cannot be written; `null` while its codec loads. */
const text = $derived.by(() => {
  if (shown === "editor" || !isLoaded(shown)) return null;
  const written = textOf(shown);
  if (written === null) return null;
  return written.ok
    ? { ok: true as const, text: written.value.text }
    : { ok: false as const, message: written.problems.map((item) => item.message).join(" ") };
});

const drafts = $derived(edit?.drafts.drafts ?? {});
const problems = $derived(edit?.drafts.problems ?? {});

/** Enter commits a field, Escape shows what is stored again. */
function onFieldKey(event: KeyboardEvent, row: ValueRow): void {
  if (edit === undefined) return;
  if (event.key === "Enter") {
    event.preventDefault();
    edit.commit(row);
  } else if (event.key === "Escape") edit.drafts.settled(row.key);
}

/** Copy `copied`, confirming with `what` in the message bar. */
async function copy(copied: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(copied);
    inform(`Copied ${what}.`);
  } catch {
    inform(`Copying ${what} failed; select its text to copy it.`);
  }
}
</script>

{#snippet copyIcon()}
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
    <rect x="5.5" y="5.5" width="8" height="9" rx="1" />
    <path d="M3.5 10.5h-1v-8a1 1 0 0 1 1-1h7v1" />
  </svg>
{/snippet}

<section class="area coordinates" aria-labelledby="{uid}-coordinates">
  <h3 id="{uid}-coordinates">Coordinates</h3>
  {#if groups === null}
    <p class="hint" data-testid="{kind}-hint">{hint}</p>
  {:else}
    <FormatSwitch options={SHOWN} bind:value={() => shown, choose} label={words.format} />

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
        {#each groups as group, g (group.key)}
          <tbody data-timeline={group.timeline}>
            <tr>
              <th colspan={2 + COPY_COLUMNS.length} scope="colgroup">{group.name}</th>
            </tr>
            {#each group.rows as row, r (row.key)}
              {@const locked = edit !== undefined && row.numberType !== null && !row.editable}
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
                      disabled={edit === undefined}
                      title={locked ? READ_ONLY : undefined}
                      aria-label={named}
                      aria-invalid={problems[row.key] !== undefined}
                      aria-describedby={locked ? `${problem} ${uid}-read-only` : problem}
                      oninput={(event) => edit?.drafts.draft(row.key, event.currentTarget.value)}
                      onkeydown={(event) => onFieldKey(event, row)}
                      onblur={() => edit?.commit(row)}
                    />
                    {#if row.unit !== null}<span class="unit">{row.unit}</span>{/if}
                  {/if}
                  <span class="problem" id={problem} role="status">{problems[row.key] ?? ""}</span>
                </td>
                {#each COPY_COLUMNS as column (column.copies)}
                  {@const copied = row.copies?.[column.copies] ?? null}
                  <td class="copy">
                    {#if copied !== null}
                      <button
                        type="button"
                        class="action icon"
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
          <button type="button" class="action" onclick={() => copy(written, `the ${label}`)}
            >Copy</button
          >
        </div>
        <pre aria-label="{words.stamp} as {label}">{written}</pre>
      {/if}
    {/if}
  {/if}
</section>

<style>
  /* The values: a bordered panel of their own. */
  .coordinates {
    padding: 0.5rem 0.6rem 0.6rem;
    border: 1px solid #c8c8c8;
    border-radius: 4px;
  }

  input[type="text"] {
    font: inherit;
    font-variant-numeric: tabular-nums;
  }

  .value .problem {
    display: block;
    font-size: 0.75rem;
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

  /* Read only or not editable here: shown, copied, never edited. */
  .value input[readonly],
  .value input:disabled {
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

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
