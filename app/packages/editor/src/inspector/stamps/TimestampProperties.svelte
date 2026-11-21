<script lang="ts">
/**
 * The Timestamp tab's Properties, a key/value grid: what the timestamp
 * displays (its toggles); on a group member (never for a match timestamp)
 * the GroupStamp toggle, whose line then crosses every member of its
 * groups, shown for an unnamed timestamp as naming would store it; the
 * MatchStamps a match timestamp belongs to; and Delete. While the timestamp
 * is unnamed the area is greyed and its controls are disabled: naming it
 * stores it.
 */
import type { LiveStore } from "@timetoalign/tilie-arranger";
import type { Pin, TimestampDisplay } from "@timetoalign/tilie-core";
import { matchStampsOf } from "../matchstamps.ts";
import {
  DISPLAY_WORDS,
  displayCommand,
  displayOf,
  groupsOf,
  groupstampCommand,
  groupstampOf,
  offersGroupstamp,
  removeCommand,
} from "../timestamp.ts";
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

/** The toggle of a GroupStamp: one word. */
const GROUPSTAMP_WORDS = [{ word: "groupstamp", label: "GroupStamp" }] as const;

const unnamed = $derived(pin.named === null);
const manifest = $derived(live.view.blocks[pin.spec.block]?.manifest);
/** Whether it is a GroupStamp; `null` where no GroupStamp toggle is offered. */
const groupstamp = $derived(
  manifest === undefined || !offersGroupstamp(manifest, pin)
    ? null
    : groupstampOf(manifest, pin, live.editing.at(-1)?.kind ?? null),
);
/** What a GroupStamp's line crosses, in words. */
const crosses = $derived.by(() => {
  if (manifest === undefined || groupstamp === null) return "";
  const groups = groupsOf(manifest, pin.timestamp.timeline).map((name) => `'${name}'`);
  return `A GroupStamp's line crosses every member of ${groups.join(", ")}.`;
});
/** The named MatchStamps whose anchors name the match timestamp shown; `null` for any other timestamp. */
const matchStamps = $derived.by(() => {
  if (pin.named === null || !pin.named.matchstamp) return null;
  return manifest === undefined ? [] : matchStampsOf(manifest, pin.named.id);
});

function toggle(word: TimestampDisplay): void {
  if (pin.named !== null) {
    drafts.send("display", () => live.store.dispatch(displayCommand(pin, word)));
  }
}

function toggleGroupstamp(): void {
  if (pin.named !== null && groupstamp !== null) {
    const command = groupstampCommand(pin, !groupstamp);
    drafts.send("groupstamp", () => live.store.dispatch(command));
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
    <div class="field" data-testid="timestamp-display">
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

    {#if groupstamp !== null}
      <span class="key" id="{uid}-group">Group</span>
      <div class="field" data-testid="timestamp-groupstamp">
        <DisplayToggles
          words={GROUPSTAMP_WORDS}
          display={groupstamp ? ["groupstamp"] : []}
          disabled={unnamed}
          labelledby="{uid}-group"
          describedby={describedby === undefined ? `${uid}-crosses` : `${uid}-crosses ${describedby}`}
          ontoggle={toggleGroupstamp}
        />
        <span class="hint" id="{uid}-crosses">{crosses}</span>
        <span class="problem" role="status">{drafts.problems.groupstamp ?? ""}</span>
      </div>
    {/if}

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

  .field .problem,
  .field .hint {
    display: block;
    font-size: 0.75rem;
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
