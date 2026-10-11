/**
 * Selectors and the cascade of the `graphical` layers
 * (`docs/drawing.md` in timeskeleton, sections 2.1 to 2.5).
 */

import type {
  Declaration,
  ElementType,
  Graphical,
  Selector,
  TimeUnit,
} from "@timetoalign/timeskeleton";

export type Domain = "graphical" | "logical" | "physical";
export type Modality = "continuous" | "discrete";
export type Side = "above" | "below";

/** The cascaded value of every property on one element. */
export interface Style {
  readonly stroke: string;
  readonly "stroke-width": number;
  readonly "stroke-dasharray": string;
  readonly fill: string;
  readonly opacity: number;
  readonly "font-size": number;
  readonly rx: number;
  readonly display: "inline" | "none";
  readonly side: Side;
  readonly content: string;
  readonly "max-width": number | "none";
}

type Property = keyof Style;

export const INITIAL_STYLE: Style = {
  stroke: "none",
  "stroke-width": 1,
  "stroke-dasharray": "none",
  fill: "none",
  opacity: 1,
  "font-size": 9,
  rx: 0,
  display: "inline",
  side: "below",
  content: "none",
  "max-width": "none",
};

const INHERITED: ReadonlySet<Property> = new Set([
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "fill",
  "font-size",
]);

const PROPERTIES = Object.keys(INITIAL_STYLE) as Property[];

/** What a selector can test on an element. */
export interface ElementKey {
  readonly type: ElementType;
  /** `null` for the block. */
  readonly address: string | null;
  /** The timeline it belongs to; `null` for the block. */
  readonly timeline: string | null;
  readonly domain: Domain | null;
  readonly modality: Modality | null;
  readonly class: string | null;
}

const UNIT_DOMAINS: Readonly<Partial<Record<TimeUnit, readonly [Domain, Modality]>>> = {
  floating_measures: ["logical", "continuous"],
  whole_note: ["logical", "continuous"],
  quarters: ["logical", "continuous"],
  ticks: ["logical", "discrete"],
  milliseconds: ["physical", "continuous"],
  seconds: ["physical", "continuous"],
  minutes: ["physical", "continuous"],
  samples: ["physical", "discrete"],
  frames: ["physical", "discrete"],
  pixels: ["graphical", "discrete"],
  meters: ["graphical", "continuous"],
  centimeters: ["graphical", "continuous"],
  millimeters: ["graphical", "continuous"],
  inches: ["graphical", "continuous"],
  points: ["graphical", "continuous"],
};

/** The domain and modality of a map's `target_unit`, or `null` for none. */
export function unitDomain(unit: string | null | undefined): readonly [Domain, Modality] | null {
  if (unit === null || unit === undefined || !Object.hasOwn(UNIT_DOMAINS, unit)) return null;
  return UNIT_DOMAINS[unit as TimeUnit] ?? null;
}

/** The domain and modality of a timeline class. */
export function classDomain(name: string): readonly [Domain, Modality] {
  const domain: Domain = name.includes("Graphical")
    ? "graphical"
    : name.includes("Physical")
      ? "physical"
      : "logical";
  return [domain, name.startsWith("Discrete") ? "discrete" : "continuous"];
}

interface Ranked {
  readonly select: Selector;
  readonly set: Declaration;
  readonly rank: readonly number[];
}

function compareRanks(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < left.length; index += 1) {
    const difference = (left[index] as number) - (right[index] as number);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * The statements of every layer, lowest rank first. `ancestry` maps every
 * timeline id to the ids from the root down to it, so its length is the
 * timeline's depth (the root 1).
 */
export class Cascade {
  readonly #statements: readonly Ranked[];
  readonly #ancestry: ReadonlyMap<string, readonly string[]>;

  constructor(
    layers: readonly (Graphical | undefined)[],
    ancestry: ReadonlyMap<string, readonly string[]>,
  ) {
    this.#ancestry = ancestry;
    const ranked: Ranked[] = [];
    layers.forEach((layer, level) => {
      (layer?.statements ?? []).forEach((statement, position) => {
        const set =
          typeof statement.set === "string"
            ? layer?.styles !== undefined && Object.hasOwn(layer.styles, statement.set)
              ? layer.styles[statement.set]
              : undefined
            : statement.set;
        // A style name the layer's `styles` does not hold sets nothing.
        if (set === undefined) return;
        const select = statement.select;
        const within = select.within === undefined ? 0 : (ancestry.get(select.within)?.length ?? 0);
        ranked.push({
          select,
          set,
          rank: [
            level,
            select.ids === undefined ? 0 : 1,
            within,
            select.class === undefined ? 0 : 1,
            select.element === undefined ? 0 : 1,
            (select.domain === undefined ? 0 : 1) + (select.modality === undefined ? 0 : 1),
            position,
          ],
        });
      });
    });
    this.#statements = ranked.sort((a, b) => compareRanks(a.rank, b.rank));
  }

  /** Whether an element matches every member present in a selector. */
  matches(select: Selector, element: ElementKey): boolean {
    if (select.element !== undefined && select.element !== element.type) return false;
    if (select.ids !== undefined) {
      if (element.address === null || !select.ids.includes(element.address)) return false;
    }
    if (select.domain !== undefined && select.domain !== element.domain) return false;
    if (select.modality !== undefined && select.modality !== element.modality) return false;
    if (select.class !== undefined && select.class !== element.class) return false;
    if (select.within !== undefined) {
      if (element.timeline === null) return false;
      if (!(this.#ancestry.get(element.timeline) ?? []).includes(select.within)) return false;
    }
    return true;
  }

  /** The cascaded style of an element whose parent in the tree has `parent` (none for the block). */
  resolve(element: ElementKey, parent: Style | undefined): Style {
    const set: Partial<Record<Property, unknown>> = {};
    for (const statement of this.#statements) {
      if (!this.matches(statement.select, element)) continue;
      for (const property of PROPERTIES) {
        if (Object.hasOwn(statement.set, property)) set[property] = statement.set[property];
      }
    }
    const style: Record<string, unknown> = {};
    for (const property of PROPERTIES) {
      style[property] = Object.hasOwn(set, property)
        ? set[property]
        : INHERITED.has(property) && parent !== undefined
          ? parent[property]
          : INITIAL_STYLE[property];
    }
    return style as unknown as Style;
  }
}
