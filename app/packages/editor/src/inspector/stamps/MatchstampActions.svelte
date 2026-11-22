<script lang="ts">
/**
 * The end of a named MatchStamp in the Matchstamp tab: what differs from
 * the current table when it is out of date, then Update (offered while it
 * is out of date, disabled when no anchor of it is stated any more) and
 * Remove.
 */
import type { LiveStore } from "@timetoalign/tilie-arranger";
import type { MatchStampCheck } from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import type { Difference, MatchIndexes, ShownStamp } from "../matchstamps.ts";
import { removeCommand, updateCommand } from "../matchstamps.ts";
import type { HeldMatch } from "../tabs.ts";
import { dispatchMatchStamp } from "./commands.ts";
import type { StampDrafts } from "./drafts.svelte.ts";

interface Props {
  /** The open workspace's store, read as Svelte state. */
  live: LiveStore;
  /** The named MatchStamp shown (its `id` set). */
  stamp: ShownStamp;
  /** It compared with the current table; `null` without a table. */
  comparison: MatchStampCheck | null;
  /** What differs (`differencesOf`); empty while it is up to date. */
  differences: readonly Difference[];
  /**
   * Its block's anchor indexes and the block's drawing, which an update
   * reads its screen order with (nothing raised, whichever editor is open:
   * `updateCommand`).
   */
  indexes: MatchIndexes | null;
  drawing: Drawing | null;
  /** The tab's drafts: the refusals of `update` and `remove`. */
  drafts: StampDrafts<unknown>;
  /** The MatchStamp shown is now `next`: `null` once removed. */
  onmatch: (next: HeldMatch | null) => void;
}

let { live, stamp, comparison, differences, indexes, drawing, drafts, onmatch }: Props = $props();

const NO_UPDATE =
  "None of its anchors is stated by the current table, so there is nothing to update from.";

function update(): void {
  const { id } = stamp;
  const next = comparison?.update ?? null;
  if (id === null || next === null || indexes === null || drawing === null) return;
  const command = updateCommand(stamp.block, id, next, indexes.compared, drawing);
  drafts.send("update", () => dispatchMatchStamp(live, stamp.block, command));
}

function remove(): void {
  const { id } = stamp;
  if (id === null) return;
  const command = removeCommand(stamp.block, id);
  if (drafts.send("remove", () => dispatchMatchStamp(live, stamp.block, command))) onmatch(null);
}
</script>

<section class="area ending">
  {#if differences.length > 0}
    <div class="differences" data-testid="matchstamp-differences">
      <h4>Out of date</h4>
      <dl>
        {#each differences as difference (difference.label)}
          <dt>{difference.label}</dt>
          <dd>{difference.items.join(", ")}</dd>
        {/each}
      </dl>
    </div>
  {/if}

  <div class="actions">
    {#if comparison?.outOfDate === true}
      <button
        type="button"
        class="action"
        disabled={comparison.update === null}
        title={comparison.update === null ? NO_UPDATE : undefined}
        onclick={update}>Update</button
      >
    {/if}
    <button type="button" class="action delete" onclick={remove}>Remove</button>
    <span class="problem" role="status">{drafts.problems.update ?? drafts.problems.remove ?? ""}</span>
  </div>
</section>

<style>
  .differences dl {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 0.2rem 0.75rem;
    margin: 0;
  }

  .differences dt {
    color: #595959;
  }

  .differences dd {
    margin: 0;
  }

  .actions {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
  }
</style>
