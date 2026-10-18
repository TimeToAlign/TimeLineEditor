/**
 * A member drawing: one timeline drawn as a root, its sides filled with
 * bands, and its elements in descriptor order (`docs/drawing.md` in
 * timeskeleton, sections 6, 7.2 and 8.5).
 */

import type { MemberDrawing } from "@timetoalign/tilie-core";
import {
  ancestorBand,
  ancestorLabelElements,
  ancestorLineElements,
  ancestorLines,
  ancestorMarkElements,
  ancestorNames,
  chevrons,
} from "./ancestors.ts";
import { position } from "./canvas.ts";
import type { Side } from "./cascade.ts";
import { childElements, childRows, childrenBand } from "./children.ts";
import type { DrawnElement } from "./elements.ts";
import {
  breakElements,
  breakLabelElements,
  flow,
  flowBand,
  jumpElements,
  jumpLabelElements,
} from "./flow.ts";
import { heights } from "./heights.ts";
import { mapElements, mapStacks } from "./maps.ts";
import { nameElements, rowNames } from "./names.ts";
import { regionBand, regionElements, regionLabelElements, regions } from "./regions.ts";
import { rootBand, rootLineElements, wedgeElements, wedgeLabelElements, wedges } from "./root.ts";
import { boundaryElements, lineReach, segmentLabelElements, segmentLines } from "./segments.ts";
import { fillSide } from "./sides.ts";
import { type Context, type Entry, type Holder, rowPitch, traverse } from "./traversal.ts";

/**
 * One member drawing laid out before its horizontal start and its top are
 * known: what the shared start `x0` needs, its height, and its elements once
 * `x0`, the name column `n` and its top are given.
 */
export interface MemberLayout {
  /** The widths of its drawn names, its ancestors' included. */
  readonly names: readonly number[];
  /** Its centred labels: their widths and the proportions they are centred on. */
  readonly centred: readonly { readonly width: number; readonly u: number }[];
  /** The stroke widths of its drawn ancestor lines that run on to the left. */
  readonly chevrons: readonly number[];
  /** Its height `Hm`: the content height `Hc` (section 6.5), the ancestor band included. */
  readonly height: number;
  /** Its elements in descriptor order (sections 7.2 and 8.5, without its card). */
  elements(x0: number, n: number, top: number): DrawnElement[];
}

/**
 * Lay out one timeline drawn as a root (sections 3 to 6, and 8.3 for its
 * ancestors), its line held by `holder`, the block or its group's frame.
 */
export function layoutMember(
  context: Context,
  member: MemberDrawing,
  holder: Holder,
): MemberLayout {
  const scope = traverse(context, member, holder);
  const { placement, rootEntry, v, u } = scope;

  const maps = mapStacks(scope);
  const segments = segmentLines(scope);
  const marks = wedges(scope, segments.labels);
  const reach = lineReach(scope, maps, segments, marks.labelSize("above"));
  const children = childRows(scope);
  const ancestors = ancestorLines(scope);
  const drawnRegions = regions(scope);
  const drawnFlow = flow(scope);

  const centred = [
    ...marks.labels.map((item) => ({ width: item.width, u: item.u })),
    ...ancestors.flatMap((ancestor) =>
      ancestor.labelled.map((mark) => ({ width: mark.width, u: mark.u })),
    ),
    ...segments.labels.map((item) => ({ width: item.width, u: u(item.at) })),
    ...[...drawnRegions.labels.values()].map((item) => ({ width: item.width, u: u(item.at) })),
    ...[...drawnFlow.jumpLabels.values()].map((item) => ({ width: item.width, u: u(item.at) })),
  ];

  const p0 = rowPitch(scope, rootEntry.name.style["font-size"]);
  const fill = (side: Side) =>
    fillSide(v, placement.order, {
      root: rootBand(scope, marks, reach, side),
      children: childrenBand(scope, children, reach, side, p0),
      regions: regionBand(scope, drawnRegions, side),
      flow: flowBand(scope, drawnFlow, side),
      ancestors: side === "above" ? ancestorBand(scope, ancestors, p0) : undefined,
    });
  const above = fill("above");
  const below = fill("below");
  const band = (side: Side) => (side === "above" ? above : below);
  const { Pv, yLocal, Hc } = heights(scope, above.edge, below.edge);

  // Names: the ancestors' from A1 to Ak first, then the rows from the top down.
  const drawnNames = rowNames(scope, ancestorNames(ancestors, above.ancestors), children.lines, {
    above: above.rows,
    below: below.rows,
  });

  const elements = (x0: number, n: number, top: number): DrawnElement[] => {
    const distance = (line: Entry) =>
      band(line.style.side).rows[(children.row.get(line) as number) - 1] as number;
    const placed = position(scope, yLocal, distance, x0, n, top);
    return [
      ...breakElements(drawnFlow, band, placed, Pv, Hc),
      ...mapElements(maps, placed),
      ...regionElements(drawnRegions, band, placed),
      ...jumpElements(scope, drawnFlow, band, placed),
      ...ancestorLineElements(scope, ancestors, above.ancestors, placed),
      ...rootLineElements(scope, placed),
      ...childElements(children, placed),
      ...boundaryElements(segments, placed),
      ...ancestorMarkElements(scope, ancestors, above.ancestors, placed),
      ...wedgeElements(scope, marks, placed),
      ...nameElements(scope, drawnNames, placed),
      ...ancestorLabelElements(scope, ancestors, above.ancestors, placed),
      ...wedgeLabelElements(scope, marks, placed),
      ...segmentLabelElements(scope, segments, reach, placed),
      ...regionLabelElements(drawnRegions, band, placed),
      ...jumpLabelElements(scope, drawnFlow, band, placed),
      ...breakLabelElements(scope, drawnFlow, band, placed),
    ];
  };

  return {
    names: drawnNames.map((item) => item.width),
    centred,
    chevrons: chevrons(ancestors),
    height: Hc,
    elements,
  };
}
