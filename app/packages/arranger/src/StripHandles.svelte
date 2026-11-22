<script lang="ts">
/*
 * The handles of the selected strip of an elision, each piece drawing it with its own: an extent
 * handle on its top edge at each edge it moves (a stored elision's start or end only on the piece
 * reaching it) and a width grip at its bottom right. Like the resize handles they are our own
 * elements in a viewport portal, each driving the canvas's one pointer gesture with the strip
 * strategy; the canvas draws the block as the command of the value leaves it, so the preview is
 * what the release stores. The handles stand on the stored drawing, so none is unmounted while it
 * is dragged; the dragged one follows the preview.
 */
import type { ElementAddress, Granularity } from "@timetoalign/tilie-core";
import { useStore, ViewportPortal } from "@xyflow/svelte";
import type { Attachment } from "svelte/attachments";
import type { GestureOptions } from "./gesture.ts";
import { pointerGesture } from "./gesture.ts";
import type { StripHandle, StripHost, StripLive } from "./gestures/strip.ts";
import { stripGesture } from "./gestures/strip.ts";
import type { BlockNode } from "./node.ts";
import { getNodeActions } from "./nodeActions.ts";
import type { StripPiece } from "./strips.ts";
import { piecesOf, subjectOf } from "./strips.ts";

interface Props {
  /** The block node holding the strip, as stored. */
  node: BlockNode;
  /** The selected strip's address in the node's manifest. */
  address: ElementAddress;
  zoom: number;
  /** How finely a dragged edge picks its value. */
  granularity: Granularity;
  /** Hears the dragged handle's place and value while it moves; `null` once the drag ends. */
  onlive: (live: StripLive | null) => void;
}

let { node, address, zoom, granularity, onlive }: Props = $props();

const actions = getNodeActions();
const flow = useStore();

/** One handle: its key, the piece it belongs to, which handle it is, and its place on the canvas. */
interface Shown {
  readonly key: string;
  readonly piece: StripPiece;
  readonly handle: StripHandle;
  readonly x: number;
  readonly y: number;
}

const CURSORS: { readonly [handle in StripHandle]: string } = {
  start: "ew-resize",
  end: "ew-resize",
  width: "col-resize",
};

/** Every handle of every piece drawing the strip, on the canvas. */
const handles: readonly Shown[] = $derived.by(() => {
  const { block, drawing } = node.data;
  const at = (x: number, y: number) => ({
    x: node.position.x + x * block.scale,
    y: node.position.y + y * block.scale,
  });
  return piecesOf(drawing, address).flatMap((piece): Shown[] => {
    const subject = subjectOf(block.manifest, piece);
    if (subject === null) return [];
    const { x1, x2, yt, yb } = piece.element;
    const edges = subject.edges.map(
      (edge): Shown => ({
        key: `${piece.index}:${edge}`,
        piece,
        handle: edge,
        ...at(edge === "start" ? x1 : x2, yt),
      }),
    );
    return [...edges, { key: `${piece.index}:width`, piece, handle: "width", ...at(x2, yb) }];
  });
});

/** The handle dragged and where the preview draws it; `null` while none is. */
let dragged: { readonly key: string; readonly live: StripLive } | null = $state.raw(null);

/** A handle's place: the preview's while it is the one dragged. */
function placeOf(shown: Shown): { x: number; y: number } {
  return dragged?.key === shown.key ? dragged.live.at : shown;
}

/** The hit area of a handle and its visible mark, in screen pixels. */
const HIT = 24;
const MARK = 9;

const options: GestureOptions = {
  dispatch: (command) => actions.dispatch(command),
  slot: actions.gestures,
};

/** One gesture per handle, made once, so a redraw leaves a drag in progress. */
const gestures = new Map<string, Attachment<Element>>();

function gestureOf(shown: Shown): Attachment<Element> {
  let found = gestures.get(shown.key);
  if (found === undefined) {
    const { key, handle } = shown;
    const host: StripHost = {
      actions,
      target: () => {
        const current = handles.find((each) => each.key === key);
        return current === undefined ? undefined : { node, piece: current.piece };
      },
      viewport: () => flow.viewport,
      granularity: () => granularity,
      live: (live) => {
        dragged = live === null ? null : { key, live };
        onlive(live);
      },
    };
    found = pointerGesture(stripGesture(host, handle), options);
    gestures.set(key, found);
  }
  return found;
}
</script>

<ViewportPortal target="front" class="tilie-overlay">
  {#each handles as shown (shown.key)}
    {@const at = placeOf(shown)}
    <div
      class={["handle", "nodrag", "nopan", "nowheel", shown.handle === "width" ? "grip" : "extent"]}
      aria-hidden="true"
      data-testid="strip-handle-{shown.handle}"
      data-piece={shown.piece.index}
      hidden={dragged !== null && dragged.key !== shown.key}
      style:left="{at.x}px"
      style:top="{at.y}px"
      style:width="{HIT / zoom}px"
      style:height="{HIT / zoom}px"
      style:cursor={CURSORS[shown.handle]}
      style:--mark="{MARK / zoom}px"
      style:--line="{1 / zoom}px"
      {@attach gestureOf(shown)}
    ></div>
  {/each}
</ViewportPortal>

<style>
  .handle {
    position: absolute;
    transform: translate(-50%, -50%);
    touch-action: none;
    pointer-events: all;
  }

  .handle[hidden] {
    display: none;
  }

  .handle::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    width: var(--mark);
    height: var(--mark);
    box-sizing: border-box;
    background: #fff;
    border: var(--line) solid #0a84ff;
  }

  /* An extent handle is a diamond on the strip's top edge, the width grip a square at its foot. */
  .extent::after {
    transform: translate(-50%, -50%) rotate(45deg);
  }

  .grip::after {
    transform: translate(-50%, -50%);
  }
</style>
