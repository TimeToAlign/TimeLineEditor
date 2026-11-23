/**
 * The gaps of a drawing's elisions on the canvas (`docs/drawing.md` in
 * TimeToShare, sections 2, 3.2, 6.6 and 8.9): where each piece is drawn,
 * what a press on a gap, its ellipses or its labels selects, what the
 * pointer reads over one, what the handles and keys of a selected stored
 * elision set, and the commands storing that.
 *
 * A stored elision `E` is addressed `{id: E}`, a derived (default) one
 * lying on `T` `{id: T, part: ["elision"]}`; each piece is one `elision`
 * element, the gap, holding its ellipses and labels. A card draws its card
 * elisions and its defaults, and the group elisions of the frame in front
 * of it carried; a frame draws its group elisions across its member cards.
 * Only a stored elision's gaps take handles: a card elision's in its card,
 * a group elision's in its frame. A default one is selectable and never
 * edited on its own (its root's mode turns Custom first); a carried gap
 * selects its group elision, whose handles stand in the frame.
 */

import type {
  Address,
  BlockId,
  Command,
  ElementAddress,
  Elision,
  Granularity,
  Manifest,
  PlaceKey,
  TimelineManifest,
  View,
} from "@timetoalign/tilie-core";
import {
  addressKey,
  elisionsUnder,
  findTimeline,
  idAddress,
  inBlock,
  partAddress,
  placeKeyText,
  prettyText,
  samePlaceKey,
  snapOnRow,
  timelineAxisOf,
} from "@timetoalign/tilie-core";
import { anchorsOf } from "@timetoalign/tilie-core/drawing";
import {
  axisCoordinate,
  axisValueOf,
  exactCoordinate,
  fromFloat,
  Rational,
  type Real,
  realOf,
  toFloat,
  toRational,
} from "@timetoalign/tilie-core/numbers";
import type {
  Drawing,
  ElisionElement,
  ElisionExposure,
  ExposedGap,
  StoredWidth,
  WidthForm,
} from "@timetoalign/tilie-layout";
import { lineAxes, widthAs } from "@timetoalign/tilie-layout";
import type { DrawingPoint, Stacking } from "./boxes.ts";
import { keyedBox, raisedRoot, stackingOf } from "./boxes.ts";
import type { CardAxis, GapEdge } from "./cardAxis.ts";
import { cardAxisOf, zeroOf } from "./cardAxis.ts";
import type { BlockNode } from "./node.ts";

export type { GapEdge } from "./cardAxis.ts";

/**
 * One piece of an elision a drawing draws: its element, where it lies among
 * the elements, the container that decides it (an ungrouped root's card,
 * an ancestor card or a frame) and its record there.
 */
export interface GapPiece {
  /** Its index in `drawing.elements`. */
  readonly index: number;
  readonly element: ElisionElement;
  readonly exposure: ElisionExposure;
  readonly gap: ExposedGap;
}

const NO_PIECES: readonly GapPiece[] = [];
const ZERO = Rational.fromParts(0n, 1n);

/** The gap of `exposure` that `element` draws: the one at its address whose left edge lies nearest. */
function exposedOf(exposure: ElisionExposure, element: ElisionElement): ExposedGap | undefined {
  const key = addressKey(element.address);
  let found: ExposedGap | undefined;
  for (const gap of exposure.gaps) {
    if (addressKey(gap.address) !== key) continue;
    if (found === undefined || Math.abs(gap.x1 - element.x1) < Math.abs(found.x1 - element.x1)) {
      found = gap;
    }
  }
  return found;
}

const piecesByDrawing = new WeakMap<Drawing, readonly GapPiece[]>();

/**
 * Every gap `drawing` draws, in drawing order, each with the container
 * recording it: the card whose range holds it, else (a group elision's gap,
 * written after every item) the frame recording a gap at its address.
 */
export function gapsOf(drawing: Drawing): readonly GapPiece[] {
  let found = piecesByDrawing.get(drawing);
  if (found === undefined) {
    const cards = drawing.boxes.filter((box) => box.kind === "card");
    found = drawing.elements.flatMap((element, index): GapPiece[] => {
      if (element.type !== "elision") return [];
      const key = cards.findLast(({ range }) => range.start <= index && index < range.end)?.key;
      const holders =
        key == null
          ? drawing.elisions.filter((exposure) => {
              // A frame's gap spans its member cards, so it lies inside the frame's box.
              const frame = exposure.kind === "frame" ? keyedBox(drawing, exposure.key) : undefined;
              return (
                frame !== undefined && frame.y <= element.yt && element.yb <= frame.y + frame.height
              );
            })
          : drawing.elisions.filter(
              (exposure) => exposure.kind !== "frame" && samePlaceKey(exposure.key, key),
            );
      // A gap drawn in several frames (a shared member's) belongs to the one recording it there.
      let found: GapPiece | undefined;
      for (const exposure of holders) {
        const gap = exposedOf(exposure, element);
        if (gap === undefined) continue;
        if (
          found === undefined ||
          Math.abs(gap.x1 - element.x1) < Math.abs(found.gap.x1 - element.x1)
        ) {
          found = { index, element, exposure, gap };
        }
      }
      return found === undefined ? [] : [found];
    });
    piecesByDrawing.set(drawing, found.length === 0 ? NO_PIECES : found);
  }
  return found;
}

/** The pieces of `drawing` drawing the elision `address`, in drawing order. */
export function piecesOf(drawing: Drawing, address: ElementAddress): readonly GapPiece[] {
  const key = addressKey(address);
  return gapsOf(drawing).filter(({ element }) => addressKey(element.address) === key);
}

/** Whether `address` is a default elision's, `{id: T, part: ["elision"]}`. */
export function isDefaultGap(address: ElementAddress): boolean {
  return (
    address.id !== undefined &&
    address.facet === undefined &&
    address.part?.length === 1 &&
    address.part[0] === "elision"
  );
}

/** The stored elision `id` of `manifest`; `undefined` where none has that ID. */
export function storedElision(manifest: Manifest, id: string): Elision | undefined {
  return manifest.graphical?.elisions?.find((elision) => elision.id === id);
}

/** The parts of a stored elision's gap that stand for it: its ellipses and its labels. */
const STORED_PARTS: ReadonlySet<string> = new Set(["ellipsis", "name", "id", "coordinate"]);
/** The parts of a default elision's gap that stand for it: a default has no ID label. */
const DEFAULT_PARTS: ReadonlySet<string> = new Set(["ellipsis", "name", "coordinate"]);

/**
 * The elision `element` of `manifest` is the gap of, or a part of that gap:
 * a stored elision's `{id: E}` for itself, its ellipses `{id: E, part:
 * [ellipsis]}` and its labels `[name | id | coordinate]`, a default one's
 * `{id: T, part: ["elision"]}` for itself, its ellipses and its labels
 * `{id: T, part: ["elision", ellipsis | name | coordinate]}`; `null` for
 * any other address.
 */
export function gapOf(manifest: Manifest, element: ElementAddress): ElementAddress | null {
  const { id, facet, part = [] } = element;
  if (id === undefined || facet !== undefined) return null;
  if (part[0] === "elision") {
    return part.length === 1 || (part.length === 2 && DEFAULT_PARTS.has(part[1] ?? ""))
      ? partAddress(idAddress(id), "elision")
      : null;
  }
  if (storedElision(manifest, id) === undefined) return null;
  return part.length === 0 || (part.length === 1 && STORED_PARTS.has(part[0] ?? ""))
    ? idAddress(id)
    : null;
}

/** Whether `element` of `manifest` is an elision's own address, stored or default. */
export function isGap(manifest: Manifest, element: ElementAddress): boolean {
  const gap = gapOf(manifest, element);
  return gap !== null && addressKey(gap) === addressKey(element);
}

/**
 * The gap under `point` (block-local canvas units) in `drawing`: the last
 * drawn whose rectangle holds it, its left and right edges excluded (an
 * edge is where a run of a row ends, and what lies exactly there is drawn,
 * section 6.6; its top and bottom included) and that no frame or card
 * stacked above its holder covers there (`stacking`); `null` for none.
 */
export function gapAt(drawing: Drawing, point: DrawingPoint, stacking: Stacking): GapPiece | null {
  return (
    gapsOf(drawing).findLast(({ index, element }) => {
      const { x1, x2, yt, yb } = element;
      return (
        x1 < point.x &&
        point.x < x2 &&
        yt <= point.y &&
        point.y <= yb &&
        !stacking.coveredElement(index, point)
      );
    }) ?? null
  );
}

/** A gap the pointer rests on: its block, its piece, and where the pointer is on the canvas. */
export interface GapHover {
  readonly block: BlockId;
  readonly piece: GapPiece;
  /** The pointer's abscissa and the gap's top, in canvas units. */
  readonly x: number;
  readonly top: number;
  /** What the gap says (`gapText`). */
  readonly text: string;
}

/**
 * The gap under the canvas point `point` (canvas units) among `nodes`, the
 * last node holding one (`gapAt`, as each node stacks its drawing for its
 * editor); `null` for none.
 */
export function gapHoverAt(nodes: readonly BlockNode[], point: DrawingPoint): GapHover | null {
  for (const node of nodes.toReversed()) {
    const { block, drawing, editing } = node.data;
    const local = {
      x: (point.x - node.position.x) / block.scale,
      y: (point.y - node.position.y) / block.scale,
    };
    const piece = gapAt(drawing, local, stackingOf(drawing, raisedRoot(block, editing)));
    if (piece === null) continue;
    return {
      block: block.id,
      piece,
      x: point.x,
      top: node.position.y + piece.element.yt * block.scale,
      text: gapText(block.manifest, piece),
    };
  }
  return null;
}

/** How many decimals a float in a stretch is shown with, as a drawn label shows it. */
const LABEL_DECIMALS = 3;

/** A value of `timeline` as a drawn label writes it, with the pretty unit where `unit`. */
function labelText(value: Real, timeline: TimelineManifest, unit: boolean): string {
  const shownUnit = unit ? timeline.unit : null;
  if (typeof value === "number") return prettyText(value, "float", shownUnit, LABEL_DECIMALS);
  return timeline.number_type === "int" && value.denominator === 1n
    ? prettyText(value.numerator, "int", shownUnit, LABEL_DECIMALS)
    : prettyText(value, "fraction", shownUnit, LABEL_DECIMALS);
}

/**
 * A stretch of `timeline` as a gap's coordinate label writes it (section
 * 5.3): the start without its pretty unit (with it in seconds, where both
 * are clocks), `–`, and the end with it: "12–300 ♩".
 */
export function stretchText(timeline: TimelineManifest, start: Real, end: Real): string {
  const clock = timeline.unit === "seconds";
  return `${labelText(start, timeline, clock)}–${labelText(end, timeline, true)}`;
}

/**
 * What a gap says when the pointer rests on it (Show coordinates): the
 * name of the timeline it lies on (its ID without one), the stretch its
 * piece elides there, and "elided": "Score, 0–16 ♩, elided".
 */
export function gapText(manifest: Manifest, piece: GapPiece): string {
  const { timeline: id, start, end } = piece.element.elided;
  const timeline = findTimeline(manifest, id);
  if (timeline === undefined) return `${id}, elided`;
  return `${timeline.name ?? id}, ${stretchText(timeline, start, end)}, elided`;
}

/** A value on `timeline`'s own axis read exact. */
function exactOn(value: Elision["start"], timeline: TimelineManifest): Rational {
  return toRational(realOf(axisCoordinate(value, timeline)));
}

/** What the handles and keys of a selected stored elision act on, in one piece. */
export interface GapSubject {
  readonly piece: GapPiece;
  /** The map of the axis of the container drawing it. */
  readonly axis: CardAxis;
  /** The timeline the elision lies on. */
  readonly timeline: TimelineManifest;
  /** The stored elision. */
  readonly stored: Elision;
  /** Its start and end, on its timeline's own axis. */
  readonly start: Rational;
  readonly end: Rational;
  /** The edges this piece moves: the stored start or end only on the piece reaching it. */
  readonly edges: readonly GapEdge[];
  /**
   * The stretches of the timeline's axis an edge never crosses: an ancestor
   * card's protected span, a frame's other gaps; each on the timeline's own
   * axis.
   */
  readonly kept: readonly (readonly [Rational, Rational])[];
}

/**
 * The other gaps of the frame `exposure` on the axis of `timeline`: exactly
 * the elided coordinates the frame lists for the timeline, else each gap's
 * proportions read back at its base's length, less the timeline's zero
 * there.
 */
function othersOn(
  axis: CardAxis,
  timeline: string,
  own: ExposedGap,
): (readonly [Rational, Rational])[] {
  const base = axis.baseOf(timeline);
  if (base === null) return [];
  const lambda = toFloat(toRational(base.lambda));
  const zero = toFloat(base.zero);
  return axis.exposure.gaps.flatMap((gap): (readonly [Rational, Rational])[] => {
    if (gap === own || addressKey(gap.address) === addressKey(own.address)) return [];
    // Exactly where the frame lists the gap on the timeline (its span holds it), else read back.
    const listed = gap.members.find((member) => member.timeline === timeline);
    if (listed?.start != null && listed.end != null) {
      return [[toRational(listed.start), toRational(listed.end)]];
    }
    const ua = axis.proportionOf(gap.timeline, gap.start);
    const ub = axis.proportionOf(gap.timeline, gap.end);
    if (ua === null || ub === null) return [];
    return [[fromFloat(ua * lambda - zero), fromFloat(ub * lambda - zero)]];
  });
}

/**
 * What the handles of `piece` (in `drawing` of `manifest`) act on: a stored
 * elision's gap in the container deciding it (a card elision's in its
 * card, a group elision's in its frame); `null` for a default or carried
 * gap, or where its timeline or elision is gone.
 */
export function subjectOf(
  manifest: Manifest,
  drawing: Drawing,
  piece: GapPiece,
): GapSubject | null {
  const { element, exposure, gap } = piece;
  if (gap.origin !== "stored" || element.address.id === undefined) return null;
  const stored = storedElision(manifest, element.address.id);
  const timeline = stored === undefined ? undefined : findTimeline(manifest, stored.timeline);
  if (stored === undefined || timeline === undefined) return null;
  const axis = cardAxisOf(manifest, drawing, exposure);
  const start = exactOn(stored.start, timeline);
  const end = exactOn(stored.end, timeline);
  const edges: GapEdge[] = [];
  if (toRational(gap.start).equals(start)) edges.push("start");
  if (toRational(gap.end).equals(end)) edges.push("end");
  const protect =
    exposure.kind === "ancestor_card"
      ? ancestorProtected(manifest, drawing, exposure, timeline.id)
      : null;
  const kept =
    exposure.kind === "frame"
      ? othersOn(axis, timeline.id, gap)
      : protect === null
        ? []
        : [protect];
  return { piece, axis, timeline, stored, start, end, edges, kept };
}

/**
 * The protected span of an ancestor card on the axis of `timeline`: the
 * member it is aligned to (its record's `ancestor`), from the member's zero
 * to its known length, else to where its line reaches in its card; for a
 * root drawn once behind a row of groups (`ancestor.groups`), from the first
 * anchor's start to the last one's end, each group's anchor being its member
 * core's `anchorsOf` names.
 */
function ancestorProtected(
  manifest: Manifest,
  drawing: Drawing,
  exposure: ElisionExposure,
  timeline: string,
): readonly [Rational, Rational] | null {
  const card = drawing.boxes.find(
    (box) =>
      box.ancestor !== undefined &&
      box.key !== null &&
      placeKeyText(box.key) === placeKeyText(exposure.key),
  );
  const ancestor = card?.ancestor;
  if (ancestor === undefined) return null;
  const anchors = ancestor.groups.length > 1 ? anchorsOf(manifest) : [];
  let protect: readonly [Rational, Rational] | null = null;
  for (const group of ancestor.groups) {
    const member =
      group === ancestor.group
        ? ancestor.member
        : anchors.find((anchor) => anchor.group === group && anchor.root === card?.key?.member)
            ?.member;
    if (member === undefined) continue;
    const span = memberSpan(manifest, drawing, group, member, timeline);
    if (span === null) continue;
    protect = protect === null ? span : [min(protect[0], span[0]), max(protect[1], span[1])];
  }
  return protect;
}

/**
 * The span of `member`, drawn in its card in the frame of `group`, on the
 * axis of `timeline`: from its zero to its known length, else to where its
 * line reaches in that card; `null` where the card draws no line of it.
 */
function memberSpan(
  manifest: Manifest,
  drawing: Drawing,
  group: string,
  member: string,
  timeline: string,
): readonly [Rational, Rational] | null {
  // The member's line is drawn in runs where its frame has gaps.
  let span: readonly [Rational, Rational] | null = null;
  for (const axis of lineAxes(drawing).values()) {
    if (axis.timeline !== member || axis.ancestor !== undefined) continue;
    if (!samePlaceKey(axis.card, { item: group, member })) continue;
    const start = toRational(axis.start);
    const end = start.add(toRational(axis.drawnLength));
    span = span === null ? [start, end] : [min(span[0], start), max(span[1], end)];
  }
  if (span === null) return null;
  // The member's span runs from its zero to its known length, else to where its line reaches.
  const own = findTimeline(manifest, member);
  const end = own?.length === null || own === undefined ? span[1] : exactOn(own.length, own);
  const zero = zeroOf(manifest, member).subtract(zeroOf(manifest, timeline));
  return [zero, zero.add(end)];
}

/** The larger and the smaller of two exact values. */
const max = (a: Rational, b: Rational) => (a.compare(b) >= 0 ? a : b);
const min = (a: Rational, b: Rational) => (a.compare(b) <= 0 ? a : b);

/**
 * Where the `edge` of `subject` may lie, on its timeline's own axis: from
 * its timeline's start to its known end, never across a kept stretch
 * (`GapSubject.kept`) from the side its piece lies on, and the start before
 * the end. `value` held to them; `null` where it cannot lie there.
 */
function heldEdge(subject: GapSubject, edge: GapEdge, value: Rational): Rational | null {
  const { timeline, piece } = subject;
  const pieceStart = toRational(piece.gap.start);
  const pieceEnd = toRational(piece.gap.end);
  let held = value;
  if (edge === "start") held = max(held, ZERO);
  else if (timeline.length !== null) held = min(held, exactOn(timeline.length, timeline));
  for (const [a, b] of subject.kept) {
    if (pieceEnd.compare(a) <= 0) held = min(held, a);
    else if (pieceStart.compare(b) >= 0) held = max(held, b);
  }
  if (edge === "start") return held.compare(subject.end) < 0 ? held : null;
  return held.compare(subject.start) > 0 ? held : null;
}

/**
 * The values an edge of `subject` snaps to, on its timeline's own axis: its
 * timeline's start and known end, the start and the known end of each of its
 * children, and the ends of every kept stretch.
 */
function targetsOf(subject: GapSubject): Rational[] {
  const { timeline } = subject;
  const targets = [ZERO];
  if (timeline.length !== null) targets.push(exactOn(timeline.length, timeline));
  for (const child of timeline.children) {
    const offset = exactOn(child.offset, timeline);
    targets.push(offset);
    if (child.length !== null) targets.push(offset.add(exactOn(child.length, timeline)));
  }
  for (const [a, b] of subject.kept) targets.push(a, b);
  return targets;
}

/**
 * The simplest value of `timeline`'s number type within `reach` of `p` on
 * its own axis (core's `snapOnRow` on a spec of that timeline alone: an int
 * axis the nearest integer).
 */
function snapped(
  block: BlockId,
  timeline: TimelineManifest,
  p: number,
  reach: number,
  granularity: Granularity,
): Rational | null {
  if (!Number.isFinite(p) || !(reach > 0) || !Number.isFinite(reach)) return null;
  const spec = { block, granularity, anchor: timelineAxisOf(timeline, []), members: [] };
  return snapOnRow(spec, { timeline: timeline.id, map: null }, p, reach, "no_server");
}

/**
 * The simplest decimal within `reach` of `value`: the fewest decimals (0 to
 * 6) whose rounding lies within reach, else `value` itself.
 */
function simplestWithin(value: number, reach: number): number {
  for (let decimals = 0; decimals <= 6; decimals += 1) {
    const scale = 10 ** decimals;
    const rounded = Math.round(value * scale) / scale;
    if (Math.abs(rounded - value) <= reach) return rounded;
  }
  return value;
}

/** What a pointer or a key moving an edge reads besides the subject: where and how finely it snaps. */
export interface GapContext {
  readonly block: BlockId;
  readonly manifest: Manifest;
  /** The drawing the piece was found in: the one the pointer reads, before any change. */
  readonly drawing: Drawing;
  readonly granularity: Granularity;
}

/**
 * What a drag or a key changes: which of the elided coordinates and the
 * gap's width (the mode menu's toggles, never neither).
 */
export interface GapModes {
  readonly coordinates: boolean;
  readonly width: boolean;
}

/** The modes a canvas starts with: the coordinates alone. */
export const DEFAULT_GAP_MODES: GapModes = { coordinates: true, width: false };

/** A change of a stored elision: a new start, end or `width` (as `widthAs` writes it). */
export interface GapChange {
  readonly start?: Rational;
  readonly end?: Rational;
  readonly width?: StoredWidth;
}

/** The form the width of `stored` is written in: its own, a standard gap's in canvas units. */
function formOf(stored: Elision): WidthForm {
  const { width } = stored;
  if (width?.ratio !== undefined) return "ratio";
  if (width?.span !== undefined) return "span";
  return "canvas";
}

/**
 * The change an edge's move makes under `modes`: `value` the edge's new
 * value (`null` where the coordinates do not move or it is held where it
 * is), the gap's drawn width grown by `grown` item units where the width
 * moves alone. With the coordinates, the natural width follows the moved
 * edge; with both modes the drawn width follows it too, so what lies beyond
 * the edge stays (the gap swallows the line); with the width alone the
 * drawn width grows and the coordinates stay. A width is written in the
 * elision's form (`widthAs`; a standard gap as canvas units), never wider
 * than its natural width nor down to nothing. `null` where nothing changes.
 */
function changeOf(
  subject: GapSubject,
  edge: GapEdge,
  modes: GapModes,
  value: Rational | null,
  grown: number,
): GapChange | null {
  const { piece, axis, timeline, stored } = subject;
  const { gap } = piece;
  const run = axis.runBeside(gap, edge);
  const base = axis.baseOf(timeline.id);
  const k = run === null ? null : axis.unitScale(run, timeline.id);
  if (run === null || base === null || k === null) return null;
  const current = edge === "start" ? subject.start : subject.end;
  const moved = modes.coordinates && value !== null && !value.equals(current) ? value : null;
  const sign = edge === "end" ? 1 : -1;
  // The natural width follows a moved edge, in the item's units.
  const natural =
    gap.natural +
    (moved === null
      ? 0
      : (sign * toFloat(moved.subtract(current)) * k) / axis.exposure.place.scale);
  let width: StoredWidth | undefined;
  if (modes.width) {
    const drawn = modes.coordinates ? gap.drawn + (natural - gap.natural) : gap.drawn + grown;
    const held = Math.min(Math.max(drawn, 0), natural);
    if (held > 0 && held !== gap.drawn) {
      width = widthAs(
        formOf(stored),
        { ...gap, natural, drawn: held },
        run.L,
        base.lambda,
        timeline.number_type,
      );
    }
  }
  if (moved === null && width === undefined) return null;
  return {
    ...(moved === null ? {} : { [edge]: moved }),
    ...(width === undefined ? {} : { width }),
  };
}

/**
 * The change a drag of the `edge` handle of `subject` by `dx` block units
 * makes under `modes` (Coordinates, Width, or both: then the drawn width
 * follows the natural one): the edge's value moves by `dx / k`, `k` the
 * block units per unit of the timeline on the run beside that edge
 * (`CardAxis.edgeScale`), to the snapping value (`targetsOf`) within `tolerance` block units of it, else
 * the simplest value within `reach` block units, held where the edge may
 * lie; the width by `dx` (the start's handle mirrored), the simplest
 * within `reach`. `null` where nothing changes.
 */
export function gapDrag(
  context: GapContext,
  subject: GapSubject,
  edge: GapEdge,
  dx: number,
  modes: GapModes,
  tolerance: number,
  reach: number,
): GapChange | null {
  const k = subject.axis.edgeScale(subject.piece.gap, edge);
  if (k === null || !Number.isFinite(dx)) return null;
  const scale = subject.axis.exposure.place.scale;
  const current = edge === "start" ? subject.start : subject.end;
  let value: Rational | null = null;
  if (modes.coordinates) {
    const wanted = toFloat(current) + dx / k;
    let best: { readonly value: Rational; readonly distance: number } | null = null;
    for (const target of targetsOf(subject)) {
      const distance = Math.abs(toFloat(target) - wanted) * k;
      if (distance <= tolerance && (best === null || distance < best.distance)) {
        best = { value: target, distance };
      }
    }
    const found =
      best?.value ??
      snapped(context.block, subject.timeline, wanted, reach / k, context.granularity);
    value = found === null ? null : heldEdge(subject, edge, found);
  }
  const sign = edge === "end" ? 1 : -1;
  const grown =
    simplestWithin(subject.piece.gap.drawn + (sign * dx) / scale, reach / scale) -
    subject.piece.gap.drawn;
  return changeOf(subject, edge, modes, value, grown);
}

/**
 * The change one step of `step` block units in `direction` (−1 left, 1
 * right) makes to the `edge` of `subject` under `modes`: the edge's value
 * the simplest within half a step of the value moved `step / k`, or the
 * nearest snapping value lying on the way, held where the edge may lie;
 * the width by `step` (the start's edge mirrored). `null` where nothing
 * changes.
 */
export function gapStep(
  context: GapContext,
  subject: GapSubject,
  edge: GapEdge,
  direction: -1 | 1,
  step: number,
  modes: GapModes,
): GapChange | null {
  const k = subject.axis.edgeScale(subject.piece.gap, edge);
  if (k === null || !(step > 0)) return null;
  const current = edge === "start" ? subject.start : subject.end;
  let value: Rational | null = null;
  if (modes.coordinates) {
    const units = step / k;
    const moved = snapped(
      context.block,
      subject.timeline,
      toFloat(current) + direction * units,
      units / 2,
      context.granularity,
    );
    if (moved !== null) {
      const between = (each: Rational) =>
        direction * each.compare(current) > 0 && direction * moved.compare(each) > 0;
      const passed = targetsOf(subject)
        .filter(between)
        .sort((left, right) => direction * left.compare(right))[0];
      value = heldEdge(subject, edge, passed ?? moved);
    }
  }
  const sign = edge === "end" ? 1 : -1;
  const grown = (sign * direction * step) / subject.axis.exposure.place.scale;
  return changeOf(subject, edge, modes, value, grown);
}

/** An exact value on `timeline`'s own axis as a command writes it; `undefined` where its number type cannot hold it. */
function axisValue(value: Real, timeline: TimelineManifest) {
  const coordinate = exactCoordinate(value, timeline.unit, timeline.number_type);
  return coordinate === undefined ? undefined : axisValueOf(coordinate.value);
}

/** A stored width as a command writes it: a span on its timeline's own axis. */
function writtenWidth(width: StoredWidth, timeline: TimelineManifest) {
  if (width === null) return null;
  if ("span" in width) {
    const span = axisValue(width.span, timeline);
    return span === undefined ? undefined : { span };
  }
  return width;
}

/**
 * The command storing `change` of `subject` in block `block` of `view`:
 * one `set` on the stored elision of the members that change; `null` where
 * nothing changes or a value cannot be written.
 */
export function gapCommand(
  view: View,
  block: BlockId,
  subject: GapSubject,
  change: GapChange,
): Command | null {
  if (view.blocks[block] === undefined) return null;
  const { timeline, stored } = subject;
  const values: Record<string, unknown> = {};
  if (change.start !== undefined && !change.start.equals(subject.start)) {
    values.start = axisValue(change.start, timeline);
  }
  if (change.end !== undefined && !change.end.equals(subject.end)) {
    values.end = axisValue(change.end, timeline);
  }
  if (change.width !== undefined) {
    const width = writtenWidth(change.width, timeline);
    if (JSON.stringify(width) !== JSON.stringify(stored.width ?? null)) values.width = width;
  }
  if (Object.keys(values).length === 0 || Object.values(values).includes(undefined)) return null;
  const target = inBlock(block, idAddress(stored.id));
  return { type: "set", changes: [{ target, values }] };
}

/** The standard gap's width, which a stored elision states by stating none. */
const STANDARD_GAP = 32;

/**
 * The command storing the default elisions the card `key` of `drawing`
 * (block `block` of `view`) draws, as it draws them (the switch from
 * Proportional to Custom, which keeps every gap where it is drawn): one
 * `add` into the block of every default gap of the card in drawing order,
 * each with its elided coordinates exactly, `width` `{canvas: g}` unless it
 * is the standard gap, `display` the card's `elision-display`, no `name`
 * (core mints the IDs). Refused where the card draws no default gap.
 */
export function defaultsStored(
  view: View,
  block: BlockId,
  drawing: Drawing,
  key: PlaceKey,
): Command | { readonly refused: string } {
  const manifest = view.blocks[block]?.manifest;
  const text = placeKeyText(key);
  const exposure = drawing.elisions.find((each) => placeKeyText(each.key) === text);
  const gaps = exposure?.gaps.filter((gap) => gap.origin === "default") ?? [];
  if (manifest === undefined || exposure === undefined || gaps.length === 0) {
    return { refused: "The card draws no automatic elision." };
  }
  const elision = gaps.map((gap) => {
    const timeline = findTimeline(manifest, gap.timeline);
    if (timeline === undefined) return undefined;
    const start = axisValue(gap.start, timeline);
    const end = axisValue(gap.end, timeline);
    if (start === undefined || end === undefined) return undefined;
    return {
      timeline: gap.timeline,
      start,
      end,
      ...(gap.drawn === STANDARD_GAP ? {} : { width: { canvas: gap.drawn } }),
      display: [...exposure.display],
    };
  });
  if (elision.includes(undefined)) return { refused: "The automatic elisions cannot be stored." };
  return { type: "add", into: { block }, elision };
}

/**
 * The command returning the root `root` of block `block` of `view` to its
 * defaults (Remove all, back to the derived gaps): one `remove` of every card
 * elision of its tree (core's `elisionsUnder`; group elisions are the
 * frames'); `null` where it stores none.
 */
export function defaultsRemoval(view: View, block: BlockId, root: string): Command | null {
  const manifest = view.blocks[block]?.manifest;
  if (manifest === undefined) return null;
  const targets = elisionsUnder(manifest, root).map((elision) =>
    inBlock(block, idAddress(elision.id)),
  );
  return targets.length === 0 ? null : { type: "remove", targets };
}

/** An elision given to `add`, by its timeline and stretch. */
export interface StoredEntry {
  readonly timeline: string;
  readonly start: Real;
  readonly end: Real;
}

/**
 * The address of the elision `entry` was stored as in block `block` of
 * `view`, found by its values: the stored elision lying on its timeline
 * with its start and end; `null` where none does.
 */
export function storedAs(view: View, block: BlockId, entry: StoredEntry): Address | null {
  const manifest = view.blocks[block]?.manifest;
  const timeline = manifest === undefined ? undefined : findTimeline(manifest, entry.timeline);
  if (manifest === undefined || timeline === undefined) return null;
  const start = toRational(entry.start);
  const end = toRational(entry.end);
  const found = manifest.graphical?.elisions?.find(
    (elision) =>
      elision.timeline === entry.timeline &&
      exactOn(elision.start, timeline).equals(start) &&
      exactOn(elision.end, timeline).equals(end),
  );
  return found === undefined ? null : inBlock(block, idAddress(found.id));
}
