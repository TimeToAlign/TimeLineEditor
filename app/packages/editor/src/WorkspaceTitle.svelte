<script lang="ts">
/**
 * The workspace's name in the editor's header, renamed in place: a button
 * showing the name (and "• " while there are unsaved changes) that a click,
 * Enter or F2 turns into a text field. Enter or leaving the field commits
 * through `onrename`; Escape restores the button without renaming. A
 * refusal keeps the field and shows its message. The file's name follows,
 * muted, where it is not the one the name gives.
 */
import type { Attachment } from "svelte/attachments";
import { workspaceFileName } from "./files.ts";

interface Props {
  /** The workspace's name. */
  name: string;
  /** The name of the file the workspace is saved in. */
  fileName: string;
  /** Whether the workspace has unsaved changes. */
  dirty: boolean;
  /** Rename the workspace; the refusal's message, or `null` when accepted. */
  onrename: (name: string) => string | null;
}

let { name, fileName, dirty, onrename }: Props = $props();

const id = $props.id();
let editing = $state(false);
let draft = $state("");
/** The refusal of the last commit, shown under the field; `null` while there is none. */
let refusal: string | null = $state(null);
/** Whether the button takes the focus when it comes back; read once, so not state. */
let refocus = false;

const ownFile = $derived(fileName === workspaceFileName(name));

function edit(): void {
  draft = name;
  refusal = null;
  editing = true;
}

/** Hand the field's text to `onrename`; the button comes back unless it was refused. */
function commit(focusButton: boolean): void {
  if (!editing) return;
  const answer = onrename(draft.trim());
  if (answer !== null) {
    refusal = answer;
    return;
  }
  refocus = focusButton;
  editing = false;
}

function cancel(): void {
  refocus = true;
  editing = false;
}

/** The button takes the focus back after a commit or a cancel from the keyboard. */
const focusOnReturn: Attachment<HTMLButtonElement> = (button) => {
  if (!refocus) return;
  refocus = false;
  button.focus();
};

/**
 * The field arrives focused with its text selected, and handles its keys
 * itself: directly on the element, so Ctrl+S commits before any listener
 * above it sees the key (the editor's Save shortcut then saves the new
 * name; the event is neither prevented nor stopped).
 */
const field: Attachment<HTMLInputElement> = (input) => {
  input.focus();
  input.select();
  const onkeydown = (event: KeyboardEvent): void => {
    if (event.key === "Enter") {
      // The button takes the focus at once; unprevented, the browser's Enter would press it.
      event.preventDefault();
      commit(true);
    } else if (event.key === "Escape") cancel();
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") commit(true);
  };
  input.addEventListener("keydown", onkeydown);
  return () => input.removeEventListener("keydown", onkeydown);
};
</script>

<!-- No whitespace between the parts: the page's text is the name, then " — " and the file. -->
<span class="workspace-title"
  >{#if editing}<input
      class="name"
      type="text"
      aria-label="Workspace name"
      aria-invalid={refusal !== null}
      aria-describedby={refusal === null ? undefined : `${id}-refusal`}
      size={Math.max(draft.length, 8)}
      bind:value={draft}
      oninput={() => (refusal = null)}
      onblur={() => commit(false)}
      {@attach field}
    />{#if refusal !== null}<span class="refusal" id="{id}-refusal">{refusal}</span>{/if}{:else}<button
      type="button"
      class="name"
      data-testid="file-name"
      aria-label="Workspace name {name}, {dirty ? 'unsaved changes, ' : ''}click to rename"
      title={fileName}
      onclick={edit}
      onkeydown={(event) => {
        if (event.key === "F2") edit();
      }}
      {@attach focusOnReturn}>{dirty ? "• " : ""}{name}</button
    >{/if}{#if !ownFile}<span class="file">{` — ${fileName}`}</span>{/if}</span
>

<style>
  /* A long name, or the unsaved marker, is cut rather than widening the editor on a phone. */
  .workspace-title {
    display: inline-flex;
    min-width: 0;
    align-items: baseline;
    gap: 0.3rem;
    overflow: hidden;
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .name {
    min-width: 0;
    overflow: hidden;
    padding: 0.1rem 0.3rem;
    border: 1px solid transparent;
    border-radius: 3px;
    font: inherit;
    color: #3d3d3d;
    text-overflow: ellipsis;
  }

  button.name {
    background: none;
    cursor: text;
  }

  button.name:hover {
    border-color: #ccc;
  }

  input.name {
    border-color: #888;
  }

  input.name[aria-invalid="true"] {
    border-color: #a40000;
  }

  .refusal {
    color: #a40000;
  }

  .file {
    min-width: 0;
    overflow: hidden;
    color: #6b6b6b;
    text-overflow: ellipsis;
  }
</style>
