/**
 * The flow band: the break-label tiers and the flow row, where jumps leave
 * and arrive by levels and breaks end (`docs/drawing.md` in timeskeleton,
 * sections 6.4 and 6.6).
 */

import type { Real } from "@timetoalign/tilie-core";
import type { Band, Position } from "./canvas.ts";
import type { Side } from "./cascade.ts";
import { BREAK_LABEL_OFFSET, LABEL_GAP } from "./constants.ts";
import type { BreakElement, JumpElement, Point, TextElement } from "./elements.ts";
import { type Extent, labelExtent, Rows, widen } from "./fit.ts";
import { centredLabel } from "./names.ts";
import { add, coordinateValue, exactDistance, midpoint, times } from "./numbers.ts";
import { type Measured, maxSize, type Owned, type Scope, shown } from "./traversal.ts";

export interface Jump extends Owned {
  readonly from: Real;
  readonly to: Real;
  readonly text: string;
}

export interface Break extends Owned {
  readonly at: Real;
  readonly text: string | null;
}

export interface Flow {
  /** The drawn jumps in placement order: sorted stably by span, smallest first. */
  readonly jumps: readonly Jump[];
  /** The drawn labels of the drawn jumps, centred on the midpoints of their from and to. */
  readonly jumpLabels: ReadonlyMap<Jump, Measured & { readonly at: Real }>;
  readonly levels: Record<Side, Rows>;
  readonly level: ReadonlyMap<Jump, number>;
  /** The drawn breaks, in traversal order and each timeline's in canonical order. */
  readonly breaks: readonly Break[];
  readonly breakLabels: ReadonlyMap<Break, Measured>;
  readonly tiers: Record<Side, Rows>;
  readonly tier: ReadonlyMap<Break, number>;
}

/** Where a side's flow row lies, and its jump level pitch `pj`. */
export interface FlowBand {
  readonly flow: number;
  readonly pj: number;
}

/** The jumps and breaks of every timeline, the drawn ones placed into levels and tiers. */
export function flow(scope: Scope): Flow {
  const { entries, address, owned, measured, relativeX } = scope;
  const breaks: Break[] = [];
  const jumps: Jump[] = [];
  for (const entry of entries) {
    for (const item of entry.manifest.flow_control.breaks) {
      breaks.push({
        ...owned("break", address(item.id), entry),
        at: add(entry.start, coordinateValue(item.coordinate, entry.manifest.number_type)),
        text: item.label,
      });
    }
    for (const item of entry.manifest.flow_control.jumps) {
      jumps.push({
        ...owned("jump", address(item.id), entry),
        from: add(entry.start, coordinateValue(item.from_coordinate, entry.manifest.number_type)),
        to: add(entry.start, coordinateValue(item.to_coordinate, entry.manifest.number_type)),
        text: item.label ?? item.control_type,
      });
    }
  }
  const drawnJumps = jumps.filter((jump) => shown(jump.style));
  const jumpLabels = new Map(
    drawnJumps
      .filter((jump) => shown(jump.label.style))
      .map((jump) => [
        jump,
        { ...measured(jump.label, jump.text), at: midpoint(jump.from, jump.to) },
      ]),
  );
  const drawnBreaks = breaks.filter((item) => shown(item.style));
  const breakLabels = new Map(
    drawnBreaks
      .filter((item) => item.text !== null && shown(item.label.style))
      .map((item) => [item, measured(item.label, item.text as string)]),
  );

  const jumpLevels = { above: new Rows(), below: new Rows() };
  const jumpLevel = new Map<Jump, number>();
  const placedJumps = drawnJumps
    .map((jump, index) => ({ jump, index, span: exactDistance(jump.to, jump.from) }))
    .sort((left, right) => left.span.compare(right.span) || left.index - right.index)
    .map(({ jump }) => jump);
  for (const jump of placedJumps) {
    const xFrom = relativeX(jump.from);
    const xTo = relativeX(jump.to);
    let extent: Extent = [Math.min(xFrom, xTo), Math.max(xFrom, xTo)];
    const text = jumpLabels.get(jump);
    if (text !== undefined) extent = widen(extent, labelExtent(relativeX(text.at), text.width));
    jumpLevel.set(jump, jumpLevels[jump.side].place(extent));
  }
  const breakTiers = { above: new Rows(), below: new Rows() };
  const breakTier = new Map<Break, number>();
  // The labels of a side's breaks fill the break-label tiers of that side's flow band.
  for (const item of drawnBreaks) {
    const text = breakLabels.get(item);
    if (text === undefined) continue;
    const left = relativeX(item.at) + BREAK_LABEL_OFFSET;
    breakTier.set(item, breakTiers[item.side].place([left - 1, left + text.width + 1]));
  }
  return {
    jumps: placedJumps,
    jumpLabels,
    levels: jumpLevels,
    level: jumpLevel,
    breaks: drawnBreaks,
    breakLabels,
    tiers: breakTiers,
    tier: breakTier,
  };
}

/** The largest label font size of a side's flow band: its jump and break labels. */
export const flowLabelSize = (flow: Flow, side: Side) =>
  maxSize(
    [...flow.jumpLabels.keys(), ...flow.breakLabels.keys()]
      .filter((item) => item.side === side)
      .map((item) => item.label),
  );

/** The flow band of a side, present when it holds a jump level or a break. */
export function flowBand(scope: Scope, flow: Flow, side: Side): Band<FlowBand> | undefined {
  const { v, h } = scope;
  const levels = flow.levels[side].count;
  if (!(levels > 0 || flow.breaks.some((item) => item.side === side))) return undefined;
  const size = flowLabelSize(flow, side);
  const tiers = flow.tiers[side].count * h(size);
  const pj = 10 * v + h(size);
  return {
    width: levels === 0 ? tiers : tiers + 8 * v + (levels - 1) * pj + LABEL_GAP + h(size),
    minimum: 0,
    at: (start) => ({ flow: start + tiers, pj }),
  };
}

/** The distance of a jump's apex from the root's line. */
const apex = (scope: Scope, flow: Flow, band: (side: Side) => FlowBand, jump: Jump) => {
  const own = band(jump.side);
  return own.flow + 8 * scope.v + ((flow.level.get(jump) as number) - 1) * own.pj;
};

/**
 * The breaks: vertical lines from the flow row of their side to the padding
 * of the opposite side, `Pv` from the member drawing's top or its bottom `Hc`.
 */
export function breakElements(
  flow: Flow,
  band: (side: Side) => FlowBand,
  placed: Position,
  Pv: number,
  Hc: number,
): BreakElement[] {
  const { x, yAt, top } = placed;
  return flow.breaks.map((item) => ({
    type: "break",
    address: item.address,
    style: item.style,
    x: x(item.at),
    y1: yAt(item.side, band(item.side).flow),
    // Counted from the member drawing's top: P × v below the root, Hc − P × v above it.
    y2: item.side === "below" ? top + Pv : top + (Hc - Pv),
  }));
}

/** The jumps: arrows along a cubic curve from the flow row out to their level's apex and back. */
export function jumpElements(
  scope: Scope,
  flow: Flow,
  band: (side: Side) => FlowBand,
  placed: Position,
): JumpElement[] {
  const { x, yAt } = placed;
  return flow.jumps.map((jump) => {
    const yf = yAt(jump.side, band(jump.side).flow);
    const ya = yAt(jump.side, apex(scope, flow, band, jump));
    const w = jump.style["stroke-width"];
    const xf = x(jump.from);
    const xt = x(jump.to);
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
  });
}

/** The jump labels, each centred beyond its jump's apex. */
export function jumpLabelElements(
  scope: Scope,
  flow: Flow,
  band: (side: Side) => FlowBand,
  placed: Position,
): TextElement[] {
  const { x, yAt, beyond } = placed;
  const drawn: TextElement[] = [];
  for (const jump of flow.jumps) {
    const item = flow.jumpLabels.get(jump);
    if (item === undefined) continue;
    const size = flowLabelSize(flow, jump.side);
    drawn.push(
      centredLabel(
        jump.label,
        x(item.at),
        beyond(jump.side, yAt(jump.side, apex(scope, flow, band, jump) + LABEL_GAP), size),
        item,
      ),
    );
  }
  return drawn;
}

/** The break labels, starting 3 after their breaks, each in its tier of the flow band. */
export function breakLabelElements(
  scope: Scope,
  flow: Flow,
  band: (side: Side) => FlowBand,
  placed: Position,
): TextElement[] {
  const { h, a, d } = scope;
  const { x, yAt } = placed;
  const drawn: TextElement[] = [];
  for (const item of flow.breaks) {
    const text = flow.breakLabels.get(item);
    if (text === undefined) continue;
    const side = item.side;
    const size = flowLabelSize(flow, side);
    const inwards = ((flow.tier.get(item) as number) - 1) * h(size);
    const yf = yAt(side, band(side).flow);
    drawn.push({
      type: "label",
      address: item.label.address,
      style: item.label.style,
      x: x(item.at) + BREAK_LABEL_OFFSET,
      // Tier 1 touches the flow row on the root's side; tier k lies (k − 1) h further in.
      baseline: side === "below" ? yf - inwards - d(size) : yf + inwards + a(size),
      anchor: "start",
      text: text.clean,
    });
  }
  return drawn;
}
