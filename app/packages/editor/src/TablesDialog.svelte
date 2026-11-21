<script lang="ts">
/**
 * A native modal dialog asking for the file of the MatchClaim table a
 * manifest names: a file the user chooses on their system or a URL they
 * enter (a relative URL is read relative to the page). Where the browser
 * hands over folders and the manifest names where its table lies, the user
 * may instead choose the manifest's folder, which answers at once. `ask`
 * resolves what they chose (Load, once a file or a URL is given; or the
 * folder), or `null` when the dialog is dismissed (Cancel, Escape). It is
 * the editor's one dialog shell (`ModalDialog`) holding a form.
 */
import type { Attachment } from "svelte/attachments";
import { canChooseFolders, chooseFolder, MATCH_CLAIM_TABLE, openFiles } from "./files.ts";
import ModalDialog from "./ModalDialog.svelte";
import type { TableChoice, TableRequest } from "./matchClaims.svelte.ts";
import { messageOf } from "./messages.svelte.ts";

const id = $props.id();
let shell: ReturnType<typeof ModalDialog> | undefined = $state();
/** The first button, held by an attachment; not state. */
let first: HTMLButtonElement | undefined;

const heldFirst: Attachment<HTMLButtonElement> = (element) => {
  first = element;
  return () => {
    first = undefined;
  };
};

let manifest = $state("");
/** Where the manifest names its table; `null` where it names none. */
let named: string | null = $state(null);
/** The file chosen; `null` while none is. */
let file: File | null = $state(null);
/** The URL entered. */
let url = $state("");
/** Why the picker failed; empty while it has not. */
let problem = $state("");
/** What answered the question shown: the table's choice, or the folder. */
let answer: TableChoice | null = null;

/** The choice the form holds: the file where one is chosen, else the URL where one is entered. */
const choice: TableChoice | null = $derived.by(() => {
  if (file !== null) return { file };
  const entered = url.trim();
  return entered === "" ? null : { url: entered };
});

/** Whether the folder may be chosen: the browser hands folders over, and the table's place is named. */
const folders = $derived(named !== null && canChooseFolders());

/** Ask for the file of `request`'s table; a question asked while another is open dismisses that one. */
export async function ask(request: TableRequest): Promise<TableChoice | null> {
  manifest = request.manifest;
  named = request.table.url;
  file = null;
  url = "";
  problem = "";
  answer = null;
  const answered = await shell?.show(null, () => first);
  return answered ? answer : null;
}

/** Close the dialog answered with `value`. */
function finish(value: TableChoice): void {
  answer = value;
  shell?.accept();
}

/** Let the user pick the table's file; a chosen file replaces the URL entered. */
async function choose(): Promise<void> {
  try {
    const [picked] = await openFiles(MATCH_CLAIM_TABLE);
    if (picked === undefined) return;
    file = picked.file;
    url = "";
    problem = "";
  } catch (error) {
    problem = `The file could not be chosen: ${messageOf(error)}`;
  }
}

/** Let the user choose the manifest's folder, which answers the question. */
async function chooseManifestFolder(): Promise<void> {
  try {
    const folder = await chooseFolder();
    if (folder !== null) finish({ folder });
  } catch (error) {
    problem = `The folder could not be chosen: ${messageOf(error)}`;
  }
}

function onsubmit(event: SubmitEvent): void {
  event.preventDefault();
  if (choice !== null) finish(choice);
}
</script>

<ModalDialog bind:this={shell} labelledby="{id}-title" wide>
  <form {onsubmit}>
    <h2 id="{id}-title">Load the tables of {manifest}</h2>
    <p class="hint">
      Choose the MatchClaim table's file on your system, or enter its URL; a relative URL is read
      relative to this page.
    </p>
    {#if folders}
      <div class="line folder">
        <button type="button" onclick={chooseManifestFolder}>Choose the manifest's folder…</button>
        <span class="chosen">The table is read from it, now and when matches are shown again.</span>
      </div>
    {/if}
    <fieldset>
      <legend>MatchClaim table {#if named !== null}<code>{named}</code>{/if}</legend>
      <div class="line">
        <button type="button" {@attach heldFirst} onclick={choose}>Choose file…</button>
        <span class="chosen" data-testid="tables-chosen"
          >{file === null ? "No file chosen" : file.name}</span
        >
      </div>
      <label class="line">
        <span>URL</span>
        <input
          type="text"
          inputmode="url"
          autocomplete="url"
          bind:value={() => url, (value) => {
            url = value;
            if (value !== "") file = null;
          }}
          aria-label="URL of the MatchClaim table"
        />
      </label>
    </fieldset>
    {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
    <div class="answers">
      <button type="submit" disabled={choice === null}>Load</button>
      <button type="button" onclick={() => shell?.dismiss()}>Cancel</button>
    </div>
  </form>
</ModalDialog>

<style>
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
</style>
