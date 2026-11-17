<script lang="ts">
/**
 * A native modal dialog asking for the viewer's identity, a URI that
 * asserts the links they create. `ask` resolves `{uri}`: the URI typed
 * (Save, or Enter in the field, only once the schema reads it as an
 * absolute URI), `null` for No identity; or `null` itself when the dialog
 * is dismissed (Cancel, Escape).
 */
import { flushSync } from "svelte";
import type { IdentityAnswer } from "./identity.svelte.ts";
import { isUri } from "./metadata.ts";

const id = $props.id();
let dialog: HTMLDialogElement | undefined = $state();
let field: HTMLInputElement | undefined = $state();
let text = $state("");
/** Whether Save was pressed on a text that is no URI: the field says why. */
let invalid = $state(false);
let answer: ((value: IdentityAnswer | null) => void) | undefined;

/** Ask for the identity, the field holding `current`; a question asked while another is open dismisses that one. */
export function ask(current: string | null): Promise<IdentityAnswer | null> {
  answer?.(null);
  text = current ?? "";
  invalid = false;
  return new Promise((resolve) => {
    answer = resolve;
    flushSync();
    dialog?.showModal();
    field?.focus();
  });
}

function finish(value: IdentityAnswer | null): void {
  const resolve = answer;
  answer = undefined;
  if (dialog?.open) dialog.close();
  resolve?.(value);
}

function save(event: SubmitEvent): void {
  event.preventDefault();
  const uri = text.trim();
  if (!isUri(uri)) {
    invalid = true;
    field?.focus();
    return;
  }
  finish({ uri });
}
</script>

<dialog bind:this={dialog} aria-labelledby="{id}-title" onclose={() => finish(null)}>
  <!-- The schema, not the browser, decides what a URI is: the form validates nothing itself. -->
  <form novalidate onsubmit={save}>
    <h2 id="{id}-title">Who asserts your links?</h2>
    <p id="{id}-about">
      Each link you create states that you asserted it, and when. Give your identity as a URI, for
      instance your ORCID iD (<code>https://orcid.org/…</code>). It is kept in this browser and
      written into a workspace only inside the assertions of the links you create.
    </p>
    <label for="{id}-uri">Your identity</label>
    <input
      id="{id}-uri"
      type="url"
      bind:this={field}
      bind:value={text}
      aria-describedby={invalid ? `${id}-about ${id}-invalid` : `${id}-about`}
      aria-invalid={invalid}
      oninput={() => (invalid = false)}
    />
    {#if invalid}
      <p id="{id}-invalid" class="invalid" role="alert">
        An identity is an absolute URI, such as https://orcid.org/0000-0002-1825-0097.
      </p>
    {/if}
    <div class="answers">
      <button type="submit">Save</button>
      <button type="button" onclick={() => finish({ uri: null })}>No identity</button>
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
    margin-bottom: 0.25rem;
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
