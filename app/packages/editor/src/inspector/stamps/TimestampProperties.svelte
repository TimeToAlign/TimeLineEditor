<script lang="ts">
/**
 * The Timestamp tab's Properties, a key/value grid: what the timestamp
 * displays (its toggles); the rotation of its wedge, which waits while the
 * wedge is not displayed (its value kept) and, while its slider is dragged,
 * shows the dragged rotation on the canvas without storing it; on a group member (a match
 * timestamp's included) the GroupStamp toggle, whose line then crosses every member of its
 * groups, shown for an unnamed timestamp as naming would store it; the
 * MatchStamps a match timestamp belongs to; and Delete. While the timestamp
 * is unnamed the area is greyed and its controls are disabled: naming it
 * stores it.
 */
import type { LiveStore } from "@timetoalign/tilie-arranger";
import type { Pin, TimestampDisplay } from "@timetoalign/tilie-core";
import { fontMetrics } from "@timetoalign/timetoshare";
import { paneOf } from "../../pane.ts";
import { transientOf } from "../../transient.ts";
import { matchStampsOf } from "../matchstamps.ts";
import {
  DISPLAY_WORDS,
  displayCommand,
  displayOf,
  GROUPSTAMP_WORDS,
  groupstampCommand,
  groupstampHint,
  groupstampOf,
  holdingGroupNames,
  namedAddress,
  offersGroupstamp,
  removeCommand,
  rotationCommand,
  wedgeRotationOf,
} from "../timestamp.ts";
import DisplayToggles from "./DisplayToggles.svelte";
import type { StampDrafts } from "./drafts.svelte.ts";
import WedgeRotation from "./WedgeRotation.svelte";

interface Props {
  /** The open workspace's store, read as Svelte state. */
  live: LiveStore;
  /** The timestamp shown. */
  pin: Pin;
  /** The tab's drafts: the refusals of `display`, `rotation`, `groupstamp` and `delete`. */
  drafts: StampDrafts<unknown>;
  /** The ID of the hint saying why the controls wait for a name; `undefined` once named. */
  describedby: string | undefined;
}

let { live, pin, drafts, describedby }: Props = $props();

const uid = $props.id();
const showTransient = transientOf();
/** The canvas's pane, which the wedge's block is drawn at. */
const pane = paneOf();

const unnamed = $derived(pin.named === null);
const manifest = $derived(live.view.blocks[pin.spec.block]?.manifest);
/** The innermost editor open, `null` for none. */
const editor = $derived(live.editing.at(-1)?.kind ?? null);
/** Whether it is a GroupStamp; `null` where no GroupStamp toggle is offered. */
const groupstamp = $derived(
  manifest === undefined || !offersGroupstamp(manifest, pin)
    ? null
    : groupstampOf(manifest, pin, editor),
);
/** Whether its wedge is displayed, so that its rotation shows. */
const wedgeShown = $derived(displayOf(pin).includes("wedge"));
const rotation = $derived(wedgeRotationOf(live.view, pin, fontMetrics, pane));
/** What describes the rotation: the wedge turned off, the naming hint. */
const rotationDescribed = $derived(
  [wedgeShown ? null : `${uid}-wedge-off`, describedby ?? null]
    .filter((id) => id !== null)
    .join(" ") || undefined,
);
/** What a GroupStamp's line crosses, in words. */
const crosses = $derived(
  manifest === undefined || groupstamp === null
    ? ""
    : groupstampHint(holdingGroupNames(manifest, pin.timestamp.timeline)),
);
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

function rotate(value: number | null): void {
  if (pin.named !== null) {
    const command = rotationCommand(pin, value);
    drafts.send("rotation", () => live.store.dispatch(command));
  }
}

/** Show the wedge turned by `value` on the canvas, storing nothing; `null` shows it as stored. */
function preview(value: number | null): void {
  showTransient(
    value === null || pin.named === null
      ? null
      : { block: pin.spec.block, command: rotationCommand(pin, value) },
  );
}

function toggleGroupstamp(): void {
  const target = namedAddress(pin);
  if (target !== null && groupstamp !== null) {
    const command = groupstampCommand(target, !groupstamp);
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

    <span class="key" id="{uid}-wedge">Wedge</span>
    <div class="field" data-testid="timestamp-rotation">
      <WedgeRotation
        value={rotation.value}
        stated={rotation.stated}
        disabled={unnamed || !wedgeShown}
        labelledby="{uid}-wedge"
        describedby={rotationDescribed}
        oncommit={rotate}
        onpreview={preview}
      />
      {#if !wedgeShown}
        <span class="hint" id="{uid}-wedge-off">Turn the Wedge on to rotate it.</span>
      {/if}
      <span class="problem" role="status">{drafts.problems.rotation ?? ""}</span>
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
