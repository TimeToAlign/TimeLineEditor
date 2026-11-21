<script lang="ts">
/**
 * The Timestamp tab's Properties, a key/value grid: what the timestamp
 * displays (its toggles), the MatchStamps a match timestamp belongs to, and
 * Delete. While the timestamp is unnamed the area is greyed and its
 * controls are disabled: naming it stores it.
 */
import type { LiveStore } from "@timetoalign/tilie-arranger";
import type { Pin, TimestampDisplay } from "@timetoalign/tilie-core";
import { matchStampsOf } from "../matchstamps.ts";
import { DISPLAY_WORDS, displayCommand, displayOf, removeCommand } from "../timestamp.ts";
import DisplayToggles from "./DisplayToggles.svelte";
import type { StampDrafts } from "./drafts.svelte.ts";

interface Props {
  /** The open workspace's store, read as Svelte state. */
  live: LiveStore;
  /** The timestamp shown. */
  pin: Pin;
  /** The tab's drafts: the refusals of `display` and `delete`. */
  drafts: StampDrafts<unknown>;
  /** The ID of the hint saying why the controls wait for a name; `undefined` once named. */
  describedby: string | undefined;
}

let { live, pin, drafts, describedby }: Props = $props();

const uid = $props.id();

const unnamed = $derived(pin.named === null);
/** The named MatchStamps whose anchors name the match timestamp shown; `null` for any other timestamp. */
const matchStamps = $derived.by(() => {
  if (pin.named === null || !pin.named.matchstamp) return null;
  const manifest = live.view.blocks[pin.spec.block]?.manifest;
  return manifest === undefined ? [] : matchStampsOf(manifest, pin.named.id);
});

function toggle(word: TimestampDisplay): void {
  if (pin.named !== null) {
    drafts.send("display", () => live.store.dispatch(displayCommand(pin, word)));
  }
}

function remove(): void {
  if (pin.named !== null) drafts.send("delete", () => live.store.dispatch(removeCommand(pin)));
}
</script>

<section
  class={["area", "properties", { unnamed }]}
  aria-labelledby="{uid}-properties"
  data-testid="timestamp-properties"
>
  <h3 id="{uid}-properties">Properties</h3>
  <div class="grid">
    <span class="key" id="{uid}-display">Display</span>
    <div class="field">
      <DisplayToggles
        words={DISPLAY_WORDS}
        display={displayOf(pin)}
        disabled={unnamed}
        labelledby="{uid}-display"
        {describedby}
        ontoggle={toggle}
      />
      <span class="problem" role="status">{drafts.problems.display ?? ""}</span>
    </div>

    {#if matchStamps !== null}
      <span class="key" id="{uid}-matchstamps">MatchStamps</span>
      <ul class="matchstamps" aria-labelledby="{uid}-matchstamps">
        {#each matchStamps as matchStamp (matchStamp.id)}
          <li>{matchStamp.name} <code class="stamp-code">{matchStamp.id}</code></li>
        {/each}
      </ul>
    {/if}

    <span class="key" aria-hidden="true"></span>
    <div class="field">
      <button
        type="button"
        class="action delete"
        disabled={unnamed}
        aria-describedby={describedby}
        onclick={remove}>Delete</button
      >
      <span class="problem" role="status">{drafts.problems.delete ?? ""}</span>
    </div>
  </div>
</section>

<style>
  /* Keys in one column, their controls in the other. */
  .grid {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: baseline;
    gap: 0.4rem 0.75rem;
  }

  .key {
    color: #595959;
  }

  /* While unnamed the keys are greyed with their disabled controls. */
  .unnamed .key {
    opacity: 0.5;
  }

  .field .problem {
    display: block;
    font-size: 0.75rem;
  }

  .field .problem:empty {
    display: none;
  }

  .matchstamps {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .matchstamps .stamp-code {
    color: #595959;
  }
</style>
