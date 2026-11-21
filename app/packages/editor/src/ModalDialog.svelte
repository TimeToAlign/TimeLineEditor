<script lang="ts">
/**
 * The shell of the editor's native modal dialogs (a question, the tables
 * dialog): the `<dialog>` element, its look and its buttons' look, and its
 * one question at a time. `show` opens it and resolves once it closes:
 * `true` when the dialog calls `accept` (its answer, held by the dialog,
 * stands), `false` when it is dismissed (`dismiss`, Escape, a click on an
 * anchored dialog's backdrop, or another question shown over it). Shown
 * about an anchor, it opens just below the anchor rather than centred.
 */

import type { Snippet } from "svelte";
import { flushSync } from "svelte";
import type { Attachment } from "svelte/attachments";

interface Props {
  /** The ID of the element naming the dialog. */
  labelledby: string;
  /** A form's width (fixed) rather than a question's (at most). */
  wide?: boolean;
  children: Snippet;
}

let { labelledby, wide = false, children }: Props = $props();

/** The dialog element, held by an attachment; not state. */
let dialog: HTMLDialogElement | undefined;
const held: Attachment<HTMLDialogElement> = (element) => {
  dialog = element;
  return () => {
    dialog = undefined;
  };
};
/** Where an anchored dialog opens, in viewport pixels; `null` centres it. */
let at: { readonly top: number; readonly left: number } | null = $state.raw(null);
let settle: ((answered: boolean) => void) | undefined;

/**
 * Open the dialog, below `anchor` when given, the focus on what `focus`
 * gives once the content is updated; resolves whether it was answered.
 * Shown while open, the question open is dismissed first.
 */
export function show(
  anchor: Element | null,
  focus: () => HTMLElement | undefined,
): Promise<boolean> {
  finish(false);
  const rect = anchor?.getBoundingClientRect();
  at = rect === undefined ? null : { top: rect.bottom + 4, left: rect.left };
  return new Promise((resolve) => {
    settle = resolve;
    // The content of the new question exists once the dialog is updated.
    flushSync();
    dialog?.showModal();
    focus()?.focus();
  });
}

/** Close the dialog answered: the dialog's answer stands. */
export function accept(): void {
  finish(true);
}

/** Close the dialog unanswered. */
export function dismiss(): void {
  finish(false);
}

function finish(answered: boolean): void {
  const resolve = settle;
  settle = undefined;
  if (dialog?.open) dialog.close();
  resolve?.(answered);
}

/** Closed by Escape; a `close` event arriving after another question opened is that one's past. */
function onclose(): void {
  if (!dialog?.open) finish(false);
}

/** A click on the dialog element itself fell on the backdrop: its content fills the dialog. */
function onclick(event: MouseEvent): void {
  if (at !== null && event.target === dialog) finish(false);
}
</script>

<!-- Escape dismisses from the keyboard; an anchored dialog's backdrop click is its pointer twin. -->
<dialog
  {@attach held}
  class={{ anchored: at !== null, wide }}
  aria-labelledby={labelledby}
  style:top={at === null ? undefined : `${at.top}px`}
  style:left={at === null ? undefined : `${at.left}px`}
  {onclose}
  {onclick}
>
  <div class="content">
    {@render children()}
  </div>
</dialog>

<style>
  /* No padding of its own, so that a click on the dialog itself is one on the backdrop. */
  dialog {
    max-width: 28rem;
    padding: 0;
    border: 1px solid #bdbdbd;
    border-radius: 6px;
    font-size: 0.9rem;
  }

  dialog::backdrop {
    background: rgba(0, 0, 0, 0.25);
  }

  .wide {
    width: min(30rem, 90vw);
    max-width: none;
  }

  .content {
    padding: 1rem 1.25rem;
  }

  /* Below its anchor rather than centred. */
  .anchored {
    position: fixed;
    inset: auto;
    margin: 0;
    max-width: 18rem;
    font-size: 0.85rem;
  }

  .anchored::backdrop {
    background: rgba(0, 0, 0, 0.15);
  }

  .anchored .content {
    padding: 0.75rem 1rem;
  }

  /* An anchored question keeps less room under its text. */
  .anchored .content :global(p) {
    margin-bottom: 0.75rem;
  }

  .content :global {
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
  }
</style>
