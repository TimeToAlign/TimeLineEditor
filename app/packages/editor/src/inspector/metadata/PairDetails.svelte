<script lang="ts">
/**
 * The details of one pair, behind its Details button: how its provenance
 * entry says it was made (the paradata: who stated it, how, with which
 * service, on what basis, how closely it matches, a note, when), who
 * believes it and how, and the actions: the user's own belief (true,
 * unlikely, false), one button each, the one the user holds pressed; and
 * Remove where the pair is stated. A pair without an entry is stated by
 * the manifest's publisher. Believing a candidate true states it;
 * believing a stated pair false records the belief and leaves the pair
 * stated, so Remove stays an action of its own.
 */
import type { Belief } from "@timetoalign/timetoshare";
import type { EntryLine } from "./frame.ts";

let {
  id,
  line,
  candidate = false,
  mine,
  onbelieve,
  onremove,
}: {
  /** The ID of the region, which the Details button controls. */
  id: string;
  /** The pair's provenance entry; `null` where it has none. */
  line: EntryLine | null;
  /** Whether the pair is a candidate (held only in provenance) rather than stated. */
  candidate?: boolean;
  /** The user's own belief; `null` for none. */
  mine: Belief | null;
  onbelieve: (belief: Belief) => void;
  /** Remove the stated pair; absent for a candidate. */
  onremove?: () => void;
} = $props();

/** The beliefs from most to least, as the buttons offer them. */
const ORDER: readonly Belief[] = ["true", "unlikely", "false"];
const WORDS: Readonly<Record<Belief, string>> = {
  true: "True",
  unlikely: "Unlikely",
  false: "False",
};
</script>

<div class="details" {id} data-testid="metadata-details">
  {#if line === null}
    <p class="muted">No provenance entry: the manifest's publisher states it.</p>
  {:else}
    <dl data-testid="metadata-paradata">
      {#if line.who !== null}<dt>stated by</dt><dd>{line.who}</dd>{/if}
      {#if line.method !== null}<dt>method</dt><dd>{line.method}</dd>{/if}
      {#if line.service !== null}<dt>service</dt><dd><code>{line.service}</code></dd>{/if}
      {#if line.basis.length > 0}<dt>basis</dt><dd>{line.basis.join(", ")}</dd>{/if}
      {#if line.match !== null}<dt>match</dt><dd>{line.match}</dd>{/if}
      {#if line.note !== null}<dt>note</dt><dd>{line.note}</dd>{/if}
      {#if line.date !== null}<dt>date</dt><dd>{line.date}</dd>{/if}
    </dl>
  {/if}
  {#if line === null || line.beliefs.length === 0}
    <p class="muted" data-testid="metadata-beliefs">No one has stated a belief.</p>
  {:else}
    <ul class="beliefs" data-testid="metadata-beliefs">
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
    <div class="belief" role="group" aria-label="Your belief">
      <span class="muted">Your belief:</span>
      {#each ORDER as belief (belief)}
        <button type="button" aria-pressed={mine === belief} onclick={() => onbelieve(belief)}
          >{WORDS[belief]}</button
        >
      {/each}
    </div>
    {#if onremove !== undefined}
      <button type="button" onclick={onremove}>Remove</button>
    {/if}
  </div>
  {#if candidate}
    <p class="muted">Believing a candidate true states it.</p>
  {/if}
</div>

<style>
  .details {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin: 0.3rem 0 0.1rem;
    padding: 0.35rem 0.5rem;
    border-left: 3px solid #c9d8ea;
    background: #f7f9fc;
    font-size: 0.78rem;
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
</style>
