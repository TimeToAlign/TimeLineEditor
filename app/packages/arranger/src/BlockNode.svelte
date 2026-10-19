<script lang="ts">
import type { Drawing, DrawnBox } from "@timetoalign/tilie-layout";
import type { AttributeValue, Descriptor } from "@timetoalign/tilie-writers";
import { attributeText } from "@timetoalign/tilie-writers";
import type { NodeProps } from "@xyflow/svelte";
import { tick } from "svelte";
import type { Attachment } from "svelte/attachments";
import type { BandBox, Hover, Role } from "./boxes.ts";
import {
  boxOf,
  hitOf,
  holdingOf,
  hoverOf,
  isDisplayed,
  isHeld,
  isItem,
  NO_HOVER,
  offeredBands,
  roleOf,
  showsContainedSelection,
  showsSelection,
} from "./boxes.ts";
import { LEVELS } from "./containers.ts";
import { addressParts, bandTimelineOf } from "./editing.ts";
import type { GestureOptions } from "./gesture.ts";
import { drawingPoint, drawn, pointerGesture, sourceAt } from "./gesture.ts";
import { bandGesture } from "./gestures/band.ts";
import { cardDrawing, heldGesture } from "./gestures/held.ts";
import type { Ghost, NodeHost } from "./gestures/host.ts";
import { itemGesture } from "./gestures/item.ts";
import { slide } from "./motion.ts";
import { getNodeActions } from "./nodeActions.ts";
import type { BlockNode as BlockNodeType } from "./project.ts";

/** Svelte Flow passes every node prop; the node reads only its data. */
let { data }: Pick<NodeProps<BlockNodeType>, "data"> = $props();

const actions = getNodeActions();

const width = $derived(data.drawing.width * data.block.scale);
const height = $derived(data.drawing.height * data.block.scale);

/**
 * A descriptor attribute as the DOM receives it: numbers, points and path
 * data are written as the SVG writer writes them; strings are passed as they
 * are, since the DOM escapes nothing it sets through `setAttribute`.
 */
function domValue(value: AttributeValue): string {
  return typeof value === "string" ? value : attributeText(value);
}

/** One drawn descriptor with what every render reads of it, computed once per drawing. */
interface Entry {
  readonly descriptor: Descriptor;
  /** `<address>#<tag>#<n>`, `n` counting the earlier descriptors of that address and tag. */
  readonly key: string;
  /** The element address it carries (its source's), `null` for the background. */
  readonly address: string | null;
  readonly role: Role;
  readonly attributes: Readonly<Record<string, string>>;
  /** The frame or card whose own rectangle it draws; `undefined` for anything else. */
  readonly box: DrawnBox | undefined;
}

/** Whether a role is a box's own rectangle: a frame's or a card's, never a card's shadow. */
function isBoxShape(role: Role): boolean {
  return role === "frame" || role === "card";
}

/**
 * Each descriptor with a key that survives a redraw, so that a reorder of a
 * group's members or of a timeline's bands moves their elements, which
 * slide to their new places, rather than redrawing them.
 */
function keyed(drawing: Drawing, descriptors: readonly Descriptor[]): Entry[] {
  const seen = new Map<string, number>();
  return descriptors.map((descriptor) => {
    const { address } = descriptor.source;
    const role = roleOf(descriptor);
    const pair = `${address ?? ""}#${descriptor.tag}`;
    const n = seen.get(pair) ?? 0;
    seen.set(pair, n + 1);
    return {
      descriptor,
      key: `${pair}#${n}`,
      address,
      role,
      attributes: Object.fromEntries(
        descriptor.attrs.map(([name, value]) => [name, domValue(value)]),
      ),
      box: address !== null && isBoxShape(role) ? boxOf(drawing, address) : undefined,
    };
  });
}

const entries = $derived(keyed(data.drawing, data.descriptors));

/**
 * The entries a mark copies, by element address: each frame's and card's own
 * rectangle and each segment boundary's line.
 */
const shapes = $derived.by(() => {
  const found = new Map<string, Entry[]>();
  for (const entry of entries) {
    if (entry.address === null || (!isBoxShape(entry.role) && entry.role !== "boundary")) continue;
    found.set(entry.address, [...(found.get(entry.address) ?? []), entry]);
  }
  return found;
});

/** What the pointer highlights, held by address so that a redraw keeps the marks. */
let hover: Hover = $state.raw(NO_HOVER);

function show(next: Hover): void {
  if (next.box !== hover.box || next.boundary !== hover.boundary || next.band !== hover.band) {
    hover = next;
  }
}

/**
 * What the pointer is over: the descriptor under it and its drawing point.
 * Nothing is read while a button is held: a gesture, a pan or a marquee.
 */
function onpointermove(event: PointerEvent & { currentTarget: SVGSVGElement }) {
  if (event.buttons !== 0) return;
  const point = drawingPoint(event.currentTarget, { x: event.clientX, y: event.clientY });
  if (point === null) return;
  const hit = hitOf(data.block.id, data.drawing, sourceAt(event.target), point, data.editing);
  show(hoverOf(hit));
}

function onpointerleave() {
  show(NO_HOVER);
}

function isSelected(entry: Entry): boolean {
  return showsSelection(entry.role, entry.address, data.selectedElements);
}

/** Whether an element shows the selection on itself: any but a box, whose selection is a mark. */
function glows(entry: Entry): boolean {
  return !isBoxShape(entry.role) && isSelected(entry);
}

/** The block's own box, and its cards and frames, holding part of the selection. */
const holding = $derived(holdingOf(data.drawing, data.selectedElements));

function holdsSelection(entry: Entry): boolean {
  return showsContainedSelection(entry.role, entry.address, holding.boxes);
}

/**
 * The boxes whose holding mark is drawn: the block's background when the
 * block holds part of the selection, and the cards and frames holding part
 * of it that are not selected themselves, a selected box showing the
 * selection's mark instead.
 */
const holdingMarks = $derived(
  entries.filter((entry) =>
    entry.role === "box" ? holding.block : holdsSelection(entry) && !isSelected(entry),
  ),
);

/**
 * A mark over the drawing: a copy of a box's outline or a boundary's line,
 * with its kind. Every mark, a holding mark's and a band's too, is one
 * `.tilie-mark` element: `data-mark` its kind, `data-marks` the element
 * address it marks (none for the block's own box), `data-box` the container
 * it outlines (`box`, `frame`, `card`, `band`; none for a boundary).
 */
interface Mark {
  readonly entry: Entry;
  readonly mark: "selection" | "hover";
}

/** The selected frames and cards, each marked on its own rectangle. */
const selectionMarks: readonly Mark[] = $derived(
  entries.flatMap((entry) =>
    isBoxShape(entry.role) && isSelected(entry) ? [{ entry, mark: "selection" as const }] : [],
  ),
);

/**
 * The box and the boundary under the pointer inside the edited element; a
 * selected box keeps its selection's mark instead. A change of hover changes
 * these marks alone, never an element of the drawing.
 */
const hoverMarks: readonly Mark[] = $derived(
  [hover.box, hover.boundary].flatMap((address) =>
    address === null || !data.inside.has(address)
      ? []
      : (shapes.get(address) ?? []).flatMap((entry) =>
          entry.role === "boundary" || !isSelected(entry)
            ? [{ entry, mark: "hover" as const }]
            : [],
        ),
  ),
);

const OUTLINE = ["x", "y", "width", "height", "rx"];

/**
 * A mark's shape: its box's rectangle and corner radius, or its line with
 * every attribute but the address, so a mark is never read as the element.
 */
function shapeOf(entry: Entry): Record<string, string> {
  return Object.fromEntries(
    Object.entries(entry.attributes).filter(([name]) =>
      entry.descriptor.tag === "rect" ? OUTLINE.includes(name) : name !== "data-address",
    ),
  );
}

/** Whether the element lies under a selected one, and so goes with it on Delete. */
function isAffected(entry: Entry): boolean {
  return entry.address !== null && data.affectedElements.has(entry.address);
}

/**
 * What the open editor edits in this block: `null` for the whole block (the
 * bundle editor), `undefined` when no editor is open on this block.
 */
const edited = $derived.by(() => {
  if (data.editing === null) return undefined;
  const { block, element } = addressParts(data.editing.target);
  return block === data.block.id ? element : undefined;
});

/**
 * Whether the element lies outside the edited group or timeline, and so is
 * faded and lets the pointer through. Another block is outside as a whole,
 * through its node; the bundle editor edits everything its block draws.
 */
function isOutside(entry: Entry): boolean {
  if (edited == null) return false;
  return entry.address === null || !data.inside.has(entry.address);
}

/** The timeline whose bands this block offers (`bandTimelineOf`), else `null`. */
const bandTimeline = $derived(bandTimelineOf(data.block.id, data.editing));

/** A band marked over the drawing, with the selection's mark or the hover's. */
interface BandMark {
  readonly band: BandBox;
  readonly mark: "selection" | "hover";
}

/**
 * The bands marked over the drawing, as drawn: every selected band and the
 * band under the pointer among those this block offers, a selected band
 * showing the selection's mark under the pointer too. A band draws nothing
 * of its own; only its mark shows it.
 */
const bandMarks: readonly BandMark[] = $derived(
  bandTimeline === null
    ? []
    : offeredBands(data.drawing, bandTimeline).flatMap((band): BandMark[] => {
        if (data.selectedElements.has(band.address)) return [{ band, mark: "selection" }];
        return band.address === hover.band ? [{ band, mark: "hover" }] : [];
      }),
);

/**
 * A band mark's corner radius: that of the card holding the band, as the
 * cascade styles it; square where the card is not drawn.
 */
function radiusOf(drawing: Drawing, band: BandBox): number {
  const card = band.holder === null ? undefined : boxOf(drawing, band.holder);
  if (card === undefined || !isDisplayed(card)) return 0;
  const element = drawing.elements[card.range.start];
  return element?.type === "card" ? element.style.rx : 0;
}

/**
 * Whether the elements slide to their new places when the block is drawn
 * again: only while a reorder (of cards or of bands) previews an order, and
 * through the redraw of its drop or its abort, never under reduced motion.
 * Any other redraw (a resize's preview, an item drag, an edit, an undo)
 * moves them at once, so a preview is always exactly where the pointer put
 * it. Read by `slide`'s parameters when Svelte measures a move, so it is no
 * state.
 */
let sliding = false;

/** `slide`'s parameters for a move measured now. */
function slideParams(): { duration?: number } {
  return sliding && !actions.reducedMotion() ? {} : { duration: 0 };
}

/** The copy of a held card that follows the pointer while it is reordered. */
let ghost = $state.raw<Ghost | null>(null);

/** The descriptors of the reordered card where the preview draws it, hidden under its copy. */
const hidden: ReadonlySet<Descriptor> = $derived(
  new Set(ghost === null ? [] : cardDrawing(data.drawing, data.descriptors, ghost.card)),
);

/** The node's side of its gestures. */
const host: NodeHost = {
  actions,
  data: () => data,
  slide(on) {
    if (on) {
      sliding = true;
      return;
    }
    // The redraw of the drop or the abort still slides, the one after it does not,
    // unless a reorder has started again.
    void tick().then(() => {
      sliding = ghost !== null;
    });
  },
  ghost(next) {
    ghost = next;
  },
};

const options: GestureOptions = {
  dispatch: (command) => actions.dispatch(command),
  slot: actions.gestures,
};

/**
 * The gestures made, by what they move, so that a redraw of the block, a
 * preview's included, finds the same attachment and leaves the gesture in
 * progress.
 */
const made = new Map<string, Attachment<Element>>();

function once(key: string, make: () => Attachment<Element>): Attachment<Element> {
  let found = made.get(key);
  if (found === undefined) {
    found = make();
    made.set(key, found);
  }
  return found;
}

/**
 * The gesture of `box` in this block's editor, on the box's own rectangle:
 * at a level that moves items (`LEVELS`, the bundle editor) every item (a
 * frame, an ungrouped root's card) moves; at a level that reorders (a
 * group's editor) the cards the edited frame holds reorder. What the canvas
 * allows at the moment of a press (the lock, read-only) is the strategy's
 * question (`rulesOf`), never the attachment's.
 */
function gestureOf(box: DrawnBox | undefined): Attachment<Element> | undefined {
  if (box === undefined || box.key === null || edited === undefined || data.editing === null) {
    return undefined;
  }
  const offered = LEVELS[data.editing.kind];
  const { key } = box;
  if (offered.move && isItem(box)) {
    return once(`item ${key}`, () => pointerGesture(itemGesture(host, key), options));
  }
  if (offered.reorder && edited !== null && isHeld(box) && box.holder === edited) {
    const group = edited;
    return once(`held ${group} ${key}`, () =>
      pointerGesture(heldGesture(host, group, key), options),
    );
  }
  return undefined;
}

/** The band drag, made once: the `<svg>` it is attached to outlives every redraw. */
const bandMoves = pointerGesture(bandGesture(host), options);

/** A ghost's attributes: those of its descriptor, its address left out. */
function ghostAttributesOf(descriptor: Descriptor): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const [name, value] of descriptor.attrs) {
    if (name !== "data-address") attributes[name] = domValue(value);
  }
  return attributes;
}
</script>

<div
  class="tilie-block"
  data-testid="block"
  data-contains-selection={holding.block ? "" : undefined}
>
  <!--
    The pointer handlers only show which box, boundary or band the pointer
    is over; they act on nothing, so the drawing keeps its own role.
  -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <svg
    {width}
    {height}
    viewBox="0 0 {data.drawing.width} {data.drawing.height}"
    {onpointermove}
    {onpointerleave}
    {@attach bandMoves}
  >
    {#each entries as entry (entry.key)}
      <svelte:element
        this={entry.descriptor.tag}
        {...entry.attributes}
        visibility={hidden.has(entry.descriptor) ? "hidden" : undefined}
        data-selected={glows(entry) ? "" : undefined}
        data-affected={isAffected(entry) ? "" : undefined}
        data-outside={isOutside(entry) ? "" : undefined}
        {@attach drawn(entry.descriptor.source)}
        {@attach gestureOf(entry.box)}
        animate:slide={slideParams()}>{entry.descriptor.text}</svelte:element
      >
    {/each}
    {#each holdingMarks as entry (entry.key)}
      <rect
        {...shapeOf(entry)}
        class="tilie-mark"
        data-mark="holding"
        data-marks={entry.address}
        data-box={entry.role}
        aria-hidden="true"
      />
    {/each}
    {#each [...selectionMarks, ...hoverMarks] as { entry, mark } (`${mark} ${entry.key}`)}
      <svelte:element
        this={entry.descriptor.tag}
        {...shapeOf(entry)}
        class="tilie-mark"
        data-mark={mark}
        data-marks={entry.address}
        data-box={isBoxShape(entry.role) ? entry.role : undefined}
        aria-hidden="true"
      />
    {/each}
    {#each bandMarks as { band, mark } (band)}
      <rect
        class="tilie-mark"
        data-mark={mark}
        data-marks={band.address}
        data-box="band"
        x={band.x}
        y={band.y}
        width={band.width}
        height={band.height}
        rx={radiusOf(data.drawing, band)}
        aria-hidden="true"
      />
    {/each}
    {#if ghost !== null}
      <g
        class="tilie-dragged"
        transform="translate({ghost.offset.x} {ghost.offset.y})"
        pointer-events="none"
        aria-hidden="true"
      >
        {#each ghost.descriptors as descriptor (descriptor)}
          <svelte:element this={descriptor.tag} {...ghostAttributesOf(descriptor)}
            >{descriptor.text}</svelte:element
          >
        {/each}
      </g>
    {/if}
  </svg>
</div>
