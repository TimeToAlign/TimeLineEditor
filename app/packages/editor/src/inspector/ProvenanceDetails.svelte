<script lang="ts">
/**
 * One provenance entry as both tabs show it, a Metadata pair's and a
 * MatchClaim's: how the entry says it was made (the paradata: who stated
 * it, how, with which service, on what basis, how closely it matches, a
 * note, when), who believes it and how, and the user's own belief (true,
 * unlikely, false), one button each, the one the user holds pressed.
 * Without an entry it says why, in the words its host gives. More actions
 * of the host (Remove) follow the belief buttons.
 */
import type { Belief } from "@timetoalign/timetoshare";
import type { Snippet } from "svelte";
import type { EntryLine } from "./metadata/frame.ts";
import { paradataRows } from "./metadata/frame.ts";

let {
  line,
  missing,
  mine,
  label = "Your belief",
  disabled = false,
  title,
  onbelieve,
  actions,
}: {
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
  /** Why the belief buttons are disabled, their title. */
  title?: string | undefined;
  onbelieve: (belief: Belief) => void;
  /** The host's further actions, after the belief buttons. */
  actions?: Snippet;
} = $props();

/** The beliefs from most to least, as the buttons offer them. */
const ORDER: readonly Belief[] = ["true", "unlikely", "false"];
const WORDS: Readonly<Record<Belief, string>> = {
  true: "True",
  unlikely: "Unlikely",
  false: "False",
};

const rows = $derived(line === null ? [] : paradataRows(line));
</script>

<div class="provenance">
  {#if line === null}
    <p class="muted no-provenance">{missing}</p>
  {:else if rows.length > 0}
    <dl class="paradata" data-testid="metadata-paradata">
      {#each rows as row (row.key)}
        <dt>{row.label}</dt>
        <dd>{#if row.key === "service"}<code>{row.text}</code>{:else}{row.text}{/if}</dd>
      {/each}
    </dl>
  {/if}
  {#if line === null || line.beliefs.length === 0}
    <p class="muted" data-testid="metadata-beliefs">No one has stated a belief.</p>
  {:else}
    <ul class="beliefs" data-testid="metadata-beliefs" aria-label="Beliefs">
      {#each line.beliefs as held (held.actor)}
        <li>
          {held.who} believes it <strong>{held.belief}</strong>{held.date === null
            ? ""
            : ` (${held.date})`}{held.note === null ? "" : `: ${held.note}`}
        </li>
      {/each}
    </ul>
  {/if}
  <div class="actions">
    <div class="belief" role="group" aria-label={label}>
      <span class="muted">Your belief:</span>
      {#each ORDER as belief (belief)}
        <button
          type="button"
          aria-pressed={mine === belief}
          {disabled}
          {title}
          onclick={() => onbelieve(belief)}>{WORDS[belief]}</button
        >
      {/each}
    </div>
    {@render actions?.()}
  </div>
</div>

<style>
  .provenance {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  p {
    margin: 0;
  }

  .muted {
    color: #595959;
  }

  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0 0.5rem;
    margin: 0;
  }

  dt {
    color: #595959;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  code {
    font-family: ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace;
  }

  .beliefs {
    margin: 0;
    padding-left: 1rem;
  }

  .actions,
  .belief {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
  }

  .actions {
    justify-content: space-between;
  }

  button {
    padding: 0.1rem 0.45rem;
    border: 1px solid #bdbdbd;
    border-radius: 3px;
    background: #fafafa;
    font: inherit;
    color: inherit;
    cursor: pointer;
  }

  button[aria-pressed="true"] {
    border-color: #1d4f91;
    background: #1d4f91;
    color: #fff;
  }

  button:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
</style>
