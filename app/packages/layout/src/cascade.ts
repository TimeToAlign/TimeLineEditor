/**
 * Selectors and the cascade of the `graphical` layers
 * (`docs/drawing.md` in timeskeleton, sections 2.1 to 2.5).
 *
 * The cascade runs on each drawing of an element at its own place in the
 * tree of sections 2.1 and 8.1, and the drawing code supplies that place:
 * for every drawing it calls `cascade.resolve(key, parent)` once, with
 *
 * - `key`, the drawing's `ElementKey`, built by core from the key of the
 *   element holding it: `BLOCK_KEY` for the block, `unownedKey(type,
 *   address, holder)` for a frame or a title, `elementKey(type, address,
 *   timeline, holder, map?)` for every element of a timeline (a card, a
 *   line, an ancestor line, a mark, a map, a region, a segment's node, …),
 *   `textKey(owner, "name" | "label")` for an element's own text. Its
 *   `inside` is the **holder chain**, the types of every element holding it,
 *   outermost first, and it is the only thing the selector member `inside`
 *   reads;
 * - `parent`, the style `resolve` gave the drawing of its holder (the
 *   element its key was built from), or `undefined` for the block.
 *
 * Drawings that share an address (a timeline drawn as an ancestor line and
 * as a line of its own, a member's start marked on its own line and on an
 * ancestor line) are keyed separately: they match the same `ids`, `within`
 * and `element`, but each inherits from its own `parent` and matches
 * `inside` by its own chain.
 */

import { type ElementKey, selectorMatches } from "@timetoalign/tilie-core";
import type { Declaration, Graphical, Selector } from "@timetoalign/timeskeleton";

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
  readonly shadow: string;
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
  shadow: "none",
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
 * The statements of every layer, lowest rank first (section 2.5: layer,
 * `ids`, `within` depth, `class`, `element`, `inside`, the count of `domain`
 * and `modality`, position). `ancestry` maps every timeline id to the ids
 * from its root down to it, so its length is the timeline's depth (the
 * roots 1).
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
            select.inside === undefined ? 0 : 1,
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
    return selectorMatches(select, element, this.#ancestry);
  }

  /**
   * The cascaded style of one drawing of an element: `element` its key, with
   * its holder chain; `parent` the cascaded style of its holder's drawing,
   * `undefined` for the block (section 2.5).
   */
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
