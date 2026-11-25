/**
 * The flow control band: the flow control of a root's whole tree, each
 * element at its position on the root's axis (`docs/drawing.md` in
 * TimeToShare, sections 6.4 and 6.6): the breaks, section breaks and
 * barlines (its flow lines), the arcs of the jumps, the symbols, the volta
 * brackets and the stacks of the elements' labels; the label tiers, the
 * flow row, the symbol row, the bracket rows and the jump rows. Only the
 * root of a member drawing draws one: a child's flow control is drawn in
 * its root's band, the elements kept in the child's band for the cascade.
 */

import type {
  ElementAddress,
  FlowControlElement,
  JumpDestination,
  Manifest,
  TimelineManifest,
} from "@timetoalign/tilie-core";
import {
  assertNever,
  destinationPlace,
  FLOW_LINE_ROLES,
  type FlowLineRole,
  idAddress,
  isRejected,
  partAddress,
} from "@timetoalign/tilie-core";
import { elementKey, flowSymbols, memberFlow, passesText } from "@timetoalign/tilie-core/drawing";
import type { Real } from "@timetoalign/tilie-core/numbers";
import { compareReal, realOf } from "@timetoalign/tilie-core/numbers";
import type { ElementType } from "@timetoalign/timetoshare";
import type { PreparedBand } from "./bands.ts";
import type { Style } from "./cascade.ts";
import {
  BRACKET_HOOK_GAP,
  BRACKET_ROOM,
  BRACKET_TEXT_OFFSET,
  FLOW_LINE_LABEL_OFFSET,
  JUMP_DEPTH,
  JUMP_PITCH,
  LABEL_GAP,
} from "./constants.ts";
import type { Point } from "./elements.ts";
import { type Extent, labelExtent, Rows, tieredFit } from "./fit.ts";
import { fadedStyle } from "./markers.ts";
import { centredLabel } from "./names.ts";
import {
  add,
  coordinateValue,
  exactDistance,
  lengthValue,
  midpoint,
  negate,
  times,
  zero,
} from "./numbers.ts";
import {
  type Entry,
  type Holder,
  type Measured,
  maxSize,
  nth,
  type Scope,
  type Styled,
  shown,
} from "./traversal.ts";

/**
 * Where a destination of `jump` lands on the own axis of `timeline` of
 * `manifest`, which lists the jump (core's `destinationPlace`): `by`, that
 * distance from the jump's coordinate; `to`, the coordinate of the jump
 * target, the start of the region or the offset of the child timeline with
 * that ID, or 0 for the timeline itself; neither, the start of the jump's
 * section, found among the section breaks of its root's whole tree (section
 * 3.1). `undefined` for a `to` that names none of these or names a rejected
 * jump target (a rejected element is no place), which only a rejected jump
 * may hold.
 */
function placeOf(
  manifest: Manifest,
  timeline: TimelineManifest,
  jump: FlowControlElement,
  destination: JumpDestination,
): Real | undefined {
  const place = destinationPlace(manifest, timeline, jump, destination);
  switch (place.kind) {
    case "nowhere":
      return undefined;
    case "jump_target":
      return isRejected(place.element) ? undefined : realOf(place.at);
    case "by":
    case "region":
    case "timeline":
    case "child":
    case "section":
      return realOf(place.at);
    default:
      return assertNever(place);
  }
}

/** `left − right` as section 3.1 combines values: `left + (−right)`. */
const difference = (left: Real, right: Real): Real => add(left, negate(right));

/** The larger of two values, compared exactly; the first of two equal ones. */
const larger = (left: Real, right: Real): Real => (compareReal(right, left) > 0 ? right : left);

/** Whether a distance on the own axis of `timeline` is 0, in whatever number type it is written. */
function isZero(distance: NonNullable<JumpDestination["by"]>, timeline: TimelineManifest): boolean {
  const { number_type } = timeline;
  return compareReal(coordinateValue(distance, number_type), zero(number_type)) === 0;
}

/** A drawn part of a flow-control element: its key, address and cascaded style. */
type Part = Holder & Styled;

/**
 * One flow-control element as the band draws it: the element, the timeline
 * stating it, where that timeline starts and where the element lies on the
 * root's axis, the timeline's end as the band reads it, the holder of its
 * drawings (its own key, or the band's for a jump target, which is no
 * element), and whether it is displayed at all (its holder chain).
 */
interface Gathered {
  readonly element: FlowControlElement;
  readonly timeline: TimelineManifest;
  readonly start: Real;
  readonly at: Real;
  /** Where its timeline ends on the root's axis, never past the root's end (section 6.4, Brackets). */
  readonly end: Real;
  readonly holder: Part;
  /** The band holding it for the cascade: its timeline's flow control band, or the member's. */
  readonly band: Holder;
}

/** A style faded where its element is rejected (`isRejected`). */
const believedStyle = (style: Style, element: FlowControlElement): Style =>
  isRejected(element) ? fadedStyle(style) : style;

/**
 * The flow-control elements the flow control band of `line` lays out
 * (section 6.4, Flow control): none but for the root of the member drawing,
 * whose band lays out those of every timeline of its tree in traversal
 * order, each timeline's in the order of its `flow_control`, each at its
 * timeline's start plus its coordinate; for a member that is a child
 * timeline, those of its root's tree lying on `[0, λ]` of its own axis
 * (core's `memberFlow`), an element of a timeline outside the member's tree
 * held by the member's own flow control band. None where the root's own flow
 * control band is not displayed, which hides everything it lays out, the
 * flow control of the whole tree in the card (section 2.4). Otherwise an
 * element is laid out only where its holders display it: its band (a
 * child's own flow control band included), and, for an element of the
 * member's tree, its timeline's line and every band holding that
 * (`Entry.drawn`).
 */
function gathered(scope: Scope, line: Entry): readonly Gathered[] {
  const { rootEntry, cascade } = scope;
  const own = rootEntry.bands.flow_control;
  if (line !== rootEntry || !rootEntry.drawn || !shown(own.style)) return [];
  const keyed = (
    type: ElementType | null,
    at: ElementAddress,
    timeline: TimelineManifest,
    holder: Holder,
  ): Part => {
    const key = elementKey(type, at, timeline, holder.key);
    return { key, address: at, style: cascade.resolve(key, holder.style) };
  };
  const rootEnd = rootEntry.end;
  const capped = (end: Real) => (compareReal(end, rootEnd) > 0 ? rootEnd : end);
  const of = (
    element: FlowControlElement,
    timeline: TimelineManifest,
    start: Real,
    end: Real,
    band: Holder,
  ): Gathered => {
    const at = add(start, coordinateValue(element.coordinate, timeline.number_type));
    const role = element.role;
    const type: ElementType | null = role === "jump_target" ? null : role;
    const holder =
      type === null
        ? { key: band.key, address: idAddress(element.id), style: band.style }
        : keyed(type, idAddress(element.id), timeline, band);
    return { element, timeline, start, at, end: capped(end), holder, band };
  };
  const shownEntry = (entry: Entry) => entry.drawn && shown(entry.bands.flow_control.style);
  if (scope.member.ancestors.length === 0) {
    return scope.entries
      .filter(shownEntry)
      .flatMap((entry) =>
        entry.manifest.flow_control.map((element) =>
          of(element, entry.manifest, entry.start, entry.end, entry.bands.flow_control),
        ),
      );
  }
  const entries = new Map(scope.entries.map((entry) => [entry.manifest, entry]));
  return memberFlow(scope.manifest, scope.member).flatMap(({ element, timeline, start }) => {
    const entry = entries.get(timeline);
    if (entry !== undefined) {
      return shownEntry(entry)
        ? [of(element, timeline, start, entry.end, entry.bands.flow_control)]
        : [];
    }
    const length = lengthValue(timeline);
    return [of(element, timeline, start, length === null ? rootEnd : add(start, length), own)];
  });
}

/**
 * The labels of an element's stack it draws (section 6.4, Flow labels):
 * those its cascaded `label-display` lists, of its name, its ID and its own
 * label, in that order, those whose text is null left out, each displayed.
 */
function stackOf(scope: Scope, item: Gathered): readonly { label: Part; text: Measured }[] {
  const words = item.holder.style["label-display"].split(" ");
  const { element, timeline, holder } = item;
  const texts = { name: element.name, id: element.id, label: element.label };
  return (["name", "id", "label"] as const).flatMap((word) => {
    const text = texts[word];
    if (!words.includes(word) || text === null || text === undefined) return [];
    const at = partAddress(idAddress(element.id), word);
    const key = elementKey("label", at, timeline, holder.key);
    const style = believedStyle(scope.cascade.resolve(key, holder.style), element);
    if (!shown(style)) return [];
    const label = { key, address: at, style };
    return [{ label, text: scope.measured(label, text) }];
  });
}

/** A part of an element held by it: its symbol, its brackets or its label, faded where it is rejected. */
function partOf(
  scope: Scope,
  item: Gathered,
  type: "symbol" | "bracket" | "label",
  word: "symbol" | "bracket" | "label",
): Part {
  const at = partAddress(idAddress(item.element.id), word);
  const key = elementKey(type, at, item.timeline, item.holder.key);
  const style = believedStyle(scope.cascade.resolve(key, item.holder.style), item.element);
  return { key, address: at, style };
}

/** The sum of `values`, left to right, 0 for none. */
const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

/**
 * The flow control band of the timeline drawn with the line `line` (section
 * 6.4, Gathering, Flow control, Flow labels, Symbols, Brackets and Arcs):
 * present only for the root of the member drawing, whose band draws the
 * band's elements (`gathered`), in their order:
 *
 * - the **flow lines**, each displayed break, section break and barline;
 * - the **stacks** (`stackOf`) of the displayed flow lines and of every
 *   jump, placed by one first fit into the flow label tiers, each stack one
 *   item as many lines high as it has labels, with the extent `[L × u + 3 −
 *   1, L × u + 3 + w + 1]`, `w` its widest label; a tier is as many lines
 *   high as its highest stack, `T` the lines of all tiers;
 * - the **symbols** (core's `flowSymbols`), one text centred on its
 *   element's position on the symbol row, `Hs = h(zs)` wide;
 * - the **brackets**: of each jump, one per destination whose
 *   `manifestation` is `volta` and whose place resolves, by their places;
 *   each but the last from its place to its cut, the first position after
 *   it of a band element not rejected that is a jump, a section break or a
 *   `volta` break, else its timeline's end (`Gathered.end`); the last, open,
 *   as long as the bracket before it, a lone one as long as the distance
 *   from its jump to its place, ending at its cut where that lies before; a
 *   jump's run placed by first fit from its first place to the largest end
 *   of its brackets into the `B` bracket rows, `hb = h(zb) + 4` each;
 * - the **arcs** of each displayed jump, one per destination not `by` 0
 *   whose place resolves (`placeOf`), in a member's card only where its to
 *   lies on the member's stretch; sorted stably by span and placed by first
 *   fit, never widened by their labels, into the `K` jump rows; then each
 *   row's labels, in the order of its arcs, by one first fit of the row
 *   into its `Tk` label tiers (`Tk = 1` without a label), the row's pitch
 *   `pjk = 6 + S + Tk × h(9)`.
 *
 * Outwards from the band's start `c`: the flow label tiers, `T × h(9)`; the
 * flow row `f0 = c + T × h(9)`; the symbol row; the bracket rows; from `f1 =
 * f0 + Hs + B × hb` the jump rows, row `k`'s apex `f1 + (4 + S) + (pj1 + … +
 * pj(k − 1))`. The band is `T × h(9) + Hs + B × hb + (4 + S) + (pj1 + … +
 * pj(K − 1)) + 2 + TK × h(9)` wide for `K ≥ 1` jump rows and `T × h(9) + Hs
 * + B × hb` for none, summed left to right, the pitches summed first; 9 is
 * the largest font size of its drawn arc and stack labels. A label in tier
 * `j ≥ 2` of a jump row, and the stack of a jump whose first line is not
 * line 1, is joined by a leader (section 6.6, Leaders). An element marking
 * a position in a gap is not drawn (section 6.6, Elisions): a flow line
 * with its stack, a jump's stack, a symbol, a bracket whose place or end
 * lies in one, and an arc whose from, to or the midpoint of the two does,
 * each with its label and its leader. A rejected element (some actor
 * believes it `false`) is drawn faded with everything it draws.
 */
export function flowControlBand(scope: Scope, line: Entry): PreparedBand {
  const { measured, relativeX, S, h, a, d } = scope;
  const items = gathered(scope, line);

  // The flow lines.
  const lines = items.flatMap((item) => {
    const role = FLOW_LINE_ROLES.find(
      (drawn): drawn is FlowLineRole => drawn === item.element.role,
    );
    if (role === undefined) return [];
    const style = believedStyle(item.holder.style, item.element);
    return shown(style) ? [{ item, role, address: item.holder.address, style }] : [];
  });
  const drawnLines = new Set(lines.map(({ item }) => item));

  // The stacks of the displayed flow lines and of every jump, by first fit into the label tiers.
  const stacked = items.flatMap((item) => {
    if (item.element.role !== "jump" && !drawnLines.has(item)) return [];
    const stack = stackOf(scope, item);
    if (stack.length === 0) return [];
    const left = relativeX(item.at) + FLOW_LINE_LABEL_OFFSET;
    const width = Math.max(...stack.map(({ text }) => text.width));
    return [{ item, stack, extent: [left - 1, left + width + 1] as Extent }];
  });
  const tiers = new Rows();
  const tierOf = stacked.map(({ extent }) => tiers.place(extent));
  const heights = tiers.rows.map(() => 0);
  stacked.forEach(({ stack }, index) => {
    const tier = nth(tierOf, index) - 1;
    heights[tier] = Math.max(nth(heights, tier), stack.length);
  });
  const linesBefore = heights.map((_, tier) => sum(heights.slice(0, tier)));
  const T = sum(heights);
  const stacks = stacked.map((stack, index) => ({
    ...stack,
    tier: nth(tierOf, index),
    first: nth(linesBefore, nth(tierOf, index) - 1) + 1,
  }));

  // The symbols.
  const symbols = items.flatMap((item) => {
    const glyphs = flowSymbols(item.element);
    if (glyphs.length === 0) return [];
    const part = partOf(scope, item, "symbol", "symbol");
    return shown(part.style) ? [{ item, part, text: measured(part, glyphs.join("")) }] : [];
  });

  // The brackets, run by run.
  const stops = items
    .filter(
      ({ element }) =>
        !isRejected(element) &&
        (element.role === "jump" ||
          element.role === "section_break" ||
          (element.role === "break" && element.manifestation === "volta")),
    )
    .map(({ at }) => at);
  const jumps = items.filter((item) => item.element.role === "jump");
  const runs = jumps.flatMap((item) => {
    const volta = (item.element.targets ?? []).some(
      (destination) => destination.manifestation === "volta",
    );
    if (!volta) return [];
    const part = partOf(scope, item, "bracket", "bracket");
    if (!shown(part.style)) return [];
    // Each bracket from its place to its cut, by their places.
    const cut = (from: Real) =>
      stops
        .filter((stop) => compareReal(stop, from) > 0)
        .reduce((first, stop) => (compareReal(stop, first) < 0 ? stop : first), item.end);
    const placed = (item.element.targets ?? [])
      .flatMap((destination) => {
        if (destination.manifestation !== "volta") return [];
        const place = placeOf(scope.manifest, item.timeline, item.element, destination);
        if (place === undefined) return [];
        const from = add(item.start, place);
        const { passes } = destination;
        const text = passes === undefined ? null : measured(part, passesText(passes));
        return [{ from, to: cut(from), text }];
      })
      .sort((left, right) => compareReal(left.from, right.from));
    // The last bracket as long as the one before it, a lone one as long as jump → place, never
    // beyond its cut.
    const last = placed.at(-1);
    if (last === undefined) return [];
    const before = placed.at(-2);
    const length =
      before === undefined
        ? larger(difference(last.from, item.at), difference(item.at, last.from))
        : difference(before.to, before.from);
    const reach = add(last.from, length);
    const brackets = [
      ...placed.slice(0, -1),
      { ...last, to: compareReal(last.to, reach) < 0 ? last.to : reach },
    ];
    // From the first bracket's place to the largest end of its brackets.
    const extent: Extent = [
      relativeX(nth(brackets, 0).from),
      relativeX(brackets.map(({ to }) => to).reduce(larger)),
    ];
    return [{ item, part, brackets, extent }];
  });
  const bracketRows = new Rows();
  const placedRuns = runs.map((run) => ({ ...run, row: bracketRows.place(run.extent) }));

  // The arcs of the displayed jumps; in a member's card only those arriving on its stretch.
  const member = scope.member.ancestors.length > 0;
  const arcs = jumps.flatMap((item) => {
    const style = believedStyle(item.holder.style, item.element);
    if (!shown(style)) return [];
    const labelled = item.holder.style["label-display"].split(" ").includes("label");
    const label = partOf(scope, item, "label", "label");
    return (item.element.targets ?? []).flatMap((destination) => {
      // `by` 0 is going on, written where the source prints it: no jump, no arc.
      if (destination.by !== undefined && isZero(destination.by, item.timeline)) return [];
      const place = placeOf(scope.manifest, item.timeline, item.element, destination);
      if (place === undefined) return [];
      const to = add(item.start, place);
      if (member && !onStretch(scope, to)) return [];
      const text = labelled && shown(label.style) ? (destination.label ?? null) : null;
      return [{ item, style, label, from: item.at, to, text }];
    });
  });
  // By span, then by first fit into the jump rows; each row's labels by one first fit of the row.
  const sorted = arcs
    .map((arc, index) => ({ arc, index, span: exactDistance(arc.to, arc.from) }))
    .sort((left, right) => left.span.compare(right.span) || left.index - right.index)
    .map(({ arc }) => {
      const middle = midpoint(arc.from, arc.to);
      const text = arc.text === null ? undefined : measured(arc.label, arc.text);
      return { arc, middle, text };
    });
  const fitted = tieredFit(
    sorted.map(({ arc, middle, text }) => {
      const [xFrom, xTo] = [relativeX(arc.from), relativeX(arc.to)];
      return {
        extent: [Math.min(xFrom, xTo), Math.max(xFrom, xTo)] as Extent,
        label: text === undefined ? undefined : labelExtent(relativeX(middle), text.width),
      };
    }),
  );
  const labelledArcs = sorted.map((item, index) => ({
    ...item,
    row: nth(fitted.row, index),
    tier: fitted.tier[index] ?? 0,
  }));
  const K = fitted.tiers.length;
  const Tk = fitted.tiers;

  const size = maxSize([
    ...labelledArcs.flatMap(({ arc, text }) => (text === undefined ? [] : [arc.label])),
    ...stacks.flatMap(({ stack }) => stack.map(({ label }) => label)),
  ]);
  const symbolSize = maxSize(symbols.map(({ part }) => part));
  const Hs = symbols.length === 0 ? 0 : h(symbolSize);
  const bracketSize = maxSize(runs.map(({ part }) => part));
  const hb = h(bracketSize) + BRACKET_ROOM;
  const B = bracketRows.count;
  const pj = Tk.map((tiersOfRow) => JUMP_PITCH + S + tiersOfRow * h(size));
  // The pitches before row k, summed first.
  const pitchesBefore = (row: number) => sum(pj.slice(0, row - 1));
  const depth = JUMP_DEPTH + S;
  const inner = T * h(size) + Hs + B * hb;
  const width =
    K === 0 ? inner : inner + depth + pitchesBefore(K) + LABEL_GAP + nth(Tk, K - 1) * h(size);

  // The elements drawing anything, each counted once (section 6.4, What a band holds).
  const drawing = new Set<Gathered>([
    ...lines.map(({ item }) => item),
    ...stacks.map(({ item }) => item),
    ...symbols.map(({ item }) => item),
    ...runs.map(({ item }) => item),
    ...arcs.map(({ item }) => item),
  ]);
  return {
    facet: "flow_control",
    elements: drawing.size,
    width,
    extents: [
      ...lines.map(({ item }): Extent => [relativeX(item.at), relativeX(item.at)]),
      ...stacks.map(({ extent }) => extent),
      ...symbols.map(({ item, text }) => labelExtent(relativeX(item.at), text.width)),
      ...placedRuns.map(({ extent }) => extent),
      ...labelledArcs.map(({ arc }): Extent => {
        const [xFrom, xTo] = [relativeX(arc.from), relativeX(arc.to)];
        return [Math.min(xFrom, xTo), Math.max(xFrom, xTo)];
      }),
    ],
    centred: [
      ...labelledArcs.flatMap(({ arc, middle, text }) => {
        // An arc leaving or arriving at a position in a gap is not drawn, nor is its label (section 6.6).
        const x = scope.drawnX(middle);
        const elided = [arc.from, arc.to].some((value) => scope.drawnX(value) === undefined);
        return text === undefined || x === undefined || elided ? [] : [{ width: text.width, x }];
      }),
      ...symbols.flatMap(({ item, text }) => {
        const x = scope.drawnX(item.at);
        return x === undefined ? [] : [{ width: text.width, x }];
      }),
    ],
    draw: (start, side, at) => {
      const elided = (...values: Real[]) => values.some((value) => at.gap(value) !== undefined);
      const f0 = start + T * h(size);
      const yf = at.yAt(side, f0);
      const f1 = f0 + Hs + B * hb;
      const apex = (row: number) => f1 + depth + pitchesBefore(row);
      const shownArcs = labelledArcs.filter(({ arc, middle }) => !elided(arc.from, arc.to, middle));
      const shownStacks = stacks.filter(({ item }) => !elided(item.at));
      // The ordinate of line n of the flow label tiers, counted inwards from the flow row from 1.
      const lineAt = (n: number) => f0 - (n - 1) * h(size);
      return {
        flowLines: lines
          .filter(({ item }) => !elided(item.at))
          .map(({ item, role, address, style }) => ({
            type: role,
            address,
            style,
            x: at.x(item.at),
            y1: yf,
            y2: at.flowLineEnd(side),
          })),
        jumps: shownArcs.map(({ arc, row }) => {
          const ya = at.yAt(side, apex(row));
          const w = arc.style["stroke-width"];
          const xf = at.x(arc.from);
          const xt = at.xAfter(arc.to);
          const q = (xt - xf) / 4;
          const yc = yf + times(4n, 3n, ya - yf);
          const cx = xt - q;
          // The head points along the curve's direction at its end, from C2 to P3.
          const length = Math.sqrt((xt - cx) * (xt - cx) + (yf - yc) * (yf - yc));
          const ux = (xt - cx) / length;
          const uy = (yf - yc) / length;
          const base: Point = [xt - 4 * w * ux, yf - 4 * w * uy];
          const [nx, ny] = [-uy, ux];
          return {
            type: "jump",
            address: arc.item.holder.address,
            style: arc.style,
            start: [xf, yf],
            c1: [xf + q, yc],
            c2: [cx, yc],
            tip: [xt, yf],
            base,
            corners: [
              [base[0] - 2 * w * nx, base[1] - 2 * w * ny],
              [base[0] + 2 * w * nx, base[1] + 2 * w * ny],
            ],
          };
        }),
        brackets: placedRuns.flatMap(({ part, brackets, row }) => {
          const bj = f0 + Hs + (row - 1) * hb;
          const y = at.yAt(side, bj + hb);
          const textStart = bj + BRACKET_HOOK_GAP;
          const yh = at.yAt(side, textStart);
          const z = part.style["font-size"];
          return brackets.flatMap((bracket, index) => {
            if (elided(bracket.from, bracket.to)) return [];
            const x1 = at.xAfter(bracket.from);
            return [
              {
                type: "bracket",
                address: part.address,
                style: part.style,
                x1,
                x2: at.x(bracket.to),
                y,
                yh,
                closed: index < brackets.length - 1,
                tx: x1 + BRACKET_TEXT_OFFSET,
                baseline: at.beyond(side, yh, z),
                text: bracket.text?.clean ?? null,
              },
            ];
          });
        }),
        symbols: symbols.flatMap(({ item, part, text }) =>
          elided(item.at)
            ? []
            : [
                {
                  type: "symbol",
                  address: part.address,
                  style: part.style,
                  x: at.x(item.at),
                  baseline: at.beyond(side, yf, part.style["font-size"]),
                  text: text.clean,
                },
              ],
        ),
        jumpLabels: shownArcs.flatMap(({ arc, middle, text, row, tier }) =>
          text === undefined
            ? []
            : [
                centredLabel(
                  arc.label,
                  at.x(middle),
                  at.beyond(side, at.yAt(side, apex(row) + LABEL_GAP + (tier - 1) * h(size)), size),
                  text,
                ),
              ],
        ),
        // A label in tier j ≥ 2 of a jump row, from the row's apex to its label's line.
        jumpLeaders: shownArcs.flatMap(({ arc, middle, text, row, tier }) => {
          if (text === undefined || tier < 2) return [];
          const leader = scope.leaderOf(arc.label);
          if (!shown(leader.style)) return [];
          const x = at.x(middle);
          return [
            {
              type: "leader",
              address: leader.address,
              style: believedStyle(leader.style, arc.item.element),
              x1: x,
              y1: at.yAt(side, apex(row)),
              x2: x,
              y2: at.yAt(side, apex(row) + LABEL_GAP + (tier - 1) * h(size)),
            },
          ];
        }),
        // A jump's stack whose first line is not line 1, from the flow row to that line.
        stackLeaders: shownStacks.flatMap(({ item, stack, first }) => {
          const [head] = stack;
          if (item.element.role !== "jump" || first < 2 || head === undefined) return [];
          const leader = scope.leaderOf(head.label);
          if (!shown(leader.style)) return [];
          const x = at.x(item.at);
          return [
            {
              type: "leader",
              address: leader.address,
              style: believedStyle(leader.style, item.element),
              x1: x,
              y1: yf,
              x2: x,
              y2: at.yAt(side, lineAt(first)),
            },
          ];
        }),
        flowLineLabels: shownStacks.flatMap(({ item, stack, first }) =>
          stack.map(({ label, text }, index) => {
            const fn = lineAt(first + index);
            return {
              type: "label",
              address: label.address,
              style: label.style,
              x: at.x(item.at) + FLOW_LINE_LABEL_OFFSET,
              baseline: side === "below" ? at.y + fn - d(size) : at.y - fn + a(size),
              anchor: "start",
              text: text.clean,
            };
          }),
        ),
      };
    },
  };
}

/** Whether a position on the member's axis lies on its stretch `[0, λ]` (section 6.4, Gathering). */
function onStretch(scope: Scope, value: Real): boolean {
  return (
    compareReal(value, zero(scope.root.number_type)) >= 0 && compareReal(value, scope.lambda) <= 0
  );
}
