<script lang="ts">
/**
 * A native modal dialog asking one question with two answers. `ask`
 * resolves `true` for the first answer, `false` for the second, and `null`
 * when the dialog is dismissed with Escape.
 */

let dialog: HTMLDialogElement | undefined = $state();
let question = $state("");
let yes = $state("");
let no = $state("");
let yesButton: HTMLButtonElement | undefined = $state();
let noButton: HTMLButtonElement | undefined = $state();
let answer: ((value: boolean | null) => void) | undefined;

/** Ask `text`; `focused` names the answer that holds the focus when the dialog opens. */
export function ask(
  text: string,
  first: string,
  second: string,
  focused: "first" | "second",
): Promise<boolean | null> {
  answer?.(null);
  question = text;
  yes = first;
  no = second;
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
</script>

<dialog bind:this={dialog} aria-labelledby="confirm-question" onclose={() => finish(null)}>
  <p id="confirm-question">{question}</p>
  <div class="answers">
    <button type="button" bind:this={yesButton} onclick={() => finish(true)}>{yes}</button>
    <button type="button" bind:this={noButton} onclick={() => finish(false)}>{no}</button>
  </div>
</dialog>

<style>
  dialog {
    max-width: 28rem;
    padding: 1rem 1.25rem;
    border: 1px solid #bdbdbd;
    border-radius: 6px;
    font-size: 0.9rem;
  }

  dialog::backdrop {
    background: rgba(0, 0, 0, 0.25);
  }

  p {
    margin: 0 0 1rem;
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
