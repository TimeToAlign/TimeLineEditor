<script lang="ts">
/*
 * The handles of the one selected region: a handle at each end of every
 * brace drawn of it whose card's axis reads that end back as the region's
 * own (`gestures/region.ts`), at the ordinate of the brace's arms. Like the
 * handles of an elision's gap they are our own elements in a viewport
 * portal, each driving the canvas's one pointer gesture with the region
 * strategy; the canvas draws the block as the command of the value leaves
 * it, so the preview is what the release stores. The handles stand on the
 * stored drawing, so none is unmounted while it is dragged; the dragged one
 * follows the preview. None for an atomic section (read only), nor while
 * the canvas is locked or read only.
 */
import type { Granularity } from "@timetoalign/tilie-core";
import { placeKeyText } from "@timetoalign/tilie-core";
import { useStore, ViewportPortal } from "@xyflow/svelte";
import type { Attachment } from "svelte/attachments";
import EdgeHandle from "./EdgeHandle.svelte";
import { addressParts } from "./editing.ts";
import type { GestureOptions } from "./gesture.ts";
import { pointerGesture } from "./gesture.ts";
import type { RegionEdge, RegionHost, RegionLive, RegionSubject } from "./gestures/region.ts";
import { handlePoint, regionGesture, regionSubjectsOf } from "./gestures/region.ts";
import type { BlockNode } from "./node.ts";
import { getNodeActions } from "./nodeActions.ts";
import type { Selection } from "./selection.ts";

interface Props {
  /** The canvas's selection: one region of it takes handles. */
  selection: Selection;
  /** The block nodes as stored, by block. */
  nodes: ReadonlyMap<string, BlockNode>;
  zoom: number;
  /** How finely a dragged end picks its value. */
  granularity: Granularity;
  /** While locked no handle is shown. */
  locked: boolean;
}

let { selection, nodes, zoom, granularity, locked }: Props = $props();

const actions = getNodeActions();
const flow = useStore();

/** One handle: its key, its brace, its end, and its place on the canvas. */
interface Shown {
  readonly key: string;
  readonly subject: RegionSubject;
  readonly edge: RegionEdge;
  readonly x: number;
  readonly y: number;
}

/** The one selected region's node and braces; `null` for any other selection. */
const selected = $derived.by(() => {
  if (selection.size !== 1) return null;
  const [address] = selection.values();
  if (address === undefined || address.block === undefined) return null;
  const { block, element } = addressParts(address);
  const node = nodes.get(block);
  if (element === null || node === undefined) return null;
  const subjects = regionSubjectsOf(node.data.block.manifest, node.data.drawing, element);
  return subjects.length === 0 ? null : { node, subjects };
});

const handles: readonly Shown[] = $derived.by(() => {
  if (selected === null) return [];
  const { node, subjects } = selected;
  const { scale } = node.data.block;
  return subjects.flatMap((subject) =>
    subject.edges.map((edge): Shown => {
      const at = handlePoint(subject.piece.element, edge);
      return {
        key: `${placeKeyText(subject.piece.card)} ${subject.piece.nth} ${edge}`,
        subject,
        edge,
        x: node.position.x + at.x * scale,
        y: node.position.y + at.y * scale,
      };
    }),
  );
});

/** The handle dragged and where the preview draws it; `null` while none is. */
let dragged: { readonly key: string; readonly live: RegionLive } | null = $state.raw(null);

/** A handle's place: the preview's while it is the one dragged. */
function placeOf(shown: Shown): { x: number; y: number } {
  return dragged?.key === shown.key ? dragged.live.at : shown;
}

const options: GestureOptions = {
  dispatch: (command) => actions.dispatch(command),
  slot: actions.gestures,
};

/**
 * One gesture per handle, made once, so a redraw leaves a drag in progress;
 * keyed by its card, brace and end, which a redraw keeps.
 */
const gestures = new Map<string, Attachment<Element>>();

function gestureOf(shown: Shown): Attachment<Element> {
  let found = gestures.get(shown.key);
  if (found === undefined) {
    const { key, edge } = shown;
    const host: RegionHost = {
      actions,
      target: () => {
        const current = handles.find((each) => each.key === key);
        return current === undefined || selected === null
          ? undefined
          : { node: selected.node, subject: current.subject };
      },
      viewport: () => flow.viewport,
      granularity: () => granularity,
      live: (live) => {
        dragged = live === null ? null : { key, live };
      },
    };
    found = pointerGesture(regionGesture(host, edge), options);
    gestures.set(key, found);
  }
  return found;
}
</script>

{#if !locked && handles.length > 0}
  <ViewportPortal target="front" class="tilie-overlay">
    {#each handles as shown (shown.key)}
      {@const at = placeOf(shown)}
      <EdgeHandle
        x={at.x}
        y={at.y}
        {zoom}
        testid="region-handle-{shown.edge}"
        hidden={dragged !== null && dragged.key !== shown.key}
        {@attach gestureOf(shown)}
      />
    {/each}
  </ViewportPortal>
{/if}

