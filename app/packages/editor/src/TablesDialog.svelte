<script lang="ts">
/**
 * A native modal dialog asking, once, for what the MatchClaim table a
 * manifest names is read from, as the question says (`TableQuestion`):
 * without the server's files, the table's file chosen on the user's system;
 * with them, where the manifest lies or the table's file, either located in
 * the editor's file dialog (Locate…), which answers at once. A URL of the
 * table may be entered instead (a relative URL is read relative to the
 * page). `ask` resolves what they chose, or `null` when the dialog is
 * dismissed (Cancel, Escape). It is the editor's one dialog shell
 * (`ModalDialog`) holding a form.
 */
import type { Attachment } from "svelte/attachments";
import { MATCH_CLAIM_TABLE, openFiles } from "./files.ts";
import ModalDialog from "./ModalDialog.svelte";
import type { TableChoice, TableQuestion, TableRequest } from "./matchClaims.svelte.ts";
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
let question = $state.raw<TableQuestion>({ kind: "file" });
/** The file chosen; `null` while none is. */
let file: File | null = $state(null);
/** The URL entered. */
let url = $state("");
/** Why the picker or the file dialog failed; empty while it has not. */
let problem = $state("");
/** What answered the question shown. */
let answer: TableChoice | null = null;

/** The choice the form holds: the file where one is chosen, else the URL where one is entered. */
const choice: TableChoice | null = $derived.by(() => {
  if (file !== null) return { file };
  const entered = url.trim();
  return entered === "" ? null : { url: entered };
});

/** The dialog's title, which names what is asked for. */
const title = $derived.by(() => {
  if (question.kind === "manifest") return `Where is ${manifest}?`;
  if (question.kind === "table" && question.missing !== null && named !== null) {
    return `${named} is not beside ${manifest}, at ${question.missing}`;
  }
  return `Load the MatchClaim table of ${manifest}`;
});

/** What the hint says the dialog wants. */
const hint = $derived(
  question.kind === "manifest"
    ? "Locate the manifest's file: its MatchClaim table is read from beside it, now and whenever the workspace is opened again. Or enter the table's URL; a relative URL is read relative to this page."
    : question.kind === "table"
      ? "Locate the MatchClaim table's file, or enter its URL; a relative URL is read relative to this page."
      : "Choose the MatchClaim table's file on your system, or enter its URL; a relative URL is read relative to this page.",
);

/** Ask `request`'s question; a question asked while another is open dismisses that one. */
export async function ask(request: TableRequest): Promise<TableChoice | null> {
  manifest = request.manifest;
  named = request.table.url;
  question = request.question;
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

/** Let the user pick the table's file on their system; a chosen file replaces the URL entered. */
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

/** Let the user locate the file asked for in the file dialog, which answers the question. */
async function locate(): Promise<void> {
  if (question.kind === "file") return;
  try {
    const path = await question.locate();
    if (path !== null) finish({ path });
  } catch (error) {
    problem = `The file could not be located: ${messageOf(error)}`;
  }
}

function onsubmit(event: SubmitEvent): void {
  event.preventDefault();
  if (choice !== null) finish(choice);
}
</script>

<ModalDialog bind:this={shell} labelledby="{id}-title" wide>
  <form {onsubmit}>
    <h2 id="{id}-title">{title}</h2>
    <p class="hint">{hint}</p>
    {#if question.kind === "file"}
      <fieldset>
        <legend>MatchClaim table {#if named !== null}<code>{named}</code>{/if}</legend>
        <div class="line">
          <button type="button" {@attach heldFirst} onclick={choose}>Choose file…</button>
          <span class="chosen" data-testid="tables-chosen"
            >{file === null ? "No file chosen" : file.name}</span
          >
        </div>
        {@render urlField()}
      </fieldset>
    {:else}
      <div class="line">
        <button type="button" {@attach heldFirst} onclick={locate}>Locate…</button>
      </div>
      <fieldset>
        <legend>MatchClaim table {#if named !== null}<code>{named}</code>{/if}</legend>
        {@render urlField()}
      </fieldset>
    {/if}
    {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
    <div class="answers">
      <button type="submit" disabled={choice === null}>Load</button>
      <button type="button" onclick={() => shell?.dismiss()}>Cancel</button>
    </div>
  </form>
</ModalDialog>

{#snippet urlField()}
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
{/snippet}

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
