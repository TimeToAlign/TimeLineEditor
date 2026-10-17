<script lang="ts">
import type { JournalRow } from "./journal.ts";

let { rows }: { rows: readonly JournalRow[] } = $props();
</script>

{#if rows.length === 0}
  <p class="empty">No changes yet.</p>
{:else}
  <ol class="journal" aria-label="Journal">
    {#each rows as row (row.entry)}
      <li data-undone={row.undone || undefined} data-earlier={row.earlier || undefined}>
        <time class="time">{row.time}</time>
        <span class="author">{row.author}</span>
        <span class="text">{row.text}</span>
        {#if row.undone}<span class="visually-hidden">undone</span>{/if}
      </li>
    {/each}
  </ol>
{/if}

<style>
  .journal {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .empty {
    margin: 0;
    color: #595959;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    gap: 0 0.5rem;
    padding: 0.15rem 0;
  }

  li + li {
    border-top: 1px solid #e0e0e0;
  }

  /* The earlier session of the edited element, read only, set apart from the open one. */
  li[data-earlier] {
    color: #595959;
  }

  li[data-earlier] + li:not([data-earlier]) {
    border-top: 2px solid #b0b0b0;
  }

  /* Undone and not redone yet. */
  li[data-undone] {
    color: #595959;
    opacity: 0.5;
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
