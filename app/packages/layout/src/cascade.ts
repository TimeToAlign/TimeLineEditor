/**
 * The style cascade of the TimeSkeleton geometry specification
 * (`docs/geometry.md` in timeskeleton, sections 2 and 4).
 *
 * Style rules are held by containers: the manifest, and every timeline with
 * its subtree. A rule selects elements of its container by type, domain,
 * modality or id and sets display properties on them. Each property is
 * resolved on its own: among the matching rules that set it, the highest
 * level wins (block overrides 3, the manifest's own rules 2, option defaults
 * 1), then a rule naming the element's id, then the nearest container, then
 * a rule naming the element type, then the one naming more of domain and
 * modality, then the later rule; a property no rule sets takes its default.
 * `visible: false` is the filter.
 */

import type {
  ElementType,
  Graphical,
  LinePattern,
  Side,
  StyleProperties,
  StyleRule,
  StyleSelector,
} from "@timetoalign/timeskeleton";

export type Domain = "graphical" | "logical" | "physical";
export type Modality = "continuous" | "discrete";

/** What a selector can match a drawn element by. */
export interface DrawnElement {
  readonly element: ElementType;
  readonly id: string;
  readonly domain: Domain;
  readonly modality: Modality;
}

/** A rule with the depth of its container: 0 for the manifest, then its timelines. */
export interface ScopedRule extends StyleRule {
  /** Cascade level: defaults 1, manifest 2, block overrides 3. */
  readonly level: number;
  readonly depth: number;
}

/** Every style property, resolved. */
export interface Style {
  readonly colour: string;
  readonly line_pattern: LinePattern;
  readonly visible: boolean;
  readonly side: Side;
  readonly show_length: boolean;
  readonly show_projected_coordinates: boolean;
}

const DOMAIN_COLOURS: Readonly<Record<Domain, string>> = {
  graphical: "#FF0000",
  logical: "#00CC00",
  physical: "#0050EF",
};

/** The style an element has when no rule sets anything on it. */
export function defaultStyle(element: DrawnElement): Style {
  const type = element.element;
  const line = type === "timeline" || type === "child";
  return {
    colour: type === "label" ? "#000000" : DOMAIN_COLOURS[element.domain],
    line_pattern: type === "jump" || (line && element.modality === "discrete") ? "dotted" : "solid",
    visible: true,
    side: type === "child" || type === "map" || type === "label" ? "above" : "below",
    show_length: false,
    show_projected_coordinates: false,
  };
}

/** Whether an element matches every member a selector has. */
export function matches(selector: StyleSelector, element: DrawnElement): boolean {
  return (
    (selector.element === undefined || selector.element === element.element) &&
    (selector.domain === undefined || selector.domain === element.domain) &&
    (selector.modality === undefined || selector.modality === element.modality) &&
    (selector.ids === undefined || selector.ids.includes(element.id))
  );
}

/**
 * The rank of a rule: its level (block overrides 3, the manifest's own rules
 * 2, option defaults 1), whether it names ids, the depth of its container,
 * whether it names the element type, and how many of domain and modality it
 * names; compared in that order.
 */
export function rank(rule: ScopedRule): readonly [number, number, number, number, number] {
  const { select } = rule;
  return [
    rule.level,
    select.ids === undefined ? 0 : 1,
    rule.depth,
    select.element === undefined ? 0 : 1,
    (select.domain === undefined ? 0 : 1) + (select.modality === undefined ? 0 : 1),
  ];
}

function compareRanks(
  left: readonly [number, number, number, number, number],
  right: readonly [number, number, number, number, number],
): number {
  for (let index = 0; index < 5; index += 1) {
    const difference = (left[index] as number) - (right[index] as number);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * The rules that apply to the elements of one timeline: the manifest's
 * (depth 0), then those of each container on the path from the root down to
 * the timeline (`ancestry`, root first; depth 1, 2, ...), each list in order.
 */
export function scopedRules(
  graphical: Graphical | undefined,
  ancestry: readonly string[],
  level = 2,
): ScopedRule[] {
  const rules: ScopedRule[] = (graphical?.styles ?? []).map((rule) => ({
    ...rule,
    level,
    depth: 0,
  }));
  ancestry.forEach((id, index) => {
    const own = graphical?.timelines?.[id];
    if (own !== undefined) {
      for (const rule of own) rules.push({ ...rule, level, depth: index + 1 });
    }
  });
  return rules;
}

const PROPERTIES = [
  "colour",
  "line_pattern",
  "visible",
  "side",
  "show_length",
  "show_projected_coordinates",
] as const satisfies readonly (keyof StyleProperties & keyof Style)[];

/**
 * The style of an element under the rules of its containers, as
 * `scopedRules` lists them: within one container in list order, so the later
 * of two rules of equal rank wins.
 */
export function resolveStyle(rules: readonly ScopedRule[], element: DrawnElement): Style {
  const style: Record<string, unknown> = { ...defaultStyle(element) };
  for (const property of PROPERTIES) {
    let best: readonly [number, number, number, number, number] | undefined;
    for (const rule of rules) {
      const value = rule.set[property];
      if (value === undefined || !matches(rule.select, element)) continue;
      const current = rank(rule);
      if (best === undefined || compareRanks(current, best) >= 0) {
        best = current;
        style[property] = value;
      }
    }
  }
  return style as unknown as Style;
}
