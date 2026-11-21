<script lang="ts">
/**
 * A native modal dialog asking for the files of the tables a manifest
 * names (its MatchClaim table, its Projections table): for each, a file the
 * user chooses on their system or a URL they enter (a relative URL is read
 * relative to the page). Where the browser hands over folders and the
 * manifest names where its tables lie, the user may instead choose the
 * manifest's folder, which answers at once. `ask` resolves what they chose
 * (Load, once one table has a file or a URL; a table left without either
 * is absent; or the folder), or `null` when the dialog is dismissed
 * (Cancel, Escape).
 */
import { flushSync } from "svelte";
import type { Attachment } from "svelte/attachments";
import { canChooseFolders, chooseFolder, MATCH_CLAIM_TABLE, openFiles } from "./files.ts";
import type { NamedTable, TableChoice, TableRequest } from "./matchClaims.svelte.ts";
import { tableWords } from "./matchClaims.svelte.ts";
import { messageOf } from "./messages.svelte.ts";

/** One table of the question: what it is, the file chosen for it, the URL entered. */
interface Row {
  readonly table: NamedTable;
  file: File | null;
  url: string;
}

const id = $props.id();
/** The dialog and the first button, held by attachments; not state. */
let dialog: HTMLDialogElement | undefined;
let first: HTMLButtonElement | undefined;

const heldDialog: Attachment<HTMLDialogElement> = (element) => {
  dialog = element;
  return () => {
    dialog = undefined;
  };
};
const heldFirst: Attachment<HTMLButtonElement> = (element) => {
  first = element;
  return () => {
    first = undefined;
  };
};

let manifest = $state("");
let rows: Row[] = $state([]);
/** Why the picker failed; empty while it has not. */
let problem = $state("");
let answer: ((value: readonly TableChoice[] | null) => void) | undefined;

/** The choices the rows hold: a file where one is chosen, else a URL where one is entered. */
const choices: readonly TableChoice[] = $derived(
  rows.flatMap((row): TableChoice[] => {
    if (row.file !== null) return [{ type: row.table.type, file: row.file }];
    const url = row.url.trim();
    return url === "" ? [] : [{ type: row.table.type, url }];
  }),
);

/** Whether the folder may be chosen: the browser hands folders over, and a table's place is named. */
const folders = $derived(rows.some(({ table }) => table.url !== null) && canChooseFolders());

/** Ask for the files of `request`'s tables; a question asked while another is open dismisses that one. */
export function ask(request: TableRequest): Promise<readonly TableChoice[] | null> {
  answer?.(null);
  manifest = request.manifest;
  rows = request.tables.map((table) => ({ table, file: null, url: "" }));
  problem = "";
  return new Promise((resolve) => {
    answer = resolve;
    flushSync();
    dialog?.showModal();
    first?.focus();
  });
}

function finish(value: readonly TableChoice[] | null): void {
  const resolve = answer;
  answer = undefined;
  if (dialog?.open) dialog.close();
  resolve?.(value);
}

/** Let the user pick the file of `row`'s table; a chosen file replaces the URL entered. */
async function choose(row: Row): Promise<void> {
  try {
    const [picked] = await openFiles(MATCH_CLAIM_TABLE);
    if (picked === undefined) return;
    row.file = picked.file;
    row.url = "";
    problem = "";
  } catch (error) {
    problem = `The file could not be chosen: ${messageOf(error)}`;
  }
}

/** Let the user choose the manifest's folder, which answers the question. */
async function chooseManifestFolder(): Promise<void> {
  try {
    const folder = await chooseFolder();
    if (folder !== null) finish([{ folder }]);
  } catch (error) {
    problem = `The folder could not be chosen: ${messageOf(error)}`;
  }
}

function onsubmit(event: SubmitEvent): void {
  event.preventDefault();
  if (choices.length > 0) finish(choices);
}
</script>

<dialog {@attach heldDialog} aria-labelledby="{id}-title" onclose={() => finish(null)}>
  <form {onsubmit}>
    <h2 id="{id}-title">Load the tables of {manifest}</h2>
    <p class="hint">
      Choose each table's file on your system, or enter its URL; a relative URL is read relative to
      this page.
    </p>
    {#if folders}
      <div class="line folder">
        <button type="button" onclick={chooseManifestFolder}>Choose the manifest's folder…</button>
        <span class="chosen">The tables are read from it, now and when matches are shown again.</span>
      </div>
    {/if}
    {#each rows as row, index (row.table.type)}
      <fieldset>
        <legend>
          {#if row.table.url === null}{tableWords(row.table.type)}{:else}{tableWords(row.table.type)}
            <code>{row.table.url}</code>{/if}
        </legend>
        <div class="line">
          <button
            type="button"
            {@attach index === 0 && heldFirst}
            onclick={() => choose(row)}>Choose file…</button
          >
          <span class="chosen" data-testid="tables-chosen-{row.table.type}"
            >{row.file === null ? "No file chosen" : row.file.name}</span
          >
        </div>
        <label class="line">
          <span>URL</span>
          <input
            type="text"
            inputmode="url"
            autocomplete="url"
            bind:value={() => row.url, (value) => {
              row.url = value;
              if (value !== "") row.file = null;
            }}
            aria-label="URL of the {tableWords(row.table.type)}"
          />
        </label>
      </fieldset>
    {/each}
    {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
    <div class="answers">
      <button type="submit" disabled={choices.length === 0}>Load</button>
      <button type="button" onclick={() => finish(null)}>Cancel</button>
    </div>
  </form>
</dialog>

<style>
  dialog {
    width: min(30rem, 90vw);
    padding: 1rem 1.25rem;
    border: 1px solid #bdbdbd;
    border-radius: 6px;
    font-size: 0.9rem;
  }

  dialog::backdrop {
    background: rgba(0, 0, 0, 0.25);
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
  }

  .hint {
    margin: 0 0 0.75rem;
    color: #595959;
  }

  fieldset {
    margin: 0 0 0.75rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid #d4d4d4;
    border-radius: 4px;
  }

  legend {
    padding: 0 0.25rem;
  }

  code {
    font-size: 0.85em;
  }

  .line {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.25rem 0;
  }

  .folder {
    margin: 0 0 0.75rem;
  }

  .folder .chosen {
    white-space: normal;
  }

  .chosen {
    color: #595959;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  input {
    flex: 1;
    min-width: 0;
    font: inherit;
  }

  .problem {
    margin: 0 0 0.75rem;
    color: #b00020;
  }

  .answers {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  button {
    padding: 0.3rem 0.8rem;
    border: 1px solid #bdbdbd;
    border-radius: 4px;
    background: #fafafa;
    font: inherit;
    color: inherit;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    background: #f0f0f0;
  }

  button:disabled {
    color: #6b6b6b;
    cursor: default;
  }

  button:focus-visible,
  input:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }
</style>
