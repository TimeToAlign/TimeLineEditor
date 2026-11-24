<script lang="ts">
/**
 * The provenance of one thing, a Metadata pair or a MatchClaim, behind a
 * Provenance button: the button, named "Provenance of <subject>", and,
 * while it is pressed, the entry as both tabs show it (`ProvenanceDetails`:
 * the paradata, who believes it and how, the user's own belief), the
 * host's further actions after the belief buttons, and the host's words
 * after the entry (`children`). Collapsed at first; the host renders the
 * button where it belongs, the region follows it as the next sibling and
 * takes the whole width of a wrapping row. A host showing the beliefs
 * elsewhere (the Matchstamp tab's MatchClaims) opens the paradata alone
 * (`beliefs` false).
 */
import type { Belief } from "@timetoalign/timetoshare";
import type { Snippet } from "svelte";
import ProvenanceDetails from "./ProvenanceDetails.svelte";
import type { EntryLine } from "./provenance.ts";

let {
  subject,
  line,
  missing,
  mine,
  label,
  disabled,
  onbelieve,
  actions,
  children,
  beliefs = true,
}: {
  /** What the provenance is of, in words: the button's accessible name follows "Provenance of". */
  subject: string;
  /** The entry's line (`lineOf`); `null` where there is no entry. */
  line: EntryLine | null;
  /** What is said where there is no entry: who states the thing instead, or that nobody does. */
  missing: string;
  /** The user's own belief; `null` for none. */
  mine: Belief | null;
  /** The accessible name of the belief buttons' group. */
  label?: string;
  /** Whether the belief buttons wait (no server, a belief being recorded). */
  disabled?: boolean;
  onbelieve: (belief: Belief) => void;
  /** The host's further actions, after the belief buttons. */
  actions?: Snippet;
  /** The host's words after the entry. */
  children?: Snippet;
  /** Whether the beliefs and the belief buttons are shown with the paradata. */
  beliefs?: boolean;
} = $props();

const uid = $props.id();
/** Whether the entry is shown. */
let open = $state(false);
</script>

<button
  type="button"
  class="toggle"
  aria-label="Provenance of {subject}"
  aria-expanded={open}
  aria-controls={open ? `${uid}-provenance` : undefined}
  onclick={() => (open = !open)}>Provenance</button
>
{#if open}
  <div class="region" id="{uid}-provenance" data-testid="provenance">
    <ProvenanceDetails
      {line}
      {missing}
      {mine}
      {label}
      {disabled}
      {onbelieve}
      {actions}
      {beliefs}
    />
    {@render children?.()}
  </div>
{/if}

<style>
  .region {
    display: flex;
    flex-direction: column;
    flex-basis: 100%;
    gap: 0.3rem;
    margin: 0.3rem 0 0.1rem;
    padding: 0.35rem 0.5rem;
    border-left: 3px solid #c9d8ea;
    background: #f7f9fc;
    font-size: 0.78rem;
  }

  .region :global(p) {
    margin: 0;
    color: #595959;
  }

  .toggle {
    padding: 0.1rem 0.45rem;
    border: 1px solid #bdbdbd;
    border-radius: 3px;
    background: #fff;
    font: inherit;
    font-size: 0.78rem;
    color: inherit;
    cursor: pointer;
  }

  .toggle:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }
</style>
