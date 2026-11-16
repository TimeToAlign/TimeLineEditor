<script lang="ts">
/**
 * A native modal dialog asking one question with two or more answers.
 * `ask` resolves the answer chosen, or `null` when the dialog is dismissed
 * with Escape. Asked about an anchor, the dialog opens just below it rather
 * than centred, and a click on its backdrop dismisses it too.
 */
import { flushSync } from "svelte";

const id = $props.id();
let dialog: HTMLDialogElement | undefined = $state();
let question = $state("");
let answers: readonly string[] = $state.raw([]);
/** Where an anchored question opens, in viewport pixels; `null` centres it. */
let at: { readonly top: number; readonly left: number } | null = $state.raw(null);
/** The answer buttons, in the order of `answers`. */
const buttons: HTMLButtonElement[] = [];
let answer: ((value: string | null) => void) | undefined;

/**
 * Ask `text` with `choices`, shown in that order; the focus starts on
 * `focused`, and `anchor`, when given, is the element the dialog opens
 * below. A question asked while another is open dismisses that one.
 */
export function ask<const A extends string>(
  text: string,
  choices: readonly A[],
  focused: NoInfer<A>,
  anchor: Element | null = null,
): Promise<A | null> {
  answer?.(null);
  question = text;
  answers = choices;
  const rect = anchor?.getBoundingClientRect();
  at = rect === undefined ? null : { top: rect.bottom + 4, left: rect.left };
  return new Promise((resolve) => {
    answer = (value) => resolve(choices.find((choice) => choice === value) ?? null);
    // The buttons of the new answers exist once the dialog's content is updated.
    flushSync();
    dialog?.showModal();
    buttons[choices.indexOf(focused)]?.focus();
  });
}

function finish(value: string | null): void {
  const resolve = answer;
  answer = undefined;
  if (dialog?.open) dialog.close();
  resolve?.(value);
}

/** A click on the dialog element itself fell on the backdrop: its content fills the dialog. */
function onclick(event: MouseEvent): void {
  if (at !== null && event.target === dialog) finish(null);
}
</script>

<!-- Escape dismisses from the keyboard; an anchored dialog's backdrop click is its pointer twin. -->
<dialog
  bind:this={dialog}
  class={{ anchored: at !== null }}
  aria-labelledby="{id}-question"
  style:top={at === null ? undefined : `${at.top}px`}
  style:left={at === null ? undefined : `${at.left}px`}
  onclose={() => finish(null)}
  {onclick}
>
  <div class="content">
    <p id="{id}-question">{question}</p>
    <div class="answers">
      {#each answers as choice, index (choice)}
        <button type="button" bind:this={buttons[index]} onclick={() => finish(choice)}
          >{choice}</button
        >
      {/each}
    </div>
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

  p {
    margin: 0 0 1rem;
  }

  .anchored p {
    margin: 0 0 0.75rem;
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

  button:hover {
    background: #f0f0f0;
  }

  button:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }
</style>
