<script lang="ts">
import type { Entry } from "@timetoalign/tilie-core";
import { isSessionEntry } from "@timetoalign/tilie-core";
import { SvelteSet } from "svelte/reactivity";
import type { JournalRow } from "./journal.ts";

let { rows }: { rows: readonly JournalRow[] } = $props();

const uid = $props.id();

/** The session rows shown expanded: view state of the panel, never stored. */
const expanded = new SvelteSet<Entry>();

function toggle(entry: Entry): void {
  if (expanded.has(entry)) expanded.delete(entry);
  else expanded.add(entry);
}

/** An id for a part of a session row; session ids are unique in the workspace. */
function idOf(entry: Entry, part: string): string | undefined {
  return isSessionEntry(entry) ? `${uid}-${part}-${entry.session}` : undefined;
}
</script>

{#snippet list(items: readonly JournalRow[], id: string | undefined)}
  <ol class="journal" {id} aria-label={id === undefined ? "Journal" : undefined}>
    {#each items as row (row.entry)}
      {@const open = expanded.has(row.entry)}
      <li data-undone={row.undone || undefined} data-earlier={row.earlier || undefined}>
        <div class="row">
          {#if row.children.length > 0}
            <button
              type="button"
              class="disclosure"
              aria-expanded={open}
              aria-controls={open ? idOf(row.entry, "changes") : undefined}
              aria-labelledby={idOf(row.entry, "text")}
              onclick={() => toggle(row.entry)}
            ></button>
          {/if}
          <time class="time">{row.time}</time>
          <span class="author">{row.author}</span>
          <span class="text" id={idOf(row.entry, "text")}>{row.text}</span>
          {#if row.undone}<span class="visually-hidden">undone</span>{/if}
        </div>
        {#if open}
          {@render list(row.children, idOf(row.entry, "changes"))}
        {/if}
      </li>
    {/each}
  </ol>
{/snippet}

{#if rows.length === 0}
  <p class="empty">No changes yet.</p>
{:else}
  {@render list(rows, undefined)}
{/if}

<style>
  .journal {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A session's changes, under its row. */
  .journal .journal {
    padding-left: 1.25rem;
  }

  .empty {
    margin: 0;
    color: #595959;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 0.5rem;
    padding: 0.15rem 0;
  }

  li + li {
    border-top: 1px solid #e0e0e0;
  }

  /* The earlier session of the edited element, read only, set apart from the open one below it. */
  li[data-earlier] > .row {
    color: #595959;
  }

  li:not([data-earlier]) + li[data-earlier] {
    border-top: 2px solid #b0b0b0;
  }

  /* Undone and not redone yet; each row of a session greyed on its own, so nesting never compounds it. */
  li[data-undone] > .row {
    color: #595959;
    opacity: 0.5;
  }

  .disclosure {
    width: 1.25rem;
    height: 1.25rem;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    align-self: center;
  }

  /* A triangle pointing right when collapsed, down when expanded. */
  .disclosure::before {
    content: "";
    display: inline-block;
    border-style: solid;
    border-width: 0.3rem 0 0.3rem 0.45rem;
    border-color: transparent transparent transparent currentColor;
    transition: transform 0.1s;
  }

  .disclosure[aria-expanded="true"]::before {
    transform: rotate(90deg);
  }

  .disclosure:focus-visible {
    outline: 2px solid #0b57d0;
    outline-offset: 1px;
  }

  @media (prefers-reduced-motion: reduce) {
    .disclosure::before {
      transition: none;
    }
  }

  .time {
    font-family: ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace;
    color: #595959;
  }

  .author {
    color: #595959;
  }

  .text {
    flex-basis: 100%;
  }

  /* Read by assistive technology, not shown: the grey says it to the eye. */
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
