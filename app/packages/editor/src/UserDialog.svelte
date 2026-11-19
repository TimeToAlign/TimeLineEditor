<script lang="ts">
/**
 * A native modal dialog asking for the user's name and, optionally, their
 * ORCID iD. `ask` resolves the user saved (Save, or Enter in a field, once
 * a name is given and the iD, where given, is one), or `null` when the
 * dialog is dismissed (Cancel, Escape).
 */
import type { User } from "@timetoalign/tilie-core";
import { readOrcid } from "@timetoalign/tilie-core";
import { flushSync } from "svelte";
import type { Attachment } from "svelte/attachments";

const id = $props.id();
/** The dialog and its fields, held by attachments; not state. */
let dialog: HTMLDialogElement | undefined;
let nameField: HTMLInputElement | undefined;
let orcidField: HTMLInputElement | undefined;

const heldDialog: Attachment<HTMLDialogElement> = (element) => {
  dialog = element;
  return () => {
    dialog = undefined;
  };
};
const heldName: Attachment<HTMLInputElement> = (element) => {
  nameField = element;
  return () => {
    nameField = undefined;
  };
};
const heldOrcid: Attachment<HTMLInputElement> = (element) => {
  orcidField = element;
  return () => {
    orcidField = undefined;
  };
};
let name = $state("");
let orcid = $state("");
/** What Save found wrong with each field; `null` while it is fine. */
let nameProblem: string | null = $state(null);
let orcidProblem: string | null = $state(null);
let answer: ((value: User | null) => void) | undefined;

/** Ask for the user, the fields holding `current`; a question asked while another is open dismisses that one. */
export function ask(current: User): Promise<User | null> {
  answer?.(null);
  name = current.name;
  orcid = current.orcid ?? "";
  nameProblem = null;
  orcidProblem = null;
  return new Promise((resolve) => {
    answer = resolve;
    flushSync();
    dialog?.showModal();
    nameField?.focus();
  });
}

function finish(value: User | null): void {
  const resolve = answer;
  answer = undefined;
  if (dialog?.open) dialog.close();
  resolve?.(value);
}

function save(event: SubmitEvent): void {
  event.preventDefault();
  const given = name.trim();
  const iD = orcid.trim();
  const read = iD === "" ? null : readOrcid(iD);
  nameProblem = given === "" ? "A name is required." : null;
  orcidProblem =
    iD !== "" && read === null
      ? `'${iD}' is no ORCID iD: write it as 0000-0002-1825-0097 or https://orcid.org/0000-0002-1825-0097.`
      : null;
  if (nameProblem !== null) {
    nameField?.focus();
    return;
  }
  if (orcidProblem !== null) {
    orcidField?.focus();
    return;
  }
  finish({ name: given, orcid: read });
}
</script>

<dialog {@attach heldDialog} aria-labelledby="{id}-title" onclose={() => finish(null)}>
  <!-- The editor, not the browser, checks the fields: the form validates nothing itself. -->
  <form novalidate onsubmit={save}>
    <h2 id="{id}-title">Your name</h2>
    <p id="{id}-about">
      The journal names you as the author of each change, and each statement you make in the Metadata
      tab names you as who stated it: by your ORCID iD where you give one. Both are kept in this
      browser.
    </p>
    <label for="{id}-name">Name</label>
    <input
      id="{id}-name"
      type="text"
      autocomplete="name"
      {@attach heldName}
      bind:value={name}
      aria-describedby={nameProblem === null ? `${id}-about` : `${id}-about ${id}-name-problem`}
      aria-invalid={nameProblem !== null}
      oninput={() => (nameProblem = null)}
    />
    {#if nameProblem !== null}
      <p id="{id}-name-problem" class="invalid" role="alert">{nameProblem}</p>
    {/if}
    <label for="{id}-orcid">ORCID iD (optional)</label>
    <input
      id="{id}-orcid"
      type="text"
      {@attach heldOrcid}
      bind:value={orcid}
      aria-describedby={orcidProblem === null ? undefined : `${id}-orcid-problem`}
      aria-invalid={orcidProblem !== null}
      oninput={() => (orcidProblem = null)}
    />
    {#if orcidProblem !== null}
      <p id="{id}-orcid-problem" class="invalid" role="alert">{orcidProblem}</p>
    {/if}
    <div class="answers">
      <button type="submit">Save</button>
      <button type="button" onclick={() => finish(null)}>Cancel</button>
    </div>
  </form>
</dialog>

<style>
  dialog {
    max-width: 30rem;
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

  p {
    margin: 0 0 0.75rem;
  }

  label {
    display: block;
    margin: 0.5rem 0 0.25rem;
    font-weight: 600;
  }

  input {
    box-sizing: border-box;
    width: 100%;
    padding: 0.3rem 0.4rem;
    border: 1px solid #b0b0b0;
    border-radius: 3px;
    font: inherit;
  }

  .invalid {
    margin: 0.4rem 0 0;
    color: #b00020;
  }

  .answers {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
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

  button:hover {
    background: #f0f0f0;
  }

  button:focus-visible,
  input:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }
</style>
