/**
 * `layout(manifest)`: the geometry block of one TimeSkeleton manifest, as the
 * geometry specification (`docs/geometry.md` in timeskeleton) defines it.
 *
 * Pure and deterministic: the manifest is read in canonical order, every
 * horizontal position is an exact value on the root's axis (or a float where
 * the manifest's numbers are floats), every vertical position a row or an
 * exact fraction of one. No text is measured and no page is known.
 */

import {
  compareReal,
  fromFloat,
  type JsonObject,
  type Manifest,
  Rational,
  type Real,
  type TimelineManifest,
  toFloat,
} from "@timetoalign/tilie-core";
import type {
  Block,
  ElementType,
  Graphical,
  Lossless,
  StyleRules,
  TimeUnit,
} from "@timetoalign/timeskeleton";
import { canonicalOrder } from "@timetoalign/timeskeleton";
import {
  type Domain,
  type DrawnElement,
  type Modality,
  resolveStyle,
  type ScopedRule,
  type Style,
  scopedRules,
} from "./cascade.ts";
import {
  add,
  coordinateText,
  coordinateValue,
  type GeometryNumber,
  jsonFloat,
  midpoint,
  pair,
  position,
  zero,
} from "./numbers.ts";

/** One geometry block as the standard reader and writer hold it. */
export type LosslessBlock = Lossless<Block>;

export interface LayoutOptions {
  readonly defaults?: StyleRules;
  readonly nameColumn?: {
    readonly visible?: boolean;
    readonly width?: readonly [number | bigint, number | bigint];
  };
}

type Primitive = JsonObject;
type Sign = 1 | -1;

const BACKGROUND = "#BAC8D3";

interface Extent {
  readonly start: Real;
  readonly end: Real;
}

/** One timeline of a block's traversal. */
interface Entry {
  readonly manifest: TimelineManifest;
  readonly parent: Entry | undefined;
  readonly start: Real;
  readonly end: Real;
  readonly domain: Domain;
  readonly modality: Modality;
  /** The rules of the containers holding this timeline's elements. */
  readonly rules: readonly ScopedRule[];
}

function domainOf(manifest: TimelineManifest): Domain {
  const name = manifest.class;
  return name.includes("Graphical")
    ? "graphical"
    : name.includes("Physical")
      ? "physical"
      : "logical";
}

function modalityOf(manifest: TimelineManifest): Modality {
  return manifest.class.startsWith("Continuous") ? "continuous" : "discrete";
}

/**
 * The timelines of a block in pre-order, children in canonical order, with
 * their extents and the rules of the containers holding them.
 */
function traverse(
  root: TimelineManifest,
  graphical: Graphical | undefined,
  overrides: StyleRules,
  defaults: StyleRules,
): Entry[] {
  const entries: Entry[] = [];
  const visit = (
    manifest: TimelineManifest,
    parent: Entry | undefined,
    start: Real,
    ancestry: readonly string[],
  ) => {
    const end =
      parent === undefined
        ? coordinateValue(manifest.length)
        : add(start, coordinateValue(manifest.length));
    const entry: Entry = {
      manifest,
      parent,
      start,
      end,
      domain: domainOf(manifest),
      modality: modalityOf(manifest),
      rules: [
        ...defaults.map((rule) => ({ ...rule, level: 1, depth: 0 })),
        ...scopedRules(graphical, ancestry, 2),
        ...overrides.map((rule) => ({ ...rule, level: 3, depth: 0 })),
      ],
    };
    entries.push(entry);
    for (const child of Object.values(manifest.children)) {
      visit(child.timeline, entry, add(start, coordinateValue(child.offset)), [
        ...ancestry,
        child.timeline.id,
      ]);
    }
  };
  visit(root, undefined, zero(root.number_type), [root.id]);
  return entries;
}

/** The exact value of a position: a float by its exact binary value. */
function exact(value: Real): Rational {
  return typeof value === "number" ? fromFloat(value) : value;
}

function less(left: Real, right: Real): boolean {
  return compareReal(left, right) < 0;
}

function conflicts(left: Extent, right: Extent): boolean {
  return (
    (less(left.start, right.end) && less(right.start, left.end)) ||
    compareReal(left.start, right.start) === 0
  );
}

function ordered(left: Real, right: Real): Extent {
  return less(right, left) ? { start: right, end: left } : { start: left, end: right };
}

/** The rows of one band on one side: extents by distance from the root. */
class Band {
  readonly first: number;
  private readonly rows = new Map<number, Extent[]>();
  private last = 0;

  constructor(first: number) {
    this.first = first;
  }

  /** Place an extent at the first distance, from `minimum` on, where it conflicts with nothing. */
  place(extent: Extent, minimum: number): number {
    let distance = Math.max(this.first, minimum);
    while ((this.rows.get(distance) ?? []).some((other) => conflicts(other, extent))) distance += 1;
    const row = this.rows.get(distance);
    if (row === undefined) this.rows.set(distance, [extent]);
    else row.push(extent);
    this.last = Math.max(this.last, distance);
    return distance;
  }

  /** The first distance of the band after this one. */
  next(): number {
    return Math.max(this.first, this.last + 1);
  }
}

/** The sides, in the order bands are filled. */
const SIDES = { above: 1, below: -1 } as const satisfies Record<string, Sign>;

/** Exact heights in rows. */
function height(numerator: bigint, denominator = 1n): Rational {
  return Rational.fromParts(numerator, denominator);
}

function rowsPlus(row: number, numerator: bigint, denominator: bigint): Rational {
  return height(BigInt(row)).add(height(numerator, denominator));
}

/** Everything one element carries into the geometry. */
interface Drawn {
  readonly element: DrawnElement;
  /** The element's timeline, which holds it in its containers. */
  readonly timeline: string;
  readonly rules: readonly ScopedRule[];
  readonly style: Style;
}

/** The frame of a block in abstract units, its placement map, and the frame's zero (section 3.3). */
function frame(
  root: TimelineManifest,
  options: LayoutOptions["nameColumn"],
): {
  readonly frame: JsonObject;
  readonly placement: JsonObject;
  readonly zero: GeometryNumber;
} {
  const float = root.number_type === "float";
  const length = coordinateValue(root.length);
  const visible = options?.visible ?? true;
  const widthFraction = Rational.of(options?.width ?? [1, 4]);
  let names: GeometryNumber;
  let plot: GeometryNumber;
  let total: GeometryNumber;
  if (typeof length === "number") {
    const width = !visible ? 0 : length === 0 ? 1 : length * toFloat(widthFraction);
    names = jsonFloat(width);
    plot = jsonFloat(length);
    total = jsonFloat(width + length);
  } else {
    const width = !visible
      ? Rational.of(0n)
      : length.numerator === 0n
        ? Rational.of(1n)
        : length.multiply(widthFraction);
    names = pair(width);
    plot = pair(length);
    total = pair(width.add(length));
  }
  const frameZero: GeometryNumber = float ? jsonFloat(0) : [0, 1];
  return {
    frame: {
      length: total,
      names: { offset: frameZero, length: names },
      plot: { offset: names, length: plot },
    },
    placement: {
      type: "LinearMap",
      id: "placement",
      name: null,
      source_unit: root.unit,
      target_unit: "number",
      scalar: float ? jsonFloat(1) : [1, 1],
      offset: float ? jsonFloat(0) : [0, 1],
    },
    zero: frameZero,
  };
}

/** Lay out one top-level timeline as a block. */
function block(
  root: TimelineManifest,
  graphical: Graphical | undefined,
  overrides: StyleRules,
  options: LayoutOptions,
): JsonObject {
  const rootType = root.number_type;
  const x = (value: Real) => position(value, rootType);
  const entries = traverse(root, graphical, overrides, options.defaults ?? []);

  const elementOf = (type: ElementType, id: string, entry: Entry): Drawn => {
    const element: DrawnElement = {
      element: type,
      id,
      domain: entry.domain,
      modality: entry.modality,
    };
    return {
      element,
      timeline: entry.manifest.id,
      rules: entry.rules,
      style: resolveStyle(entry.rules, element),
    };
  };
  const labelOf = (id: string, owner: Drawn): Drawn => {
    const element: DrawnElement = { ...owner.element, element: "label", id };
    return { ...owner, element, style: resolveStyle(owner.rules, element) };
  };

  // -- rows ---------------------------------------------------------------------
  interface Line {
    readonly entry: Entry;
    readonly drawn: Drawn;
    readonly row: number;
  }
  const lines: Line[] = [];
  const rootDrawn = elementOf("timeline", root.id, entries[0] as Entry);
  if (rootDrawn.style.visible) lines.push({ entry: entries[0] as Entry, drawn: rootDrawn, row: 0 });

  const childBands = { above: new Band(1), below: new Band(1) };
  const anchors = new Map<Entry, { above: number; below: number }>();
  anchors.set(entries[0] as Entry, { above: 0, below: 0 });
  const childStyles = new Map<Entry, Drawn>();
  for (const entry of entries.slice(1)) {
    const drawn = elementOf("child", entry.manifest.id, entry);
    childStyles.set(entry, drawn);
    const parent = anchors.get(entry.parent as Entry) ?? { above: 0, below: 0 };
    if (!drawn.style.visible) {
      anchors.set(entry, parent);
      continue;
    }
    const side = drawn.style.side;
    const distance = childBands[side].place(entry, parent[side] + 1);
    anchors.set(entry, { ...parent, [side]: distance });
    lines.push({ entry, drawn, row: SIDES[side] * distance });
  }

  interface Placed {
    readonly entry: Entry;
    readonly drawn: Drawn;
    readonly row: number;
  }
  const mapBands = {
    above: new Band(childBands.above.next()),
    below: new Band(childBands.below.next()),
  };
  const maps: (Placed & { readonly map: JsonObject })[] = [];
  for (const entry of entries) {
    for (const map of entry.manifest.conversion_maps) {
      const drawn = elementOf("map", `${entry.manifest.id}/map/${map.id}`, entry);
      if (!drawn.style.visible) continue;
      const side = drawn.style.side;
      const distance = mapBands[side].place(entry, 0);
      maps.push({ entry, drawn, row: SIDES[side] * distance, map });
    }
  }

  const regionBands = {
    above: new Band(mapBands.above.next()),
    below: new Band(mapBands.below.next()),
  };
  const regions: (Placed & { readonly start: Real; readonly end: Real; readonly name: string })[] =
    [];
  for (const entry of entries) {
    entry.manifest.regions.forEach((region, index) => {
      const drawn = elementOf("region", `${entry.manifest.id}/region/${index}`, entry);
      if (!drawn.style.visible) return;
      const start = add(entry.start, coordinateValue(region.start));
      const end = add(entry.start, coordinateValue(region.end));
      const side = drawn.style.side;
      const distance = regionBands[side].place(ordered(start, end), 0);
      regions.push({ entry, drawn, row: SIDES[side] * distance, start, end, name: region.name });
    });
  }

  const jumpBands = {
    above: new Band(regionBands.above.next()),
    below: new Band(regionBands.below.next()),
  };
  const listed = entries.flatMap((entry) =>
    entry.manifest.flow_control.jumps.map((jump, index) => {
      const from = add(entry.start, coordinateValue(jump.from_coordinate));
      const to = add(entry.start, coordinateValue(jump.to_coordinate));
      const extent = ordered(from, to);
      // The span is the exact difference, a float counting by its exact value.
      const span = exact(extent.end).subtract(exact(extent.start));
      return { entry, jump, index, from, to, extent, span };
    }),
  );
  listed.sort((left, right) => left.span.compare(right.span));
  const jumps: (Placed & (typeof listed)[number])[] = [];
  for (const item of listed) {
    const drawn = elementOf("jump", `${item.entry.manifest.id}/jump/${item.index}`, item.entry);
    if (!drawn.style.visible) continue;
    const side = drawn.style.side;
    const distance = jumpBands[side].place(item.extent, 0);
    jumps.push({ ...item, drawn, row: SIDES[side] * distance });
  }

  const taken = [0, ...lines.map((line) => line.row), ...maps.map((item) => item.row)].concat(
    regions.map((item) => item.row),
    jumps.map((item) => item.row),
  );
  const minimum = Math.min(...taken);
  const maximum = Math.max(...taken);

  // -- primitives -----------------------------------------------------------------
  const primitives: Primitive[] = [];
  const styled = (drawn: Drawn, withPattern: boolean): JsonObject => ({
    colour: drawn.style.colour,
    ...(withPattern ? { line_pattern: drawn.style.line_pattern } : {}),
  });

  const bottom = rowsPlus(minimum, -1n, 2n);
  const top = rowsPlus(maximum, 1n, 2n);
  const breaks: {
    readonly drawn: Drawn;
    readonly at: GeometryNumber;
    readonly label: string | null;
  }[] = [];
  for (const entry of entries) {
    entry.manifest.flow_control.breaks.forEach((entryBreak, index) => {
      const drawn = elementOf("break", `${entry.manifest.id}/break/${index}`, entry);
      if (!drawn.style.visible) return;
      const at = x(add(entry.start, coordinateValue(entryBreak.coordinate)));
      breaks.push({ drawn, at, label: entryBreak.label });
      primitives.push({
        kind: "break",
        id: drawn.element.id,
        timeline: entry.manifest.id,
        at,
        bottom: pair(bottom),
        top: pair(top),
        ...styled(drawn, true),
      });
    });
  }
  for (const item of maps) {
    primitives.push({
      kind: "map",
      id: item.drawn.element.id,
      timeline: item.entry.manifest.id,
      row: item.row,
      start: x(item.entry.start),
      end: x(item.entry.end),
      ...styled(item.drawn, true),
    });
  }
  const sign = (side: "above" | "below"): bigint => (side === "above" ? 1n : -1n);
  for (const item of regions) {
    const o = sign(item.drawn.style.side);
    primitives.push({
      kind: "region",
      id: item.drawn.element.id,
      timeline: item.entry.manifest.id,
      row: item.row,
      side: item.drawn.style.side,
      start: x(item.start),
      end: x(item.end),
      base: pair(rowsPlus(item.row, -o, 4n)),
      apex: pair(rowsPlus(item.row, -o, 8n)),
      ...styled(item.drawn, true),
    });
  }
  for (const item of jumps) {
    const side = item.drawn.style.side;
    const o = sign(side);
    primitives.push({
      kind: "jump",
      id: item.drawn.element.id,
      timeline: item.entry.manifest.id,
      row: item.row,
      side,
      from: x(item.from),
      to: x(item.to),
      base: pair(height(o * (2n * BigInt(jumpBands[side].first) - 1n), 2n)),
      apex: pair(rowsPlus(item.row, -o, 8n)),
      ...styled(item.drawn, true),
    });
  }
  for (const line of lines) {
    primitives.push({
      kind: line.drawn.element.element,
      id: line.drawn.element.id,
      timeline: line.entry.manifest.id,
      row: line.row,
      start: x(line.entry.start),
      end: x(line.entry.end),
      ...styled(line.drawn, true),
    });
  }

  interface Wedge {
    readonly drawn: Drawn;
    readonly row: number;
    readonly at: GeometryNumber;
    readonly base: Rational;
    readonly text: string;
  }
  const wedges: Wedge[] = [];
  const wedge = (id: string, entry: Entry, row: number, at: GeometryNumber, text: string) => {
    const drawn = elementOf("wedge", id, entry);
    if (!drawn.style.visible) return;
    const o = sign(drawn.style.side);
    wedges.push({ drawn, row, at, base: rowsPlus(row, o, 8n), text });
  };
  const ownText = (manifest: TimelineManifest, value: GeometryNumber | readonly unknown[]) =>
    coordinateText(value, manifest.unit as TimeUnit);
  for (const line of lines) {
    const { manifest } = line.entry;
    const id = manifest.id;
    const start: GeometryNumber =
      manifest.number_type === "float" ? jsonFloat(0) : manifest.number_type === "int" ? 0 : [0, 1];
    wedge(`${id}/start`, line.entry, line.row, x(line.entry.start), ownText(manifest, start));
    wedge(
      `${id}/end`,
      line.entry,
      line.row,
      x(line.entry.end),
      ownText(manifest, manifest.length.value as GeometryNumber),
    );
  }
  for (const entry of entries.slice(1)) {
    if (!(childStyles.get(entry) as Drawn).style.show_projected_coordinates) continue;
    const id = entry.manifest.id;
    for (const [end, value] of [
      ["start", entry.start],
      ["end", entry.end],
    ] as const) {
      const at = x(value);
      wedge(`${id}/projection/${end}`, entry, 0, at, coordinateText(at, root.unit as TimeUnit));
    }
  }
  for (const item of wedges) {
    primitives.push({
      kind: "wedge",
      id: item.drawn.element.id,
      timeline: item.drawn.timeline,
      row: item.row,
      side: item.drawn.style.side,
      at: item.at,
      tip: pair(height(BigInt(item.row))),
      base: pair(item.base),
      colour: item.drawn.style.colour,
    });
  }

  // -- labels -------------------------------------------------------------------
  const { frame: frameManifest, placement, zero: frameZero } = frame(root, options.nameColumn);
  const label = (
    drawn: Drawn,
    space: "root" | "frame",
    at: GeometryNumber,
    y: Rational,
    anchor: string,
    text: string,
  ): Primitive => ({
    kind: "label",
    id: drawn.element.id,
    timeline: drawn.timeline,
    at: { space, x: at, y: pair(y) },
    anchor,
    text,
    colour: drawn.style.colour,
  });

  const named: { readonly row: number; readonly owner: Drawn; readonly name: string }[] = [
    ...lines.map((line) => ({
      row: line.row,
      owner: line.drawn,
      name: line.entry.manifest.name ?? line.entry.manifest.id,
    })),
    ...maps.map((item) => ({
      row: item.row,
      owner: item.drawn,
      name: (item.map.name as string | null) ?? (item.map.id as string),
    })),
  ];
  for (let row = maximum; (options.nameColumn?.visible ?? true) && row >= minimum; row -= 1) {
    const contributors = named
      .filter((item) => item.row === row)
      .map((item) => ({ ...item, label: labelOf(`${item.owner.element.id}/name`, item.owner) }))
      .filter((item) => item.label.style.visible);
    const first = contributors[0];
    if (first === undefined) continue;
    primitives.push(
      label(
        first.label,
        "frame",
        frameZero,
        height(BigInt(row)),
        "west",
        contributors.map((item) => item.name).join(", "),
      ),
    );
  }
  for (const line of lines) {
    if (!line.drawn.style.show_length) continue;
    const drawn = labelOf(`${line.entry.manifest.id}/length`, line.drawn);
    if (!drawn.style.visible) continue;
    const { manifest } = line.entry;
    primitives.push(
      label(
        drawn,
        "root",
        x(midpoint(line.entry.start, line.entry.end)),
        height(BigInt(line.row)),
        drawn.style.side === "above" ? "south" : "north",
        ownText(manifest, manifest.length.value as GeometryNumber),
      ),
    );
  }
  for (const item of wedges) {
    const drawn = labelOf(`${item.drawn.element.id}/label`, item.drawn);
    if (!drawn.style.visible) continue;
    const anchor = item.drawn.style.side === "above" ? "south" : "north";
    primitives.push(label(drawn, "root", item.at, item.base, anchor, item.text));
  }
  for (const item of regions) {
    const drawn = labelOf(`${item.drawn.element.id}/label`, item.drawn);
    if (!drawn.style.visible) continue;
    const o = sign(item.drawn.style.side);
    const anchor = o === 1n ? "south" : "north";
    primitives.push(
      label(
        drawn,
        "root",
        x(midpoint(item.start, item.end)),
        rowsPlus(item.row, -o, 8n),
        anchor,
        item.name,
      ),
    );
  }
  for (const item of jumps) {
    const drawn = labelOf(`${item.drawn.element.id}/label`, item.drawn);
    if (!drawn.style.visible) continue;
    const o = sign(item.drawn.style.side);
    const anchor = o === 1n ? "south" : "north";
    primitives.push(
      label(
        drawn,
        "root",
        x(midpoint(item.from, item.to)),
        rowsPlus(item.row, -o, 8n),
        anchor,
        item.jump.label ?? item.jump.control_type,
      ),
    );
  }
  for (const item of breaks) {
    if (item.label === null) continue;
    const drawn = labelOf(`${item.drawn.element.id}/label`, item.drawn);
    if (!drawn.style.visible) continue;
    const above = item.drawn.style.side === "above";
    primitives.push(
      label(drawn, "root", item.at, above ? top : bottom, above ? "south" : "north", item.label),
    );
  }

  return {
    id: root.id,
    frame: frameManifest,
    placement,
    rows: { min: minimum, max: maximum },
    background: BACKGROUND,
    primitives,
  };
}

/** The one geometry block of a manifest. */
export function layout(
  manifest: Manifest,
  overrides: StyleRules = [],
  options: LayoutOptions = {},
): LosslessBlock {
  const ordered = canonicalOrder(manifest as never) as unknown as Manifest;
  return block(
    ordered.timeline,
    ordered.graphical as Graphical | undefined,
    overrides,
    options,
  ) as unknown as LosslessBlock;
}
