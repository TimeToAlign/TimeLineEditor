<script lang="ts">
import type { ElementAddress, Manifest } from "@timetoalign/tilie-core";
import { addressKey, placedElement, placeKeyText, samePlaceKey } from "@timetoalign/tilie-core";
import type { Drawing, DrawnBox } from "@timetoalign/tilie-layout";
import { TextMeasure } from "@timetoalign/tilie-layout";
import type { AttributeValue, Descriptor } from "@timetoalign/tilie-writers";
import { ADDRESS_ATTRIBUTES, attributeText } from "@timetoalign/tilie-writers";
import type { NodeProps } from "@xyflow/svelte";
import { tick } from "svelte";
import type { Attachment } from "svelte/attachments";
import { CardMotions } from "./animation/cardMotions.svelte.ts";
import { placedAttributes } from "./animation/elide.ts";
import type { CardUnfold } from "./animation/raise.ts";
import { raiseUnfold } from "./animation/raise.ts";
import { AT_REST, composed, frameAt, framePlaced, rectAt } from "./animation/unfold.ts";
import { Unfolding } from "./animation/unfolding.svelte.ts";
import type { BandBox, Hover, Role } from "./boxes.ts";
import {
  bandUnder,
  boxKey,
  hitOf,
  holdingOf,
  hoverOf,
  isAffordance,
  isBand,
  isDisplayed,
  isHeld,
  isHoveredBand,
  isItem,
  keyedBox,
  NO_HOVER,
  pressSelection,
  raisedRoot,
  roleOf,
  shapeBox,
  showsContainedSelection,
  showsSelection,
} from "./boxes.ts";
import { LEVELS } from "./containers.ts";
import { affordancesOf, HIT_TOLERANCE } from "./coordinates.ts";
import { raisedLayers } from "./drawing.ts";
import { addressParts, bandTimelineOf } from "./editing.ts";
import { flowOverlays, OVERLAY_LABEL_SIZE } from "./flowOverlay.ts";
import { SwitchMotion } from "./flowSwitchMotion.svelte.ts";
import type { GestureOptions } from "./gesture.ts";
import { drawingPoint, drawn, pointerGesture, sourceAt } from "./gesture.ts";
import { bandGesture } from "./gestures/band.ts";
import { cardDrawing, heldGesture } from "./gestures/held.ts";
import type { Ghost, NodeHost } from "./gestures/host.ts";
import { movedItemGesture } from "./gestures/item.ts";
import { OUT_OF_DATE_MARK } from "./matches.ts";
import { settle, slide } from "./motion.ts";
import type { BlockNode as BlockNodeType } from "./node.ts";
import { getNodeActions } from "./nodeActions.ts";
import Ribbons from "./Ribbons.svelte";
import type { ChunkRef, LitChunk } from "./ribbons.ts";
import { allLights, chunkOf, chunksAt, chunkZones, litSpans } from "./ribbons.ts";
import { type Owner, ownerOf } from "./selectionRules.ts";

/** Svelte Flow passes every node prop; the node reads only its data. */
let { data }: Pick<NodeProps<BlockNodeType>, "data"> = $props();

/** This node's own prefix for the IDs its drawing defines (the clips of raised cards). */
const uid = $props.id();

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
  /**
   * `<address key>#<tag>#<n>`, `n` counting the earlier descriptors of that address and tag
   * (`addressKey`).
   */
  readonly key: string;
  /** The element address it carries (its source's), `{}` for the background. */
  readonly address: ElementAddress;
  /** Its address's key (`addressKey`), computed once per drawing. */
  readonly addressKey: string;
  readonly role: Role;
  readonly attributes: Readonly<Record<string, string>>;
  /** The frame or card whose own rectangle it draws; `undefined` for anything else. */
  readonly box: DrawnBox | undefined;
  /** The named timestamp or MatchStamp it draws a part of (`ownerOf`); `null` for anything else. */
  readonly owner: Owner | null;
  /**
   * The keys of the addresses whose selection it shows: its owner's and what
   * a press on it selects (`Owner.selects`); none without an owner.
   */
  readonly ownerKeys: readonly string[];
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
function keyed(manifest: Manifest, drawing: Drawing, descriptors: readonly Descriptor[]): Entry[] {
  const seen = new Map<string, number>();
  return descriptors.map((descriptor) => {
    const { address, element } = descriptor.source;
    const role = roleOf(descriptor);
    const owner = ownerOf(manifest, address);
    const key = addressKey(address);
    const pair = `${key}#${descriptor.tag}`;
    const n = seen.get(pair) ?? 0;
    seen.set(pair, n + 1);
    return {
      descriptor,
      key: `${pair}#${n}`,
      address,
      addressKey: key,
      role,
      attributes: Object.fromEntries(
        descriptor.attrs.map(([name, value]) => [name, domValue(value)]),
      ),
      box: isBoxShape(role) ? shapeBox(drawing, element) : undefined,
      owner,
      ownerKeys: owner === null ? [] : [...new Set([owner.address, owner.selects].map(addressKey))],
    };
  });
}

/** The canvas's text measure, for the out-of-date marks and the bounds of a raised card. */
const measure = new TextMeasure(actions.metrics);

/**
 * The raise of a root's ancestor cards over the frames while one of its
 * timelines lying in no group is edited (`raisedRoot`), unfolding out of
 * the member cards and folding back into them (decision record 0034).
 */
const unfolding = new Unfolding(
  () => raisedRoot(data.block, data.editing),
  () => actions.reducedMotion(),
);

/**
 * The block's elisions moving (decision record 0034): each new drawing moves
 * the cards and frames whose gaps changed sideways from the drawing before,
 * and unfolds an ancestor card shown out of its member card; never while the
 * block is drawn at a preview, which must lie where the pointer or the
 * control puts it, nor under reduced motion.
 */
const cardMotions = new CardMotions(
  () => ({ manifest: data.block.manifest, drawing: data.drawing, descriptors: data.descriptors }),
  measure,
  () => actions.reducedMotion(),
  () => actions.previewing(data.block.id),
);

/**
 * The flow switch's motion (`SwitchMotion`): where a card became switched,
 * its chunks move from where they are written to where they are played;
 * never for a preview nor under reduced motion.
 */
const switchMotion = new SwitchMotion(
  () => ({ manifest: data.block.manifest, drawing: data.drawing }),
  () => actions.reducedMotion(),
  () => actions.previewing(data.block.id),
);

/** The `transform` an entry takes while its chunk moves (`SwitchMotion`), before its own; nothing at rest. */
function switchAttributes(entry: Entry): Record<string, string> {
  const moved = switchMotion.transformOf(
    entry.descriptor.source.element,
    entry.descriptor.tag === "text",
  );
  if (moved === null) return {};
  const own = entry.attributes.transform;
  return { transform: own === undefined ? moved : `${moved} ${own}` };
}

/** An entry's own opacity, which a motion's is multiplied with. */
const ownOpacity = (entry: Entry): number => Number(entry.attributes.opacity ?? 1);

/**
 * The drawing's entries (`drawnEntries`, keyed once per drawing) in the
 * layers the block shows them in (`raisedLayers`): every entry no raised
 * card draws, then each raised card of the root `unfolding` shows, with how
 * it unfolds (`raiseUnfold`).
 */
const drawnEntries = $derived(keyed(data.block.manifest, data.drawing, data.descriptors));
const layers = $derived(raisedLayers(drawnEntries, data.drawing, unfolding.root));
const raisedCards = $derived(
  layers.raised.map((card) => ({
    ...card,
    key: boxKey(card.box) ?? addressKey(card.box.address),
    unfold: raiseUnfold(data.block.manifest, data.drawing, card.box, measure),
  })),
);

/**
 * The entries below the raised cards, split where the cards an elision
 * change hides fold back: the block's own rectangle first, then the rest.
 */
const backdrop = $derived(layers.below.filter((entry) => entry.role === "block"));
const drawnBelow = $derived(layers.below.filter((entry) => entry.role !== "block"));

/** Every entry in the order the block shows it: below the raised cards, then theirs. */
const entries = $derived(
  layers.raised.length === 0
    ? layers.below
    : [...layers.below, ...layers.raised.flatMap((card) => card.entries)],
);

/**
 * What an entry of a raised card adds to its attributes at the progress
 * `t` of its unfolding (`frameAt`), composed with its elisions' motion
 * (`CardMotions`): its map as a `transform` and its opacity times its own;
 * nothing at rest.
 */
function unfoldAttributes(entry: Entry, unfold: CardUnfold, t: number): Record<string, string> {
  const element = entry.descriptor.source.element;
  const raise = t < 1 ? framePlaced(frameAt(unfold.motionOf(element), t)) : AT_REST;
  const placed = composed(raise, cardMotions.placedOf(element) ?? AT_REST);
  return placed === AT_REST ? {} : placedAttributes(placed, ownOpacity(entry));
}

/**
 * The entries a mark copies: each frame's and card's own rectangle by its
 * box's place key (`boxKey`), each segment boundary's line by its address's
 * key (`addressKey`).
 */
const shapes = $derived.by(() => {
  const found = new Map<string, Entry[]>();
  for (const entry of entries) {
    const key =
      entry.box !== undefined
        ? boxKey(entry.box)
        : entry.role === "boundary"
          ? entry.addressKey
          : null;
    if (key === null) continue;
    found.set(key, [...(found.get(key) ?? []), entry]);
  }
  return found;
});

/** What the pointer highlights, held by address so that a redraw keeps the marks. */
let hover: Hover = $state.raw(NO_HOVER);

function show(next: Hover): void {
  if (
    next.box !== hover.box ||
    next.boundary !== hover.boundary ||
    next.band !== hover.band ||
    next.bandHolder !== hover.bandHolder
  ) {
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
  const source = sourceAt(event.target);
  const hit = hitOf(data.block.id, data.drawing, source, point, data.editing);
  // A band is highlighted in every view, where the press lies inside the edited element.
  const inside = pressSelection(hit, data.editing, data.inside) !== null;
  show(hoverOf(hit, inside ? bandUnder(data.drawing, hit, point, data.editing) : null));
  const chunk =
    source === null || isAffordance(source) ? null : chunkOf(data.block.manifest, source.address);
  hoverChunks(
    chunk !== null
      ? [chunk]
      : chunksAt(zones, point, HIT_TOLERANCE / (actions.zoom() * data.block.scale)),
  );
}

function onpointerleave() {
  show(NO_HOVER);
  hoverChunks([]);
}

/** Where the pointer shows a chunk (`chunkZones`), read once per drawing. */
const zones = $derived(chunkZones(data.block.manifest, data.drawing));

/**
 * The chunks of virtual cards under the pointer: the chunk of the element
 * hit (its label, leader or boundary), else every chunk whose zone holds
 * the pointer, its line widened by the canvas's hit tolerance (`chunksAt`):
 * a chunk's stretch of its virtual line, its label and the space between,
 * or a written stretch of its source, every chunk playing it.
 */
let hoveredChunks: readonly ChunkRef[] = $state.raw([]);

function hoverChunks(next: readonly ChunkRef[]): void {
  if (
    next.length !== hoveredChunks.length ||
    next.some(
      (chunk, at) =>
        chunk.timeline !== hoveredChunks[at]?.timeline || chunk.index !== hoveredChunks[at]?.index,
    )
  ) {
    hoveredChunks = next;
  }
}

/**
 * Whether an entry shows the selection: its own address selected, or the
 * named timestamp or MatchStamp it draws a part of.
 */
function isSelected(entry: Entry): boolean {
  return (
    showsSelection(entry.role, entry.address, data.selectedElements) ||
    entry.ownerKeys.some((key) => data.selectedElements.has(key))
  );
}

/**
 * Whether an entry lets the pointer through: every part of a named
 * timestamp or MatchStamp while "Show coordinates" is on, so the lines
 * beneath are read wherever they lie; a MatchStamp's or a match
 * timestamp's while "Show matches" is on.
 */
function passes(owner: Owner | null): boolean {
  return (owner !== null && actions.coordinates()) || (owner?.match === true && actions.matches());
}

/** How this block's named MatchStamps are painted over their style (`namedPaint`), by address key. */
const paint = $derived(actions.matchPaint(data.block.id));

/**
 * An entry's attributes, a part of a named MatchStamp painted by belief or as
 * out of date. Only a MatchStamp's or a match timestamp's part (`Owner.match`)
 * is ever painted, so only those read `paint`: every other entry's render
 * stays independent of it, which every change of the view recomputes.
 */
function attributesOf(entry: Entry): Readonly<Record<string, string>> {
  if (entry.owner?.match !== true || paint.size === 0) return entry.attributes;
  const painted = paint.get(entry.addressKey);
  return painted === undefined
    ? entry.attributes
    : { ...entry.attributes, [painted.attribute]: painted.colour };
}

/**
 * The out-of-date marks (`OUT_OF_DATE_MARK`) of the name labels of named
 * MatchStamps out of date, each its own text beside its label, as wide as
 * the layout measures it and ending where the label starts, so that the label
 * keeps the width the layout measured and cut it to; in the label's size and
 * painted colour, one per marked label.
 */
const outOfDate = $derived.by(() => {
  if (paint.size === 0) return [];
  return entries.flatMap((entry) => {
    const painted = paint.get(entry.addressKey);
    const label = data.drawing.elements[entry.descriptor.source.element];
    const { text } = entry.descriptor;
    if (painted?.marked !== true || text === null || label === undefined) return [];
    if (label.type !== "label" && label.type !== "name") return [];
    const size = label.style["font-size"];
    const start = label.anchor === "middle" ? label.x - measure.width(text, size) / 2 : label.x;
    const x = start - measure.width(OUT_OF_DATE_MARK, size);
    return [{ key: entry.key, x, y: label.baseline, size, fill: painted.colour }];
  });
});

/** Whether an element shows the selection on itself: any but a box, whose selection is a mark. */
function glows(entry: Entry): boolean {
  return !isBoxShape(entry.role) && isSelected(entry);
}

/**
 * The affordances of the named timestamps that draw nothing (`affordancesOf`),
 * read with the root this node's editor raises (`raisedRoot`), so one in a
 * stretch of an ancestor card that frames cover appears on the card while it
 * is raised; each with its key in the node and the key of the timestamp it
 * shows.
 */
const affordances = $derived.by(() => {
  const raised = raisedRoot(data.block, data.editing);
  return affordancesOf(data.block.manifest, data.drawing, raised).map((affordance) => {
    const timestamp = addressKey(affordance.address);
    const owner = ownerOf(data.block.manifest, affordance.address);
    return { affordance, timestamp, owner, key: `${timestamp}#${affordance.line}` };
  });
});

/** The block itself, and its cards and frames, holding part of the selection. */
const holding = $derived(holdingOf(data.drawing, data.selectedElements));

function holdsSelection(entry: Entry): boolean {
  return showsContainedSelection(entry.role, entry.box, holding.boxes);
}

/**
 * The boxes whose holding mark is drawn: the block's background when the
 * block holds part of the selection, and the cards and frames holding part
 * of it that are not selected themselves, a selected box showing the
 * selection's mark instead.
 */
const holdingMarks = $derived(
  entries.filter((entry) =>
    entry.role === "block" ? holding.block : holdsSelection(entry) && !isSelected(entry),
  ),
);

/**
 * A mark over the drawing: a copy of a box's outline or a boundary's line,
 * with its kind. Every mark, a holding mark's and a band's too, is one
 * `.tilie-mark` element: `data-mark` its kind, `data-marks` the key
 * (`addressKey`) of the element address it marks (`{}` for the block),
 * `data-box` the container it outlines (`block`, `frame`, `card`, `band`;
 * none for a boundary).
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
  [hover.box, hover.boundary].flatMap((key) =>
    key === null
      ? []
      : (shapes.get(key) ?? []).flatMap((entry) =>
          data.inside.has(entry.addressKey) && (entry.role === "boundary" || !isSelected(entry))
            ? [{ entry, mark: "hover" as const }]
            : [],
        ),
  ),
);

const OUTLINE = ["x", "y", "width", "height", "rx"];

/** Whether `name` is one of the attributes a descriptor writes its address with. */
function isAddressAttribute(name: string): boolean {
  return ADDRESS_ATTRIBUTES.some((attribute) => attribute === name);
}

/**
 * A mark's shape: its box's rectangle and corner radius, or its line with
 * every attribute but the address's, so a mark is never read as the element.
 */
function shapeOf(entry: Entry): Record<string, string> {
  return Object.fromEntries(
    Object.entries(entry.attributes).filter(([name]) =>
      entry.descriptor.tag === "rect" ? OUTLINE.includes(name) : !isAddressAttribute(name),
    ),
  );
}

/** Whether the element lies under a selected one, and so goes with it on Delete. */
function isAffected(entry: Entry): boolean {
  return data.affectedElements.has(entry.addressKey);
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
 * Whether the element keyed `key` (`addressKey`) lies outside the edited
 * group or timeline, and so is faded and lets the pointer through. Another
 * block is outside as a whole, through its node; the bundle editor edits
 * everything its block draws.
 */
function isOutside(key: string): boolean {
  if (edited == null) return false;
  return !data.inside.has(key);
}

/**
 * The read-only flow control bands shown beside a child in its timeline
 * editor (`flowOverlays`): an overlay like the marks, drawn without
 * addresses, letting the pointer through, never part of the drawing.
 */
const overlays = $derived(
  flowOverlays(data.block, data.drawing, data.descriptors, data.editing, actions.metrics),
);

/**
 * The chunks of virtual cards whose ribbons are drawn (`ribbons.ts`): the
 * selected ones, then those under the pointer, each once.
 */
const shownChunks: readonly ChunkRef[] = $derived.by(() => {
  const chunks: ChunkRef[] = [];
  const found = [...data.selectedElements.values()].map((address) =>
    chunkOf(data.block.manifest, address),
  );
  for (const chunk of [...found, ...hoveredChunks]) {
    if (chunk === null) continue;
    if (chunks.some((one) => one.timeline === chunk.timeline && one.index === chunk.index))
      continue;
    chunks.push(chunk);
  }
  return chunks;
});

/** The ribbons of the shown chunks and the chunks they light (`allLights`), an overlay like the marks. */
const lights = $derived(allLights(data.block.manifest, data.drawing, shownChunks));
const litChunks: readonly LitChunk[] = $derived(litSpans(data.drawing, lights.lit));

/** The timeline whose bands this block offers (`bandTimelineOf`), else `null`. */
const bandTimeline = $derived(bandTimelineOf(data.block.id, data.editing));

/** A band marked over the drawing, with the selection's mark or the hover's. */
interface BandMark {
  readonly band: BandBox;
  readonly mark: "selection" | "hover";
}

/**
 * The bands marked over the drawing, as drawn: every selected band among
 * those this block offers, and in every view the band under the pointer
 * (`isHoveredBand`), a selected band showing the selection's mark under the
 * pointer too. A band draws nothing of its own; only its mark shows it.
 */
const bandMarks: readonly BandMark[] = $derived(
  data.drawing.boxes.flatMap((box): BandMark[] => {
    if (!isBand(box)) return [];
    const offered = bandTimeline !== null && box.band.timeline === bandTimeline;
    if (offered && data.selectedElements.has(addressKey(box.address))) {
      return [{ band: box, mark: "selection" }];
    }
    return isHoveredBand(box, hover) ? [{ band: box, mark: "hover" }] : [];
  }),
);

/**
 * A band mark's corner radius: that of the card holding the band, as the
 * cascade styles it; square where the card is not drawn.
 */
function radiusOf(drawing: Drawing, band: BandBox): number {
  const card = band.holder === null ? undefined : keyedBox(drawing, band.holder);
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

/**
 * `slide`'s parameters for a move of `entry` measured now: a hidden element
 * (the dragged card, which its copy stands for) never slides, so it always
 * lies where it drops and its copy settles there.
 */
function slideParams(entry: Entry): { duration?: number } {
  return sliding && !actions.reducedMotion() && !hidden.has(entry.descriptor)
    ? {}
    : { duration: 0 };
}

/** The copy of a held card that follows the pointer while it is reordered, then settles. */
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
    // unless a reorder has started again: a copy that follows the pointer, not one settling.
    void tick().then(() => {
      sliding = ghost !== null && ghost.to === null;
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
 * frame, an ungrouped root's card) moves, freely or to another place of its
 * block's arrangement (`movedItemGesture`); at a level that reorders (a
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
    return once(`item ${placeKeyText(key)}`, () =>
      pointerGesture(movedItemGesture(host, key), options),
    );
  }
  const member = placedElement(data.block.manifest, key);
  const group = edited?.id;
  const inEdited =
    group !== undefined && box.holder !== null && samePlaceKey(box.holder, { item: group });
  if (offered.reorder && inEdited && isHeld(box) && member) {
    return once(`held ${placeKeyText(key)}`, () =>
      pointerGesture(heldGesture(host, group, member), options),
    );
  }
  return undefined;
}

/** The band drag, made once: the `<svg>` it is attached to outlives every redraw. */
const bandMoves = pointerGesture(bandGesture(host), options);

/**
 * The motion of a settling copy (`ghost.to` set): from where it was
 * dropped, where it is drawn, to its card's place (`settle`), after which
 * the copy goes and the card shows; nothing for a copy that follows the
 * pointer.
 */
function settling(settled: Ghost): Attachment<SVGGElement> | undefined {
  const { to } = settled;
  if (to === null) return undefined;
  return (element) =>
    settle(element, settled.offset, to, () => {
      if (ghost === settled) ghost = null;
    });
}

/** A ghost's attributes: those of its descriptor, its address's left out. */
function ghostAttributesOf(descriptor: Descriptor): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const [name, value] of descriptor.attrs) {
    if (!isAddressAttribute(name)) attributes[name] = domValue(value);
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
    {#each backdrop as entry (entry.key)}
      <svelte:element
        this={entry.descriptor.tag}
        {...attributesOf(entry)}
        data-selected={glows(entry) ? "" : undefined}
        data-affected={isAffected(entry) ? "" : undefined}
        data-outside={isOutside(entry.addressKey) ? "" : undefined}
        {@attach drawn(entry.descriptor.source)}
        {@attach gestureOf(entry.box)}>{entry.descriptor.text}</svelte:element
      >
    {/each}
    <!--
      An ancestor card hidden folds back into its member card: drawn from the
      drawing before, above the block's rectangle and below every frame,
      letting the pointer through.
    -->
    {#each cardMotions.leaving as card (card.key)}
      <g class="tilie-leaving" data-leaving={card.key} pointer-events="none" aria-hidden="true">
        {#each card.descriptors as descriptor (descriptor)}
          <svelte:element
            this={descriptor.tag}
            {...ghostAttributesOf(descriptor)}
            {...placedAttributes(
              card.placedAt(descriptor, cardMotions.progress),
              Number(ghostAttributesOf(descriptor).opacity ?? 1),
            )}>{descriptor.text}</svelte:element
          >
        {/each}
      </g>
    {/each}
    {#each drawnBelow as entry (entry.key)}
      {@const placed = cardMotions.placedOf(entry.descriptor.source.element)}
      <svelte:element
        this={entry.descriptor.tag}
        {...attributesOf(entry)}
        {...placed === null ? switchAttributes(entry) : placedAttributes(placed, ownOpacity(entry))}
        visibility={hidden.has(entry.descriptor) ? "hidden" : undefined}
        data-selected={glows(entry) ? "" : undefined}
        data-affected={isAffected(entry) ? "" : undefined}
        data-outside={isOutside(entry.addressKey) ? "" : undefined}
        pointer-events={passes(entry.owner) || placed !== null ? "none" : undefined}
        {@attach drawn(entry.descriptor.source)}
        {@attach gestureOf(entry.box)}
        animate:slide={slideParams(entry)}>{entry.descriptor.text}</svelte:element
      >
    {/each}
    <!--
      Each raised card in its own layer, clipped and its rows shifted while it
      unfolds or folds back (`raiseUnfold`, `frameAt`), letting the pointer
      through while it moves; at rest its entries are drawn as every other
      one. An ancestor card is never reordered nor dragged, so its entries
      take no slide and no gesture.
    -->
    {#each raisedCards as { key, entries: cardEntries, unfold }, at (key)}
      {@const t = unfolding.progress}
      {@const clip = t < 1 ? rectAt(unfold.from, unfold.to, t) : null}
      {@const clipId = `${uid}-raised-${at}`}
      {#if clip !== null}
        <clipPath id={clipId}>
          <rect
            x={attributeText(clip.x)}
            y={attributeText(clip.y)}
            width={attributeText(clip.width)}
            height={attributeText(clip.height)}
          />
        </clipPath>
      {/if}
      <g
        class="tilie-raised"
        data-raised={key}
        data-unfolding={clip === null ? undefined : ""}
        clip-path={clip === null ? undefined : `url(#${clipId})`}
        pointer-events={clip === null ? undefined : "none"}
      >
        {#each cardEntries as entry (entry.key)}
          <svelte:element
            this={entry.descriptor.tag}
            {...attributesOf(entry)}
            {...unfoldAttributes(entry, unfold, t)}
            data-selected={glows(entry) ? "" : undefined}
            data-affected={isAffected(entry) ? "" : undefined}
            data-outside={isOutside(entry.addressKey) ? "" : undefined}
            pointer-events={passes(entry.owner) ? "none" : undefined}
            {@attach drawn(entry.descriptor.source)}>{entry.descriptor.text}</svelte:element
          >
        {/each}
      </g>
    {/each}
    {#each outOfDate as mark (mark.key)}
      <text
        class="tilie-out-of-date"
        x={attributeText(mark.x)}
        y={attributeText(mark.y)}
        font-size={attributeText(mark.size)}
        fill={mark.fill}
        pointer-events="none">{OUT_OF_DATE_MARK}</text
      >
    {/each}
    {#each affordances as { affordance, timestamp, owner, key } (key)}
      <polygon
        class="tilie-timestamp-affordance"
        data-affordance={timestamp}
        points={attributeText(affordance.points)}
        data-selected={data.selectedElements.has(timestamp) ? "" : undefined}
        data-outside={isOutside(timestamp) ? "" : undefined}
        pointer-events={passes(owner) ? "none" : undefined}
        {@attach drawn(affordance)}
      />
    {/each}
    {#each overlays as overlay (overlay.key)}
      <g
        class="tilie-flow-overlay"
        data-flow-overlay={overlay.timeline}
        pointer-events="none"
        aria-hidden="true"
      >
        <rect
          class="tilie-flow-overlay-box"
          x={attributeText(overlay.x)}
          y={attributeText(overlay.y)}
          width={attributeText(overlay.width)}
          height={attributeText(overlay.height)}
          rx="3"
        />
        <text
          class="tilie-flow-overlay-label"
          x={attributeText(overlay.labelX)}
          y={attributeText(overlay.baseline)}
          font-size={OVERLAY_LABEL_SIZE}>{overlay.label}</text
        >
        <g transform="translate(0 {attributeText(overlay.dy)})">
          {#each overlay.items as item (item.index)}
            <svelte:element this={item.tag} {...item.attributes}>{item.text}</svelte:element>
          {/each}
        </g>
      </g>
    {/each}
    <Ribbons ribbons={lights.ribbons} lit={litChunks} />
    {#each holdingMarks as entry (entry.key)}
      <rect
        {...shapeOf(entry)}
        class="tilie-mark"
        data-mark="holding"
        data-marks={entry.addressKey}
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
        data-marks={entry.addressKey}
        data-box={isBoxShape(entry.role) ? entry.role : undefined}
        aria-hidden="true"
      />
    {/each}
    {#each bandMarks as { band, mark } (band)}
      <rect
        class="tilie-mark"
        data-mark={mark}
        data-marks={addressKey(band.address)}
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
        {@attach settling(ghost)}
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
