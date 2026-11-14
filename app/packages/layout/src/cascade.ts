/**
 * Selectors and the cascade of the `graphical` layers
 * (`docs/drawing.md` in TimeToShare, sections 2.1 to 2.5).
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
 *   `bandKey(timeline, facet, holder)` for one of a timeline's five bands,
 *   `textKey(owner, "name" | "label")` for an element's own text. Its
 *   `inside` is the **holder chain**, the types of every element holding it,
 *   outermost first, and it is the only thing the selector member `inside`
 *   reads;
 * - `parent`, the style `resolve` gave the drawing of its holder (the
 *   element its key was built from), or `undefined` for the block.
 *
 * Drawings that share an address (a timeline drawn as an ancestor line and
 * as a line of its own, a member's start marked on its own line and on an
 * ancestor line) are keyed separately: they match the same `addresses`, `within`
 * and `element`, but each inherits from its own `parent` and matches
 * `inside` by its own chain.
 */

import { addressKey } from "@timetoalign/tilie-core";
import { type ElementKey, selectorMatches } from "@timetoalign/tilie-core/drawing";
import type { Declaration, Graphical, Selector } from "@timetoalign/timetoshare";

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
  readonly content: string;
  readonly "max-width": number | "none";
}

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
  content: "none",
  "max-width": "none",
};

type StyleValues = { -readonly [Property in keyof Style]?: Style[Property] };

/**
 * One style property: whether an element without a value of its own takes
 * its holder's (section 2.5), else the initial value; and how a declaration
 * sets it. A parent's `Style` is a declaration of every property, so the
 * same setter copies an inherited value.
 */
interface StyleProperty {
  readonly inherits: boolean;
  readonly set: (values: StyleValues, declaration: Declaration) => void;
}

/** Every style property, the one table of what the cascade sets and what it inherits. */
const STYLE_PROPERTIES = {
  stroke: {
    inherits: true,
    set: (values, declaration) => {
      if (declaration.stroke !== undefined) values.stroke = declaration.stroke;
    },
  },
  "stroke-width": {
    inherits: true,
    set: (values, declaration) => {
      if (declaration["stroke-width"] !== undefined)
        values["stroke-width"] = declaration["stroke-width"];
    },
  },
  "stroke-dasharray": {
    inherits: true,
    set: (values, declaration) => {
      if (declaration["stroke-dasharray"] !== undefined)
        values["stroke-dasharray"] = declaration["stroke-dasharray"];
    },
  },
  fill: {
    inherits: true,
    set: (values, declaration) => {
      if (declaration.fill !== undefined) values.fill = declaration.fill;
    },
  },
  opacity: {
    inherits: false,
    set: (values, declaration) => {
      if (declaration.opacity !== undefined) values.opacity = declaration.opacity;
    },
  },
  "font-size": {
    inherits: true,
    set: (values, declaration) => {
      if (declaration["font-size"] !== undefined) values["font-size"] = declaration["font-size"];
    },
  },
  rx: {
    inherits: false,
    set: (values, declaration) => {
      if (declaration.rx !== undefined) values.rx = declaration.rx;
    },
  },
  shadow: {
    inherits: false,
    set: (values, declaration) => {
      if (declaration.shadow !== undefined) values.shadow = declaration.shadow;
    },
  },
  display: {
    inherits: false,
    set: (values, declaration) => {
      if (declaration.display !== undefined) values.display = declaration.display;
    },
  },
  content: {
    inherits: false,
    set: (values, declaration) => {
      if (declaration.content !== undefined) values.content = declaration.content;
    },
  },
  "max-width": {
    inherits: false,
    set: (values, declaration) => {
      if (declaration["max-width"] !== undefined) values["max-width"] = declaration["max-width"];
    },
  },
} satisfies Record<keyof Style, StyleProperty>;

const PROPERTIES: readonly StyleProperty[] = Object.values(STYLE_PROPERTIES);
const INHERITED = PROPERTIES.filter((property) => property.inherits);

interface Ranked {
  readonly select: Selector;
  readonly set: Declaration;
  readonly rank: readonly number[];
  readonly order: number;
}

function compareRanks(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < left.length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * The statements of every layer, lowest rank first (section 2.5: layer,
 * `addresses`, `within` depth, `class` or `facet`, `element`, `inside`, the count of `domain`
 * and `modality`, position). `ancestry` maps every timeline id to the ids
 * from its root down to it, so its length is the timeline's depth (the
 * roots 1).
 */
export class Cascade {
  readonly #general: readonly Ranked[];
  readonly #byElement: ReadonlyMap<string, readonly Ranked[]>;
  readonly #byClass: ReadonlyMap<string, readonly Ranked[]>;
  readonly #byFacet: ReadonlyMap<string, readonly Ranked[]>;
  readonly #byAddress: ReadonlyMap<string, readonly Ranked[]>;
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
            select.addresses === undefined ? 0 : 1,
            within,
            select.class === undefined && select.facet === undefined ? 0 : 1,
            select.element === undefined ? 0 : 1,
            select.inside === undefined ? 0 : 1,
            (select.domain === undefined ? 0 : 1) + (select.modality === undefined ? 0 : 1),
            position,
          ],
          order: 0,
        });
      });
    });
    ranked.sort((a, b) => compareRanks(a.rank, b.rank));
    const general: Ranked[] = [];
    const byElement = new Map<string, Ranked[]>();
    const byClass = new Map<string, Ranked[]>();
    const byFacet = new Map<string, Ranked[]>();
    const byAddress = new Map<string, Ranked[]>();
    const add = (buckets: Map<string, Ranked[]>, key: string, statement: Ranked) => {
      const bucket = buckets.get(key) ?? [];
      bucket.push(statement);
      buckets.set(key, bucket);
    };
    ranked.forEach((statement, order) => {
      const rankedStatement: Ranked = { ...statement, order };
      const { select } = statement;
      if (select.element !== undefined) add(byElement, select.element, rankedStatement);
      if (select.class !== undefined) add(byClass, select.class, rankedStatement);
      if (select.facet !== undefined) add(byFacet, select.facet, rankedStatement);
      for (const address of select.addresses ?? []) {
        add(byAddress, addressKey(address), rankedStatement);
      }
      if (
        select.element === undefined &&
        select.class === undefined &&
        select.facet === undefined &&
        select.addresses === undefined
      ) {
        general.push(rankedStatement);
      }
    });
    this.#general = general;
    this.#byElement = byElement;
    this.#byClass = byClass;
    this.#byFacet = byFacet;
    this.#byAddress = byAddress;
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
    const candidates = new Set(this.#general);
    if (element.type !== null) {
      for (const statement of this.#byElement.get(element.type) ?? []) candidates.add(statement);
    }
    if (element.class !== null) {
      for (const statement of this.#byClass.get(element.class) ?? []) candidates.add(statement);
    }
    if (element.facet !== null) {
      for (const statement of this.#byFacet.get(element.facet) ?? []) candidates.add(statement);
    }
    // Most layers select no address: the key is written only where one might match.
    if (this.#byAddress.size > 0) {
      for (const statement of this.#byAddress.get(addressKey(element.address)) ?? []) {
        candidates.add(statement);
      }
    }
    const values: StyleValues = {};
    if (parent !== undefined) for (const property of INHERITED) property.set(values, parent);
    for (const statement of [...candidates].sort((left, right) => left.order - right.order)) {
      if (!this.matches(statement.select, element)) continue;
      for (const property of PROPERTIES) property.set(values, statement.set);
    }
    return { ...INITIAL_STYLE, ...values };
  }
}
