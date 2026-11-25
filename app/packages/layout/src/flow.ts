/**
 * The flow control band: a timeline's displayed breaks, section breaks,
 * barlines and jumps and those of the segments that join it; the label
 * tiers of the lines and the flow row, where jumps leave and arrive by rows
 * and the lines end (`docs/drawing.md` in TimeToShare, sections 6.4 and
 * 6.6). A jump target draws nothing of its own.
 */

import type {
  FlowControlElement,
  JumpDestination,
  TimelineManifest,
} from "@timetoalign/tilie-core";
import { FLOW_LINE_ROLES, idAddress, isRejected } from "@timetoalign/tilie-core";
import type { Real } from "@timetoalign/tilie-core/numbers";
import { compareReal } from "@timetoalign/tilie-core/numbers";
import type { PreparedBand } from "./bands.ts";
import { FLOW_LINE_LABEL_OFFSET, JUMP_DEPTH, JUMP_PITCH, LABEL_GAP } from "./constants.ts";
import type { Point } from "./elements.ts";
import { type Extent, labelExtent, Rows, widen } from "./fit.ts";
import { fadedStyle } from "./markers.ts";
import { centredLabel } from "./names.ts";
import { add, coordinateValue, exactDistance, midpoint, times, zero } from "./numbers.ts";
import { type Entry, maxSize, type Owned, type Scope, shown } from "./traversal.ts";

/**
 * Where a destination of `jump` lands on the own axis of `timeline`, which
 * lists the jump: `by`, that distance from the jump's coordinate; `to`, the
 * coordinate of the jump target, the start of the region or the offset of
 * the child timeline with that ID, or 0 for the timeline itself; neither,
 * the start of the jump's section: the coordinate of the nearest section
 * break before the jump that is not rejected, else 0. `undefined` for a
 * `to` that names none of these, which only a rejected jump may hold.
 */
function placeOf(
  timeline: TimelineManifest,
  jump: FlowControlElement,
  destination: JumpDestination,
): Real | undefined {
  const own = (value: Parameters<typeof coordinateValue>[0]) =>
    coordinateValue(value, timeline.number_type);
  const from = own(jump.coordinate);
  if (destination.by !== undefined) return add(from, own(destination.by));
  const { to } = destination;
  if (to === undefined) {
    return timeline.flow_control
      .filter((item) => item.role === "section_break" && !isRejected(item))
      .map((item) => own(item.coordinate))
      .filter((start) => compareReal(start, from) < 0)
      .reduce(
        (nearest, start) => (compareReal(start, nearest) > 0 ? start : nearest),
        zero(timeline.number_type),
      );
  }
  if (to === timeline.id) return zero(timeline.number_type);
  const target = timeline.flow_control.find(
    (item) => item.role === "jump_target" && item.id === to,
  );
  if (target !== undefined) return own(target.coordinate);
  const region = timeline.regions.find((item) => item.id === to);
  if (region !== undefined) return own(region.start);
  const child = timeline.children.find((item) => item.id === to);
  return child === undefined ? undefined : own(child.offset);
}

/** An element's style and its label's, faded where the element is rejected (`isRejected`). */
function believed<T extends Owned>(item: T, element: FlowControlElement): T {
  if (!isRejected(element)) return item;
  return {
    ...item,
    style: fadedStyle(item.style),
    label: { ...item.label, style: fadedStyle(item.label.style) },
  };
}

/**
 * The flow control band of the timeline drawn with the line `line` (section
 * 6.4, Flow control and Segments without a line): the displayed breaks,
 * section breaks and barlines (its lines) and the displayed jumps of each
 * timeline of `sources`, the line first and then each joined segment, each
 * one's in canonical order. A jump draws one arc per destination, in the
 * order of its `targets`, from its coordinate to the destination's place
 * (`placeOf`); a destination whose place is `by` 0, which is going on and
 * no jump, draws none, nor does one whose place resolves nowhere. An arc is
 * drawn with its destination's `label`, else its jump's, else its
 * destination's manifestation, else with no label; every arc and every
 * label of a jump carries the jump's address. An element some actor
 * believes `false` (`isRejected`) is drawn faded (`fadedStyle`), with its
 * label, and takes its place in the rows as any other. The drawn labels of
 * the lines are placed in that order by first fit into the label tiers,
 * `T × h(9)` wide; the flow row lies `T × h(9)` beyond the band's start. The
 * arcs, sorted stably by span (the exact absolute difference of their to
 * and from positions), smallest first, are placed in that order by first fit
 * with the extent from the smaller to the larger of their from and to,
 * widened to their drawn label's extent, into the jump rows; row `k` has its
 * apex `f0 + (4 + S) + (k − 1) × pj` out, `pj = 6 + S + h(9)`, `S` the card
 * spacing. The band is `T × h(9) + (4 + S) + (K − 1) × pj + 2 + h(9)` wide for
 * `K ≥ 1` jump rows and
 * `T × h(9)` for none; 9 is the largest font size of its drawn arc and
 * line labels together. A line runs from the flow row to
 * `at.flowLineEnd`, its label starting at `x + 3` in its tier, tier 1
 * touching the flow row on the line's side of it. A line whose
 * coordinate lies in a gap is not drawn, nor is its label; nor is an arc
 * whose from, to or the midpoint of the two does, with its label (section
 * 6.6, Elisions).
 */
export function flowControlBand(scope: Scope, sources: readonly Entry[]): PreparedBand {
  const { owned, measured, relativeX, S, h, a, d } = scope;
  const held = sources.filter((source) => shown(source.bands.flow_control.style));
  const own = (source: Entry, value: Real) => add(source.start, value);
  const lines = held.flatMap((source) =>
    source.manifest.flow_control.flatMap((item) => {
      const role = FLOW_LINE_ROLES.find((drawn) => drawn === item.role);
      if (role === undefined) return [];
      const drawn = believed(owned(role, idAddress(item.id), source, "flow_control"), item);
      if (!shown(drawn.style)) return [];
      const at = own(source, coordinateValue(item.coordinate, source.manifest.number_type));
      return [{ ...drawn, role, at, text: item.label }];
    }),
  );
  const jumps = held.flatMap((source) =>
    source.manifest.flow_control.flatMap((item) => {
      if (item.role !== "jump") return [];
      const drawn = believed(owned("jump", idAddress(item.id), source, "flow_control"), item);
      if (!shown(drawn.style)) return [];
      const from = own(source, coordinateValue(item.coordinate, source.manifest.number_type));
      const arcs = (item.targets ?? []).flatMap((destination) => {
        const place = placeOf(source.manifest, item, destination);
        if (place === undefined) return [];
        const to = own(source, place);
        // `by` 0 is going on, written where the source prints it: no jump, no arc.
        if (destination.by !== undefined && exactDistance(to, from).numerator === 0n) return [];
        const text = destination.label ?? item.label ?? destination.manifestation ?? null;
        return [{ ...drawn, from, to, text }];
      });
      return arcs.length === 0 ? [] : [arcs];
    }),
  );
  const arcs = jumps.flat();

  // The drawn labels of the lines, by first fit into the label tiers.
  const tiers = new Rows();
  const labelledLines = lines.flatMap((item) => {
    if (item.text === null || !shown(item.label.style)) return [];
    const text = measured(item.label, item.text);
    const left = relativeX(item.at) + FLOW_LINE_LABEL_OFFSET;
    const extent: Extent = [left - 1, left + text.width + 1];
    return [{ item, text, extent, tier: tiers.place(extent) }];
  });

  // The arcs, sorted stably by span, then by first fit into the jump rows.
  const rows = new Rows();
  const placedJumps = arcs
    .map((jump, index) => ({ jump, index, span: exactDistance(jump.to, jump.from) }))
    .sort((left, right) => left.span.compare(right.span) || left.index - right.index)
    .map(({ jump }) => {
      const middle = midpoint(jump.from, jump.to);
      const label =
        jump.text !== null && shown(jump.label.style) ? measured(jump.label, jump.text) : undefined;
      const xFrom = relativeX(jump.from);
      const xTo = relativeX(jump.to);
      let extent: Extent = [Math.min(xFrom, xTo), Math.max(xFrom, xTo)];
      if (label !== undefined) extent = widen(extent, labelExtent(relativeX(middle), label.width));
      return { jump, middle, label, extent, row: rows.place(extent) };
    });

  const size = maxSize([
    ...placedJumps.flatMap((item) => (item.label === undefined ? [] : [item.jump.label])),
    ...labelledLines.map((item) => item.item.label),
  ]);
  const tierRoom = tiers.count * h(size);
  // The first jump row's depth and the jump rows' pitch, each summed whole first.
  const depth = JUMP_DEPTH + S;
  const pj = JUMP_PITCH + S + h(size);
  const K = rows.count;
  return {
    facet: "flow_control",
    elements: lines.length + jumps.length,
    width: K === 0 ? tierRoom : tierRoom + depth + (K - 1) * pj + LABEL_GAP + h(size),
    extents: [
      ...lines.map((item): Extent => [relativeX(item.at), relativeX(item.at)]),
      ...labelledLines.map((item) => item.extent),
      ...placedJumps.map((item) => item.extent),
    ],
    centred: placedJumps.flatMap((item) => {
      // An arc leaving or arriving at a position in a gap is not drawn, nor is its label (section 6.6).
      const x = scope.drawnX(item.middle);
      const elided = [item.jump.from, item.jump.to].some(
        (value) => scope.drawnX(value) === undefined,
      );
      return item.label === undefined || x === undefined || elided
        ? []
        : [{ width: item.label.width, x }];
    }),
    draw: (start, side, at) => {
      const elided = (...values: Real[]) => values.some((value) => at.gap(value) !== undefined);
      const shownLines = lines.filter((item) => !elided(item.at));
      const shownLabels = labelledLines.filter(({ item }) => !elided(item.at));
      const shownJumps = placedJumps.filter(
        ({ jump, middle }) => !elided(jump.from, jump.to, middle),
      );
      const f0 = start + tierRoom;
      const yf = at.yAt(side, f0);
      const apex = (row: number) => f0 + depth + (row - 1) * pj;
      return {
        flowLines: shownLines.map((item) => ({
          type: item.role,
          address: item.address,
          style: item.style,
          x: at.x(item.at),
          y1: yf,
          y2: at.flowLineEnd(side),
        })),
        jumps: shownJumps.map(({ jump, row }) => {
          const ya = at.yAt(side, apex(row));
          const w = jump.style["stroke-width"];
          const xf = at.x(jump.from);
          const xt = at.xAfter(jump.to);
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
            address: jump.address,
            style: jump.style,
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
        jumpLabels: shownJumps.flatMap(({ jump, middle, label, row }) =>
          label === undefined
            ? []
            : [
                centredLabel(
                  jump.label,
                  at.x(middle),
                  at.beyond(side, at.yAt(side, apex(row) + LABEL_GAP), size),
                  label,
                ),
              ],
        ),
        // Tier 1 touches the flow row on the line's side; tier k lies (k − 1) h further in.
        flowLineLabels: shownLabels.map(({ item, text, tier }) => {
          const inwards = (tier - 1) * h(size);
          return {
            type: "label",
            address: item.label.address,
            style: item.label.style,
            x: at.x(item.at) + FLOW_LINE_LABEL_OFFSET,
            baseline: side === "below" ? yf - inwards - d(size) : yf + inwards + a(size),
            anchor: "start",
            text: text.clean,
          };
        }),
      };
    },
  };
}
