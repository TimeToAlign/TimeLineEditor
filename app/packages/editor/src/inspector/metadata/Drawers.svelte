<script lang="ts">
/**
 * The three drawers below the rectangles, native disclosures: what is
 * stated of the elements around the one shown (read only), the proposed
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

const higherCount = $derived(
  drawers.higher.reduce((count, group) => count + group.rectangles.length, 0),
);
</script>

{#snippet line(row: DrawerRow)}
  <span class="what"><span class="verb">{row.heading}</span> <strong>{row.label}</strong></span>
  <span class="line">
    {[row.line.method, row.line.who, row.line.date].filter((part) => part !== null).join(" · ")}
  </span>
  {#if row.line.note !== null}<span class="note">{row.line.note}</span>{/if}
{/snippet}

<div class="drawers">
  <details data-testid="metadata-drawer-higher">
    <summary>Stated higher up ({higherCount})</summary>
    {#each drawers.higher as group (group.key)}
      <section>
        <h4>{group.words}</h4>
        <ul>
          {#each group.rectangles as rectangle (rectangle.key)}
            <li>
              <span class="verb">{rectangle.heading}</span>
              {#if rectangle.label !== null}<strong>{rectangle.label}</strong>{/if}
              {#each rectangle.rows as row, index (index)}
                <span class="row"><code>{row.property}</code> <code>{row.value}</code></span>
              {/each}
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </details>
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

  h4 {
    margin: 0.3rem 0 0.15rem;
    font-size: 0.8rem;
    font-weight: 600;
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

  .row,
  .line,
  .note {
    flex-basis: 100%;
    color: #595959;
    font-size: 0.78rem;
    overflow-wrap: anywhere;
  }

  code {
    font-family: ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace;
    font-size: 0.78rem;
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
