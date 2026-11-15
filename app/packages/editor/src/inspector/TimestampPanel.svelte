<script lang="ts">
/**
 * The Timestamp tab: the workspace's granularity, one setting per number
 * type, the grid of the canvas's last reading, and the timestamp pinned by
 * a click on a timeline, with Copy for each value and for the whole as
 * coordinate dicts. A setting is changed through the store's `configure`:
 * saved with the workspace, never journalled and never undone. Every value
 * and text shown is core's; the panel only lays them out and copies them.
 */
import type { LiveStore } from "@timetoalign/tilie-arranger";
import type { Granularity, GridInUse } from "@timetoalign/tilie-core";
import { gridText } from "@timetoalign/tilie-core";
import type { Pinning } from "./tabs.ts";
import { timestampHeading, timestampJson, timestampSections } from "./timestamp.ts";

interface Props {
  /** The open workspace's store, read as Svelte state. */
  live: LiveStore;
  /** The pinned timestamp with the granularity it was read under; `null` while none is pinned. */
  pinned: Pinning | null;
  /** The grid of the canvas's last reading; `null` before the first. */
  grid: GridInUse | null;
}

let { live, pinned, grid }: Props = $props();

const timestamp = $derived(pinned?.timestamp ?? null);

const uid = $props.id();

type Kind = "fraction" | "float" | "int";

/** One granularity setting: its legend, the words before its field, and how the step refines. */
interface Field {
  readonly kind: Kind;
  readonly legend: string;
  readonly before: string;
  readonly inputmode: "numeric" | "decimal";
  readonly hint: string;
}

const FIELDS: readonly Field[] = [
  {
    kind: "fraction",
    legend: "Fractions",
    before: "Step 1 /",
    inputmode: "numeric",
    hint: "Refining halves the step: 1/(D·2^k). A denominator of 5 reaches quintuplets.",
  },
  {
    kind: "float",
    legend: "Floats",
    before: "Step",
    inputmode: "decimal",
    hint: "Refining divides the step by 2, 5, 10, 20, 50, …",
  },
  {
    kind: "int",
    legend: "Integers",
    before: "Step",
    inputmode: "numeric",
    hint: "Never finer than the step; refining coarsens it to 2, 5, 10, … steps when zoomed out.",
  },
];

const granularity = $derived(live.view.settings.granularity);

/** The stated step of `kind`, as its field shows it, and whether it refines. */
function stated(kind: Kind): { text: string; refine: boolean } {
  if (kind === "fraction") {
    return { text: String(granularity.fraction.denominator), refine: granularity.fraction.refine };
  }
  if (kind === "float") return { text: granularity.float.step, refine: granularity.float.refine };
  return { text: String(granularity.int.step), refine: granularity.int.refine };
}

/** The setting of `kind` with the step `text` and `refine`; a field that is no integer gives NaN, which the store refuses. */
function changeOf(kind: Kind, text: string, refine: boolean): Partial<Granularity> {
  const integer = /^\s*\d+\s*$/.test(text) ? Number(text) : Number.NaN;
  if (kind === "fraction") return { fraction: { denominator: integer, refine } };
  if (kind === "float") return { float: { step: text.trim(), refine } };
  return { int: { step: integer, refine } };
}

/** The text typed into a field while it differs from what is stated, and the store's refusal of it. */
const drafts: { [kind in Kind]?: string } = $state({});
const problems: { [kind in Kind]?: string } = $state({});

function configure(kind: Kind, text: string, refine: boolean): void {
  const refusal = live.store.configure({ granularity: changeOf(kind, text, refine) });
  if (refusal === null) delete problems[kind];
  else problems[kind] = refusal.message;
}

function typed(kind: Kind, text: string): void {
  drafts[kind] = text;
  configure(kind, text, stated(kind).refine);
}

/** Leaving a field shows what is stated again. */
function left(kind: Kind): void {
  delete drafts[kind];
  delete problems[kind];
}

function refined(kind: Kind, refine: boolean): void {
  configure(kind, stated(kind).text, refine);
}

const sections = $derived(timestamp === null ? [] : timestampSections(timestamp));
const json = $derived(timestamp === null ? "" : timestampJson(timestamp));

/** What the last Copy did. */
let status = $state("");

async function copy(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    status = `Copied ${what}.`;
  } catch {
    status = `Copying ${what} failed; select its text to copy it.`;
  }
}
</script>

<section class="granularity" aria-labelledby="{uid}-granularity">
  <h3 id="{uid}-granularity">Granularity</h3>
  <p class="hint">Saved with the workspace; never in the journal.</p>
  {#each FIELDS as field (field.kind)}
    <fieldset>
      <legend>{field.legend}</legend>
      <div class="row">
        <label>
          {field.before}
          <input
            type="text"
            inputmode={field.inputmode}
            size="6"
            value={drafts[field.kind] ?? stated(field.kind).text}
            aria-invalid={problems[field.kind] !== undefined}
            aria-describedby="{uid}-{field.kind}-hint {uid}-{field.kind}-problem"
            oninput={(event) => typed(field.kind, event.currentTarget.value)}
            onchange={() => left(field.kind)}
          />
        </label>
        <label class="refine">
          <input
            type="checkbox"
            checked={stated(field.kind).refine}
            onchange={(event) => refined(field.kind, event.currentTarget.checked)}
          />
          Refine when zooming
        </label>
      </div>
      <p class="hint" id="{uid}-{field.kind}-hint">{field.hint}</p>
      <p class="problem" id="{uid}-{field.kind}-problem" role="status">{problems[field.kind] ?? ""}</p>
    </fieldset>
  {/each}
  <p class="in-use" data-testid="grid-in-use">
    {grid === null
      ? "No reading yet: turn on Show coordinates and point at a timeline."
      : `In use: ${gridText(grid)}`}
  </p>
</section>

<section class="timestamp" aria-labelledby="{uid}-timestamp">
  <h3 id="{uid}-timestamp">Timestamp</h3>
  {#if pinned === null || timestamp === null}
    <p class="empty">Click a coordinate on a timeline to pin it here.</p>
  {:else}
    <p class="where" data-testid="timestamp-where">
      {timestampHeading(timestamp, pinned.granularity)}
    </p>
    <table>
      {#each sections as section, index (index)}
        <tbody>
          <tr>
            <th colspan="3" scope="colgroup">{section.heading}</th>
          </tr>
          {#each section.rows as row, at (at)}
            <tr>
              <th scope="row">{row.label}</th>
              <td class="value">{row.shown}</td>
              <td class="copy">
                {#if row.copied !== null}
                  {@const copied = row.copied}
                  <button
                    type="button"
                    aria-label="Copy {row.label} of {section.name}"
                    onclick={() => copy(copied, `${row.label} of ${section.name}`)}>Copy</button
                  >
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      {/each}
    </table>
    <div class="json">
      <span class="hint">As coordinate dicts</span>
      <button type="button" onclick={() => copy(json, "the JSON")}>Copy JSON</button>
    </div>
    <pre aria-label="The timestamp as coordinate dicts">{json}</pre>
    <p class="hint">
      Floats show 3 decimal places; Copy and the JSON carry the full value. A click outside this tab
      clears the pin.
    </p>
  {/if}
  <p class="status" role="status">{status}</p>
</section>

<style>
  h3 {
    margin: 0;
    font-size: 0.9rem;
  }

  p {
    margin: 0;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .hint,
  .empty {
    color: #595959;
  }

  .empty {
    font-style: italic;
  }

  fieldset {
    margin: 0;
    padding: 0.25rem 0.5rem 0.4rem;
    border: 1px solid #d0d0d0;
    border-radius: 4px;
  }

  legend {
    color: #595959;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 1rem;
  }

  .row input[type="text"] {
    width: 5.5em;
    font: inherit;
    font-variant-numeric: tabular-nums;
  }

  .refine {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }

  .problem {
    color: #b00020;
  }

  .problem:empty {
    display: none;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
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
    padding: 0.2rem 0;
    border-top: 1px solid #e4e4e4;
  }

  .value {
    padding-left: 0.75rem;
    text-align: right;
    user-select: all;
  }

  .copy {
    width: 1%;
    padding-left: 0.5rem;
    text-align: right;
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

  button:hover {
    border-color: #0a84ff;
  }

  button:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }

  .json {
    display: flex;
    align-items: center;
    justify-content: space-between;
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
</style>
