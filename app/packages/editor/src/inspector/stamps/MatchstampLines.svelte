<script lang="ts">
/**
 * The Matchstamp tab's Lines: every dashed line of the MatchStamp shown,
 * in screen order (`stampLines`), timestamp lines and anchor lines as they
 * occur. A timestamp's entry names its timeline, its coordinate and its
 * match timestamp, with the Timestamp tab's display toggles and, where its
 * timeline lies in a group, the Timestamp tab's GroupStamp toggle (pressed
 * while a potential MatchStamp waits for a name where naming stores a
 * GroupStamp); one shared with other named MatchStamps says that a change
 * shows there too. An
 * anchor's entry names its two timelines and its ID, with the toggles Line
 * and Name; an anchor the current table no longer states is marked red.
 * Every toggle waits for the MatchStamp to be named.
 */
import type { LiveStore } from "@timetoalign/tilie-arranger";
import type { AnchorDisplay, TimestampDisplay } from "@timetoalign/tilie-core";
import { DEFAULTS, TIMESTAMP_DISPLAY } from "@timetoalign/timetoshare";
import type { AnchorLine, StampLine, TimestampLine } from "../matchstampLines.ts";
import type { ShownStamp } from "../matchstamps.ts";
import { anchorDisplayCommand } from "../matchstamps.ts";
import {
  DISPLAY_WORDS,
  GROUPSTAMP_WORDS,
  groupstampCommand,
  groupstampHint,
} from "../timestamp.ts";
import { dispatchMatchStamp, displayCommand } from "./commands.ts";
import DisplayToggles from "./DisplayToggles.svelte";
import type { StampDrafts } from "./drafts.svelte.ts";

interface Props {
  /** The open workspace's store, read as Svelte state. */
  live: LiveStore;
  /** The MatchStamp shown. */
  stamp: ShownStamp;
  /** Its lines, in screen order. */
  lines: readonly StampLine[];
  /** The tab's drafts: the refusal of a line's toggle, under the line's key. */
  drafts: StampDrafts<unknown>;
  /** The ID of the hint saying why the toggles wait for a name; `undefined` once named. */
  describedby: string | undefined;
}

let { live, stamp, lines, drafts, describedby }: Props = $props();

const uid = $props.id();

/** The toggles of an anchor's display. */
const ANCHOR_TOGGLES: readonly { readonly word: AnchorDisplay; readonly label: string }[] = [
  { word: "line", label: "Line" },
  { word: "name", label: "Name" },
];

/** What a match timestamp of a potential MatchStamp displays once naming stores it. */
const MATCH_DISPLAY: readonly TimestampDisplay[] = DEFAULTS.match_timestamp.display;

function toggleAnchor(line: AnchorLine, word: AnchorDisplay): void {
  const { id, display } = line.anchor;
  if (id === null || display === null) return;
  const command = anchorDisplayCommand(stamp.block, id, display, word);
  drafts.send(line.key, () => dispatchMatchStamp(live, stamp.block, command));
}

function toggleTimestamp(line: TimestampLine, word: TimestampDisplay): void {
  const { timestamp } = line;
  if (timestamp === null) return;
  const target = { block: stamp.block, id: timestamp.id };
  const command = displayCommand(target, TIMESTAMP_DISPLAY, timestamp.display, word);
  drafts.send(line.key, () => dispatchMatchStamp(live, stamp.block, command));
}

function toggleGroupstamp(line: TimestampLine): void {
  const { timestamp, groupstamp } = line;
  if (timestamp === null || groupstamp === null) return;
  const command = groupstampCommand({ block: stamp.block, id: timestamp.id }, !groupstamp.on);
  drafts.send(line.key, () => dispatchMatchStamp(live, stamp.block, command));
}

/** The names of MatchStamps, quoted, in words. */
function named(items: readonly { readonly name: string }[]): string {
  return items.map((item) => `'${item.name}'`).join(", ");
}
</script>

<section class={["area", "lines", { unnamed: stamp.id === null }]} aria-labelledby="{uid}-lines">
  <h3 id="{uid}-lines">Lines</h3>
  <ol aria-labelledby="{uid}-lines">
    {#each lines as line, at (line.key)}
      {@const head = `${uid}-${at}`}
      {#if line.kind === "timestamp"}
        {@const { timestamp } = line}
        <li class="timestamp" data-line="timestamp" data-timestamp={timestamp?.id}>
          <span class="line-name" id={head}
            >{line.name} <span class="value">{line.value}</span> {#if timestamp !== null}<code
                class="stamp-code">{timestamp.id}</code
              >{/if}</span
          >
          <DisplayToggles
            words={DISPLAY_WORDS}
            display={timestamp?.display ?? MATCH_DISPLAY}
            disabled={timestamp === null}
            labelledby={head}
            {describedby}
            ontoggle={(word) => toggleTimestamp(line, word)}
          />
          {#if line.groupstamp !== null}
            {@const hint = `${head}-groupstamp`}
            <span class="groupstamp">
              <DisplayToggles
                words={GROUPSTAMP_WORDS}
                display={line.groupstamp.on ? ["groupstamp"] : []}
                disabled={timestamp === null}
                labelledby={head}
                describedby={describedby === undefined ? hint : `${hint} ${describedby}`}
                ontoggle={() => toggleGroupstamp(line)}
              />
              <span class="hint" id={hint}>{groupstampHint(line.groupstamp.groups)}</span>
            </span>
          {/if}
          {#if line.shared.length > 0}
            <span class="hint shared"
              >Also a line of {line.shared.length === 1 ? "MatchStamp" : "MatchStamps"}
              {named(line.shared)}: a change shows there too.</span
            >
          {/if}
          <span class="problem" role="status">{drafts.problems[line.key] ?? ""}</span>
        </li>
      {:else}
        {@const { anchor } = line}
        {@const gone = anchor.stated === false}
        <li class={["anchor", { gone }]} data-line="anchor" data-anchor={anchor.id}>
          <span class="line-name" id={head}
            >{line.names[0]} – {line.names[1]} {#if anchor.id !== null}<code
                class="stamp-code">{anchor.id}</code
              >{/if}</span
          >
          {#if gone}<span class="gone-word">not stated by the table</span>{/if}
          <DisplayToggles
            words={ANCHOR_TOGGLES}
            display={anchor.display ?? []}
            disabled={anchor.id === null || anchor.display === null}
            labelledby={head}
            {describedby}
            ontoggle={(word) => toggleAnchor(line, word)}
          />
          <span class="problem" role="status">{drafts.problems[line.key] ?? ""}</span>
        </li>
      {/if}
    {/each}
  </ol>
</section>

<style>
  ol {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 0.5rem;
    padding: 0.3rem 0 0.3rem 0.5rem;
    border-left: 2px dashed #c8c8c8;
  }

  /* An anchor's connector is set in, between the two timestamps it joins. */
  li.anchor {
    margin-left: 1rem;
  }

  .value {
    font-variant-numeric: tabular-nums;
  }

  /* The GroupStamp toggle on a line of its own, with what the GroupStamp crosses. */
  .groupstamp {
    display: inline-flex;
    flex-basis: 100%;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 0.5rem;
  }

  .groupstamp .hint {
    font-size: 0.75rem;
  }

  .shared,
  .problem {
    flex-basis: 100%;
    font-size: 0.75rem;
  }

  /* An anchor the current table no longer states: the drawing's red. */
  li.gone .line-name,
  .gone-word {
    color: #e51400;
  }

  li.gone {
    border-left-color: #e51400;
  }

  .gone-word {
    font-size: 0.75rem;
  }
</style>
