<script module lang="ts">
import { createContext } from "svelte";

/**
 * A question asked of the user with its answers, the focus starting on
 * `focused`: the answer chosen, or `null` when the question is dismissed.
 */
export type Ask = (
  text: string,
  choices: readonly string[],
  focused: string,
) => Promise<string | null>;

/**
 * The editor's dialog asking a question (`ask`), for the components below
 * it. Panels mounted without an editor (alone, in tests) have none, and
 * `hasAsk` says so.
 */
export const [askOf, provideAsk, hasAsk] = createContext<Ask>();
</script>

<script lang="ts">
/**
 * A native modal dialog asking one question with two or more answers, on
 * the editor's one dialog shell (`ModalDialog`). `ask` resolves the answer
 * chosen, or `null` when the dialog is dismissed with Escape. Asked about
 * an anchor, the dialog opens just below it rather than centred, and a
 * click on its backdrop dismisses it too.
 */
import type { Attachment } from "svelte/attachments";
import ModalDialog from "./ModalDialog.svelte";

const id = $props.id();
let shell: ReturnType<typeof ModalDialog> | undefined = $state();
let question = $state("");
let answers: readonly string[] = $state.raw([]);
/** The answer buttons, in the order of `answers`, held by attachments; not state. */
const buttons: (HTMLButtonElement | undefined)[] = [];

/** Hold the button of the answer at `index` while it is mounted. */
function held(index: number): Attachment<HTMLButtonElement> {
  return (element) => {
    buttons[index] = element;
    return () => {
      if (buttons[index] === element) buttons[index] = undefined;
    };
  };
}
/** The answer chosen for the question shown. */
let chosen: string | null = null;

/**
 * Ask `text` with `choices`, shown in that order; the focus starts on
 * `focused`, and `anchor`, when given, is the element the dialog opens
 * below. A question asked while another is open dismisses that one.
 */
export async function ask<const A extends string>(
  text: string,
  choices: readonly A[],
  focused: NoInfer<A>,
  anchor: Element | null = null,
): Promise<A | null> {
  question = text;
  answers = choices;
  chosen = null;
  const answered = await shell?.show(anchor, () => buttons[choices.indexOf(focused)]);
  const value = chosen;
  return answered ? (choices.find((choice) => choice === value) ?? null) : null;
}

function choose(choice: string): void {
  chosen = choice;
  shell?.accept();
}
</script>

<ModalDialog bind:this={shell} labelledby="{id}-question">
  <p id="{id}-question">{question}</p>
  <div class="answers">
    {#each answers as choice, index (choice)}
      <button type="button" {@attach held(index)} onclick={() => choose(choice)}>{choice}</button>
    {/each}
  </div>
</ModalDialog>

<style>
  p {
    margin: 0 0 1rem;
  }
</style>
