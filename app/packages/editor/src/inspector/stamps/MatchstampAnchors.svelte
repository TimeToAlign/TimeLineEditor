<script lang="ts">
/**
 * The Matchstamp tab's Alignment anchors: each anchor of the MatchStamp
 * shown, its two timelines and ID, with the toggles of its display (`line`,
 * `name`), disabled until the MatchStamp is named; an anchor the current
 * table no longer states is marked red.
 */
import type { LiveStore } from "@timetoalign/tilie-arranger";
import type { AnchorDisplay } from "@timetoalign/tilie-core";
import type { ShownStamp } from "../matchstamps.ts";
import { anchorDisplayCommand } from "../matchstamps.ts";
import { dispatchMatchStamp } from "./commands.ts";
import DisplayToggles from "./DisplayToggles.svelte";
import type { StampDrafts } from "./drafts.svelte.ts";

interface Props {
  /** The open workspace's store, read as Svelte state. */
  live: LiveStore;
  /** The MatchStamp shown. */
  stamp: ShownStamp;
  /** A timeline's name, else its ID. */
  timelineName: (timeline: string) => string;
  /** The tab's drafts: the refusal of an anchor's toggle, under the anchor's ID. */
  drafts: StampDrafts<unknown>;
  /** The ID of the hint saying why the toggles wait for a name; `undefined` once named. */
  describedby: string | undefined;
}

let { live, stamp, timelineName, drafts, describedby }: Props = $props();

const uid = $props.id();

/** The toggles of an anchor's display. */
const ANCHOR_TOGGLES: readonly { readonly word: AnchorDisplay; readonly label: string }[] = [
  { word: "line", label: "Line" },
  { word: "name", label: "Name" },
];

function toggle(anchor: string, display: readonly AnchorDisplay[], word: AnchorDisplay): void {
  const command = anchorDisplayCommand(stamp.block, anchor, display, word);
  drafts.send(anchor, () => dispatchMatchStamp(live, stamp.block, command));
}
</script>

<section class={["area", "anchors", { unnamed: stamp.id === null }]} aria-labelledby="{uid}-anchors">
  <h3 id="{uid}-anchors">Alignment anchors</h3>
  <ul aria-labelledby="{uid}-anchors">
    {#each stamp.anchors as anchor (anchor.key)}
      {@const [first, second] = anchor.coordinates}
      {@const gone = anchor.stated === false}
      <li class={{ gone }} data-anchor={anchor.id}>
        <span class="anchor-name"
          >{timelineName(first.timeline)} – {timelineName(second.timeline)}{#if anchor.id !== null}
            <code class="stamp-code">{anchor.id}</code>{/if}</span
        >
        {#if gone}<span class="gone-word">not stated by the table</span>{/if}
        <DisplayToggles
          words={ANCHOR_TOGGLES}
          display={anchor.display ?? []}
          disabled={anchor.id === null || anchor.display === null}
          label="Display of {anchor.id ?? 'the anchor'}"
          {describedby}
          ontoggle={(word) => {
            if (anchor.id !== null && anchor.display !== null) {
              toggle(anchor.id, anchor.display, word);
            }
          }}
        />
        {#if anchor.id !== null && drafts.problems[anchor.id] !== undefined}
          <span class="problem" role="status">{drafts.problems[anchor.id]}</span>
        {/if}
      </li>
    {/each}
  </ul>
</section>

<style>
  ul {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 0.5rem;
  }

  /* An anchor the current table no longer states: the drawing's red. */
  li.gone .anchor-name,
  .gone-word {
    color: #e51400;
  }

  .gone-word {
    font-size: 0.75rem;
  }
</style>
