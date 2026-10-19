<script lang="ts">
/**
 * The editing bar, shown while an editor is open: Done and Cancel for the
 * innermost editor, and the editing path, the open editors' names in
 * opening order. Cancel asks first, just below itself, when the editor
 * holds a change.
 */
import type { LiveStore } from "@timetoalign/tilie-arranger";
import ConfirmDialog from "../ConfirmDialog.svelte";
import { editorName } from "./words.ts";

/** The open workspace's store, read as Svelte state. */
let { live }: { live: LiveStore } = $props();

/** The editing path, the view its names are read from, and Cancel's count. */
const editing = $derived(live.editing);
const view = $derived(live.view);
const changes = $derived(live.changes);

let cancelButton: HTMLButtonElement | undefined = $state();
let confirm: ConfirmDialog | undefined = $state();

/** Close the innermost editor without its changes; with a change, only after Yes. */
async function cancel(): Promise<void> {
  if (changes === 0) {
    live.store.cancel();
    return;
  }
  const question = `Are you sure you want to discard ${changes} ${changes === 1 ? "change" : "changes"}?`;
  if ((await confirm?.ask(question, "Yes", "No", "second", cancelButton ?? null)) === true) {
    live.store.cancel();
  }
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
    <ConfirmDialog bind:this={confirm} />
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
</style>
