<script lang="ts">
/**
 * The editing bar, shown while an editor is open: Done and Cancel for the
 * innermost editor, and the editing path, the open editors' names in
 * opening order. Cancel asks first when the editor holds a change.
 */
import type { LiveStore } from "@timetoalign/tilie-arranger";
import { tick } from "svelte";
import { editorName } from "./journal.ts";

/** The open workspace's store, read as Svelte state. */
let { live }: { live: LiveStore } = $props();

const uid = $props.id();

/** The editing path, the view its names are read from, and Cancel's count. */
const editing = $derived(live.editing);
const view = $derived(live.view);
const changes = $derived(live.changes);
const question = $derived(
  `Are you sure you want to discard ${changes} ${changes === 1 ? "change" : "changes"}?`,
);

let cancelButton: HTMLButtonElement | undefined = $state();
let dialog: HTMLDialogElement | undefined = $state();
let noButton: HTMLButtonElement | undefined = $state();
/** Where the question opens: just below the Cancel button, in viewport pixels. */
let top = $state(0);
let left = $state(0);

/** Close the innermost editor without its changes; with a change, only after asking. */
async function cancel(): Promise<void> {
  if (changes === 0) {
    live.store.cancel();
    return;
  }
  const button = cancelButton?.getBoundingClientRect();
  top = (button?.bottom ?? 0) + 4;
  left = button?.left ?? 0;
  await tick();
  dialog?.showModal();
  noButton?.focus();
}

/** Answer the question: Yes discards the changes; No, Escape and the backdrop keep them. */
function answer(discard: boolean): void {
  dialog?.close();
  if (discard) live.store.cancel();
}

/** A click on the dialog element itself fell on the backdrop: its content fills the dialog. */
function onBackdrop(event: MouseEvent): void {
  if (event.target === dialog) answer(false);
}
</script>

{#if editing.length > 0}
  <div class="editing" role="group" aria-label="Editing">
    <button type="button" class="done" onclick={() => live.store.done()}>Done</button>
    <button type="button" class="cancel" bind:this={cancelButton} onclick={cancel}>Cancel</button>
    <span class="label">Editing:</span>
    <ol aria-label="Editing path">
      {#each editing as editor (editor.session)}
        <li>{editorName(view, editor.target)}</li>
      {/each}
    </ol>
    <!-- Escape answers No from the keyboard; the backdrop's click is its pointer twin. -->
    <dialog
      bind:this={dialog}
      aria-labelledby="{uid}-question"
      style:top="{top}px"
      style:left="{left}px"
      onclick={onBackdrop}
    >
      <div class="content">
        <p id="{uid}-question">{question}</p>
        <div class="answers">
          <button type="button" onclick={() => answer(true)}>Yes</button>
          <button type="button" bind:this={noButton} onclick={() => answer(false)}>No</button>
        </div>
      </div>
    </dialog>
  </div>
{/if}

<style>
  .editing {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.75rem;
    border-bottom: 1px solid #e0e0e0;
    font-size: 0.85rem;
  }

  button {
    padding: 0.15rem 0.6rem;
    border: 1px solid transparent;
    border-radius: 4px;
    font: inherit;
    cursor: pointer;
  }

  button:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }

  .done {
    background: #1e7e34;
    color: #fff;
  }

  .done:hover {
    background: #19692c;
  }

  .cancel {
    background: #c62828;
    color: #fff;
  }

  .cancel:hover {
    background: #a82020;
  }

  .label {
    color: #595959;
  }

  ol {
    display: flex;
    flex-wrap: wrap;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* The separator is drawn, not read: assistive technology reads the list. */
  li + li::before {
    content: " > ";
    content: " > " / "";
    white-space: pre;
    color: #595959;
  }

  /* Beside the Cancel button rather than centred; no padding, so a click on the dialog itself is the backdrop. */
  dialog {
    position: fixed;
    inset: auto;
    margin: 0;
    padding: 0;
    max-width: 18rem;
    border: 1px solid #bdbdbd;
    border-radius: 6px;
    font-size: 0.85rem;
  }

  dialog::backdrop {
    background: rgba(0, 0, 0, 0.15);
  }

  .content {
    padding: 0.75rem 1rem;
  }

  p {
    margin: 0 0 0.75rem;
  }

  .answers {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .answers button {
    border-color: #bdbdbd;
    background: #fafafa;
    color: inherit;
  }

  .answers button:hover {
    background: #f0f0f0;
  }
</style>
