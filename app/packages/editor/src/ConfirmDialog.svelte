<script lang="ts">
/**
 * A native modal dialog asking one question with two answers. `ask`
 * resolves `true` for the first answer, `false` for the second, and `null`
 * when the dialog is dismissed with Escape. Asked about an anchor, the
 * dialog opens just below it rather than centred, and a click on its
 * backdrop dismisses it too.
 */

const id = $props.id();
let dialog: HTMLDialogElement | undefined = $state();
let question = $state("");
let yes = $state("");
let no = $state("");
/** Where an anchored question opens, in viewport pixels; `null` centres it. */
let at: { readonly top: number; readonly left: number } | null = $state.raw(null);
let yesButton: HTMLButtonElement | undefined = $state();
let noButton: HTMLButtonElement | undefined = $state();
let answer: ((value: boolean | null) => void) | undefined;

/**
 * Ask `text`; `focused` names the answer that holds the focus when the
 * dialog opens, and `anchor`, when given, the element it opens below.
 */
export function ask(
  text: string,
  first: string,
  second: string,
  focused: "first" | "second",
  anchor: Element | null = null,
): Promise<boolean | null> {
  answer?.(null);
  question = text;
  yes = first;
  no = second;
  const rect = anchor?.getBoundingClientRect();
  at = rect === undefined ? null : { top: rect.bottom + 4, left: rect.left };
  return new Promise((resolve) => {
    answer = resolve;
    dialog?.showModal();
    (focused === "first" ? yesButton : noButton)?.focus();
  });
}

function finish(value: boolean | null): void {
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
      <button type="button" bind:this={yesButton} onclick={() => finish(true)}>{yes}</button>
      <button type="button" bind:this={noButton} onclick={() => finish(false)}>{no}</button>
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
