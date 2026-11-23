<script lang="ts">
/*
 * The handles of a selected stored elision and its mode menu. Each gap of
 * it that takes handles (a card elision's in its card, a group elision's in
 * its frame) shows one on each edge it reaches, at the ordinate of the
 * elision's timeline's line; above the first of them stands the mode menu,
 * the resize toolbar's own (`ModeMenu`), with the two toggles Coordinates
 * and Width, never neither. Like the resize handles they are our own
 * elements in a viewport portal, each driving the canvas's one pointer
 * gesture with the gap strategy; the canvas draws the block as the command
 * of the value leaves it, so the preview is what the release stores. The
 * handles stand on the stored drawing, so none is unmounted while it is
 * dragged; the dragged one follows the preview.
 */
import type { ElementAddress, Granularity } from "@timetoalign/tilie-core";
import { placeKeyText } from "@timetoalign/tilie-core";
import { useStore, ViewportPortal } from "@xyflow/svelte";
import type { Attachment } from "svelte/attachments";
import type { GapEdge, GapModes, GapPiece } from "./gaps.ts";
import { piecesOf, subjectOf } from "./gaps.ts";
import type { GestureOptions } from "./gesture.ts";
import { pointerGesture } from "./gesture.ts";
import type { GapHost, GapLive } from "./gestures/gap.ts";
import { gapGesture, handleOrdinate } from "./gestures/gap.ts";
import ModeMenu from "./ModeMenu.svelte";
import type { BlockNode } from "./node.ts";
import { getNodeActions } from "./nodeActions.ts";

interface Props {
  /** The block node holding the elision, as stored. */
  node: BlockNode;
  /** The selected elision's address in the node's manifest. */
  address: ElementAddress;
  zoom: number;
  /** How finely a dragged edge picks its value. */
  granularity: Granularity;
  /** What a drag changes: the canvas's gap modes. */
  modes: GapModes;
  /** While locked the mode buttons are disabled and no handle is shown. */
  locked: boolean;
  /** Presses or releases a gap mode. */
  ontoggle: (mode: keyof GapModes) => void;
  /** Hears the dragged handle's place and value while it moves; `null` once the drag ends. */
  onlive: (live: GapLive | null) => void;
}

let { node, address, zoom, granularity, modes, locked, ontoggle, onlive }: Props = $props();

const actions = getNodeActions();
const flow = useStore();

/** One handle: its key, the piece it belongs to, its edge, and its place on the canvas. */
interface Shown {
  readonly key: string;
  readonly piece: GapPiece;
  readonly edge: GapEdge;
  readonly x: number;
  readonly y: number;
}

/** The gaps of the elision that take handles, with the edges each reaches, on the canvas. */
const pieces = $derived.by(() => {
  const { block, drawing } = node.data;
  const at = (x: number, y: number) => ({
    x: node.position.x + x * block.scale,
    y: node.position.y + y * block.scale,
  });
  return piecesOf(drawing, address).flatMap((piece) => {
    const subject = subjectOf(block.manifest, drawing, piece);
    if (subject === null || subject.edges.length === 0) return [];
    const y = handleOrdinate(drawing, piece, subject.timeline.id);
    const handles = subject.edges.map(
      (edge): Shown => ({
        key: `${placeKeyText(piece.exposure.key)} ${edge}`,
        piece,
        edge,
        ...at(edge === "start" ? piece.gap.x1 : piece.gap.x2, y),
      }),
    );
    const { yt, yb } = piece.element;
    const top = at(piece.gap.x1, yt);
    const bounds = {
      ...top,
      width: (piece.gap.x2 - piece.gap.x1) * block.scale,
      height: (yb - yt) * block.scale,
    };
    return [{ piece, handles, bounds }];
  });
});

const handles: readonly Shown[] = $derived(pieces.flatMap((piece) => piece.handles));

/** The box the mode menu stands above: the first gap taking handles. */
const menuBounds = $derived(pieces[0]?.bounds ?? null);

/** The handle dragged and where the preview draws it; `null` while none is. */
let dragged: { readonly key: string; readonly live: GapLive } | null = $state.raw(null);

/** A handle's place: the preview's while it is the one dragged. */
function placeOf(shown: Shown): { x: number; y: number } {
  return dragged?.key === shown.key ? dragged.live.at : shown;
}

/** The hit area of a handle and its visible mark, in screen pixels. */
const HIT = 24;
const MARK = 9;

const MODES: readonly { value: keyof GapModes; label: string; key: string; hint: string }[] = [
  {
    value: "coordinates",
    label: "Coordinates",
    key: "1",
    hint: "a dragged edge moves the elided coordinates",
  },
  { value: "width", label: "Width", key: "2", hint: "a dragged edge moves the gap's width" },
];

const options: GestureOptions = {
  dispatch: (command) => actions.dispatch(command),
  slot: actions.gestures,
};

/**
 * One gesture per handle, made once, so a redraw leaves a drag in progress;
 * keyed by its container and edge, which a redraw keeps (a piece's index
 * moves), so the cache holds at most two per container.
 */
const gestures = new Map<string, Attachment<Element>>();

function gestureOf(shown: Shown): Attachment<Element> {
  let found = gestures.get(shown.key);
  if (found === undefined) {
    const { key, edge } = shown;
    const host: GapHost = {
      actions,
      target: () => {
        const current = handles.find((each) => each.key === key);
        return current === undefined ? undefined : { node, piece: current.piece };
      },
      viewport: () => flow.viewport,
      granularity: () => granularity,
      modes: () => modes,
      live: (live) => {
        dragged = live === null ? null : { key, live };
        onlive(live);
      },
    };
    found = pointerGesture(gapGesture(host, edge), options);
    gestures.set(key, found);
  }
  return found;
}
</script>

{#if menuBounds !== null}
  <ModeMenu
    label="Gap mode"
    entries={MODES}
    pressed={(value) => modes[value]}
    disabled={locked}
    bounds={menuBounds}
    testid="gap-mode"
    onpress={ontoggle}
  />
{/if}

{#if !locked}
  <ViewportPortal target="front" class="tilie-overlay">
    {#each handles as shown (shown.key)}
      {@const at = placeOf(shown)}
      <div
        class="handle nodrag nopan nowheel"
        aria-hidden="true"
        data-testid="gap-handle-{shown.edge}"
        data-piece={shown.piece.index}
        hidden={dragged !== null && dragged.key !== shown.key}
        style:left="{at.x}px"
        style:top="{at.y}px"
        style:width="{HIT / zoom}px"
        style:height="{HIT / zoom}px"
        style:--mark="{MARK / zoom}px"
        style:--line="{1 / zoom}px"
        {@attach gestureOf(shown)}
      ></div>
    {/each}
  </ViewportPortal>
{/if}

<style>
  .handle {
    position: absolute;
    transform: translate(-50%, -50%);
    touch-action: none;
    pointer-events: all;
    cursor: ew-resize;
  }

  .handle[hidden] {
    display: none;
  }

  /* A handle is a small square on the elision's line at the gap's edge, as the resize handles. */
  .handle::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    width: var(--mark);
    height: var(--mark);
    transform: translate(-50%, -50%);
    box-sizing: border-box;
    background: #fff;
    border: var(--line) solid #0a84ff;
  }
</style>
