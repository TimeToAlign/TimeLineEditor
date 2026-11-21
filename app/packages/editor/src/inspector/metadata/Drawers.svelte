<script lang="ts">
/**
 * The two drawers below the rectangles, native disclosures: the proposed
 * pairs with Confirm and Reject, and the rejected ones with Confirm. The
 * proposed drawer also offers to propose matches for the names stated
 * without an identifier.
 */
import type { DrawerRow, Drawers } from "./frame.ts";

let {
  drawers,
  unreconciled,
  proposing,
  onconfirm,
  onreject,
  onpropose,
}: {
  drawers: Drawers;
  /**
   * How many names the shown element and the elements below it state
   * without an identifier the lookup can find.
   */
  unreconciled: number;
  /** Whether matches for them are being looked up for the shown element. */
  proposing: boolean;
  onconfirm: (row: DrawerRow) => void;
  onreject: (row: DrawerRow) => void;
  onpropose: () => void;
} = $props();
</script>

{#snippet line(row: DrawerRow)}
  <span class="what"><span class="verb">{row.heading}</span> <strong>{row.label}</strong></span>
  <span class="line">
    {[row.line.method, row.line.who, row.line.date].filter((part) => part !== null).join(" · ")}
  </span>
  {#if row.line.note !== null}<span class="note">{row.line.note}</span>{/if}
{/snippet}

<div class="drawers">
  <details data-testid="metadata-drawer-proposed">
    <summary>Proposed ({drawers.proposed.length})</summary>
    {#if unreconciled > 0 || proposing}
      <p class="propose">
        <button
          type="button"
          data-testid="metadata-propose"
          aria-busy={proposing}
          onclick={() => {
            if (!proposing) onpropose();
          }}>Propose matches for unreconciled names</button
        >
        <span class="count" role="status"
          >{proposing
            ? "Looking them up…"
            : `${unreconciled} ${unreconciled === 1 ? "name" : "names"} without an identifier here and below`}</span
        >
      </p>
    {/if}
    <ul>
      {#each drawers.proposed as row (row.key)}
        <li data-testid="metadata-proposed-row" data-key={row.key}>
          {@render line(row)}
          <span class="buttons">
            <button type="button" onclick={() => onconfirm(row)}>Confirm</button>
            <button type="button" onclick={() => onreject(row)}>Reject</button>
          </span>
        </li>
      {/each}
    </ul>
  </details>
  <details data-testid="metadata-drawer-rejected">
    <summary>Rejected ({drawers.rejected.length})</summary>
    <ul>
      {#each drawers.rejected as row (row.key)}
        <li data-testid="metadata-rejected-row" data-key={row.key}>
          {@render line(row)}
          <span class="buttons">
            <button type="button" onclick={() => onconfirm(row)}>Confirm</button>
          </span>
        </li>
      {/each}
    </ul>
  </details>
</div>

<style>
  .drawers {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  summary {
    cursor: pointer;
    color: #3d3d3d;
  }

  summary:focus-visible,
  button:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }

  ul {
    margin: 0.2rem 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.1rem 0.4rem;
    padding: 0.2rem 0;
    border-bottom: 1px solid #eee;
  }

  .line,
  .note {
    flex-basis: 100%;
    color: #595959;
    font-size: 0.78rem;
    overflow-wrap: anywhere;
  }

  .propose {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.4rem;
    margin: 0.2rem 0;
  }

  .count {
    color: #595959;
    font-size: 0.78rem;
  }

  .buttons {
    display: flex;
    gap: 0.3rem;
  }

  button {
    padding: 0.1rem 0.45rem;
    border: 1px solid #bdbdbd;
    border-radius: 3px;
    background: #fafafa;
    font: inherit;
    font-size: 0.78rem;
    color: inherit;
    cursor: pointer;
  }
</style>
