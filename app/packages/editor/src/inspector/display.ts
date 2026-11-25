/**
 * The display toggles of the Properties tab: what a selected band, or a
 * selected flow-control element, shows of the drawing, and the one `style`
 * a press sends, a rule in the manifest's own layer (TimeToShare's
 * `docs/drawing.md`, sections 2.3 to 2.5).
 *
 * A toggle shows what the cascade gives (layout's `Cascade` over the
 * arranger's `styleLayers`, read on core's keys of the manifest's
 * elements): whether they are displayed, or which labels their
 * `label-display` draws, so a jump's labels are composed with the words
 * a named timestamp's are (`name`, `id`, `label`). An element's toggle
 * reads every rule, a band's every rule but those naming `addresses`, so
 * an element's own toggle overrides its band's and the band's shows what
 * its elements take where none states its own. A press writes the
 * toggle's rule only where needed: it removes the property from that rule
 * when the cascade then gives what the press asks for, else states it
 * there. "Atomic sections" is the rule of section 2.3
 * alone: pressed while the manifest's own layer states it, written and
 * removed by a press.
 */

import type { Subject } from "@timetoalign/tilie-arranger";
import { styleLayers } from "@timetoalign/tilie-arranger";
import type { Block, Manifest, StyleCommand, View } from "@timetoalign/tilie-core";
import { canonicalText, indexOf, isCommandError, preview } from "@timetoalign/tilie-core";
import type { ElementKey } from "@timetoalign/tilie-core/drawing";
import { Cascade } from "@timetoalign/tilie-layout";
import type { Address, ElementType, Selector } from "@timetoalign/timetoshare";
import { ATOMIC_SECTION, expandIri } from "@timetoalign/timetoshare";
import type { FlowSubject } from "./flow.ts";

/** Whose drawing a toggle shows: a band's elements, one element's, or one rule's. */
type Scope = "band" | "element" | "rule";

/** The property a toggle writes: whether elements are drawn, or which labels a flow-control element draws. */
type Property = "display" | "label-display";

/** One toggle of a display group: its word, its button's label, and whether it is pressed. */
export interface Toggle {
  readonly word: string;
  readonly label: string;
  readonly pressed: boolean;
  readonly property: Property;
  /** The rule a press writes or removes. */
  readonly select: Selector;
  readonly scope: Scope;
  /** The types of the elements whose drawing it shows, those of the rule's `within` or `addresses`. */
  readonly types: readonly ElementType[];
}

/** The toggles shown under one key of the Properties tab, in order. */
export interface ToggleGroup {
  readonly key: string;
  readonly toggles: readonly Toggle[];
}

/** The rule of section 2.3 showing the atomic sections, which the defaults hide. */
export const ATOMIC_SECTIONS: Selector = { element: "region", class: "tts:AtomicSection" };

/** The words of `label-display` in their canonical order, each with its button's label. */
const LABEL_WORDS = [
  { word: "name", label: "Name" },
  { word: "id", label: "ID" },
  { word: "label", label: "Label" },
] as const;

/** The flow-control element types whose labels `label-display` chooses (section 2.4). */
const LABELLED: readonly ElementType[] = ["break", "section_break", "barline", "jump"];

/** One drawn part a display toggle shows: its element type, its button's label, the part of its address. */
interface Drawn {
  readonly type: ElementType;
  readonly label: string;
  /** The part word of its address beside the element's ID; none for the element itself. */
  readonly part?: "symbol" | "bracket";
}

/** What a flow control band's Display toggles show, each for every element of the band's tree. */
const BAND_DRAWN: readonly Drawn[] = [
  { type: "jump", label: "Arcs" },
  { type: "symbol", label: "Symbols" },
  { type: "bracket", label: "Brackets" },
];

/** What a flow-control element's own Display toggles show, by its role. */
const ELEMENT_DRAWN: { readonly [role in FlowSubject["element"]["role"]]: readonly Drawn[] } = {
  jump: [
    { type: "jump", label: "Arcs" },
    { type: "symbol", label: "Symbol", part: "symbol" },
    { type: "bracket", label: "Brackets", part: "bracket" },
  ],
  break: [
    { type: "break", label: "Line" },
    { type: "symbol", label: "Symbol", part: "symbol" },
  ],
  section_break: [
    { type: "section_break", label: "Line" },
    { type: "symbol", label: "Symbol", part: "symbol" },
  ],
  barline: [
    { type: "barline", label: "Line" },
    { type: "symbol", label: "Symbol", part: "symbol" },
  ],
  jump_target: [{ type: "symbol", label: "Symbol", part: "symbol" }],
};

/** The cascade a block's manifest is drawn with. */
function cascadeOf(view: View, manifest: Manifest): Cascade {
  return new Cascade(styleLayers(view.graphical, manifest), indexOf(manifest).ancestry);
}

/** The keys of `manifest`'s elements of `types` that the `within` or the `addresses` of `select` names. */
function keysOf(manifest: Manifest, types: readonly ElementType[], select: Selector): ElementKey[] {
  const { elements, ancestry } = indexOf(manifest);
  return elements.filter((key) => {
    if (key.type === null || !types.includes(key.type)) return false;
    if (select.within !== undefined) {
      return key.timeline !== null && (ancestry.get(key.timeline) ?? []).includes(select.within);
    }
    return (select.addresses ?? []).some(
      (address) => canonicalText(address) === canonicalText(key.address),
    );
  });
}

/** A `label-display` value with its words in their canonical order; `none` for no word. */
function labelValue(words: readonly string[]): string {
  const kept = LABEL_WORDS.filter(({ word }) => words.includes(word)).map(({ word }) => word);
  return kept.length === 0 ? "none" : kept.join(" ");
}

/** The words a `label-display` value lists. */
function labelWords(value: string): string[] {
  return value === "none" ? [] : value.split(" ");
}

/**
 * The value of `toggle`'s property on each element it shows in `manifest`,
 * as the cascade gives it: a band's read without the rules naming
 * `addresses`; a `label-display` in its canonical spelling.
 */
function valuesOf(view: View, manifest: Manifest, toggle: Toggle): string[] {
  const cascade = cascadeOf(view, manifest);
  return keysOf(manifest, toggle.types, toggle.select).map((key) => {
    const style =
      toggle.scope === "band"
        ? cascade.resolveUnaddressed(key, undefined)
        : cascade.resolve(key, undefined);
    return toggle.property === "display"
      ? style.display
      : labelValue(labelWords(style["label-display"]));
  });
}

/** Whether `toggle` shows its word on every one of `values` (none: not pressed). */
function holds(toggle: Toggle, values: readonly string[]): boolean {
  return (
    values.length > 0 &&
    values.every((value) =>
      toggle.property === "display" ? value === "inline" : labelWords(value).includes(toggle.word),
    )
  );
}

/** The value of `property` the manifest's own rule with selector `select` states; `undefined` for none. */
function stated(manifest: Manifest, select: Selector, property: Property): string | undefined {
  const key = canonicalText(select);
  const rule = manifest.graphical?.rules?.find((item) => canonicalText(item.select) === key);
  if (rule === undefined) return undefined;
  const declaration =
    typeof rule.set === "string" ? manifest.graphical?.styles?.[rule.set] : rule.set;
  return declaration?.[property];
}

/** `toggle` as `view` shows it in `manifest`, offered where it names an element. */
function offered(view: View, manifest: Manifest, toggle: Omit<Toggle, "pressed">): Toggle[] {
  if (keysOf(manifest, toggle.types, toggle.select).length === 0) return [];
  const unpressed = { ...toggle, pressed: false };
  return [{ ...toggle, pressed: holds(unpressed, valuesOf(view, manifest, unpressed)) }];
}

/** The Display toggles of `drawn`, each writing the rule `selectOf(drawn)`. */
function drawnToggles(
  view: View,
  manifest: Manifest,
  drawn: readonly Drawn[],
  selectOf: (drawn: Drawn) => Selector,
  scope: "band" | "element",
): Toggle[] {
  return drawn.flatMap((item) =>
    offered(view, manifest, {
      word: item.type,
      label: item.label,
      property: "display",
      select: selectOf(item),
      scope,
      types: [item.type],
    }),
  );
}

/** The Labels toggles, Name, ID and Label, each writing `label-display` in the rule `select`. */
function labelToggles(
  view: View,
  manifest: Manifest,
  select: Selector,
  scope: "band" | "element",
  types: readonly ElementType[],
): Toggle[] {
  return LABEL_WORDS.flatMap(({ word, label }) =>
    offered(view, manifest, { word, label, property: "label-display", select, scope, types }),
  );
}

/** Whether a region of `manifest` states the class of an atomic section in its `type` statement. */
function holdsAtomicSections(manifest: Manifest): boolean {
  const context: unknown = manifest["@context"];
  const regions = (timeline: Manifest["timelines"][number]): boolean =>
    timeline.regions.some((region) =>
      (region.statements?.type ?? []).some(
        (type) => (expandIri(context, type) ?? type) === ATOMIC_SECTION,
      ),
    ) || timeline.children.some(regions);
  return manifest.timelines.some(regions);
}

/** The "Atomic sections" toggle, offered where the manifest holds atomic sections. */
function atomicToggle(manifest: Manifest): Toggle[] {
  if (!holdsAtomicSections(manifest)) return [];
  return [
    {
      word: "atomic_sections",
      label: "Atomic sections",
      pressed: stated(manifest, ATOMIC_SECTIONS, "display") === "inline",
      property: "display",
      select: ATOMIC_SECTIONS,
      scope: "rule",
      types: ["region"],
    },
  ];
}

/** The groups of a list of `[key, toggles]`, those without a toggle left out. */
function groups(entries: readonly (readonly [string, readonly Toggle[]])[]): ToggleGroup[] {
  return entries.flatMap(([key, toggles]) => (toggles.length === 0 ? [] : [{ key, toggles }]));
}

/**
 * The toggles of the one band the subjects name, in `view`. A flow control
 * band of the timeline `T`: Display, the arcs, symbols and brackets of
 * every element of `T`'s tree (`{element: type, within: T}`); Labels, the
 * words of their `label-display` (`{within: T}`); Regions, "Atomic
 * sections". A regions band: Regions. `[]` for any other band; `null`
 * unless the subjects are exactly one band.
 */
export function bandToggles(view: View, subjects: readonly Subject[]): ToggleGroup[] | null {
  const [subject, ...others] = subjects;
  if (subject === undefined || others.length > 0 || subject.resolved.kind !== "band") return null;
  const { block, at, facet } = subject.resolved;
  const { manifest } = block;
  if (facet === "regions") return groups([["Regions", atomicToggle(manifest)]]);
  if (facet !== "flow_control") return [];
  const within = at.timeline.id;
  return groups([
    [
      "Display",
      drawnToggles(view, manifest, BAND_DRAWN, ({ type }) => ({ element: type, within }), "band"),
    ],
    ["Labels", labelToggles(view, manifest, { within }, "band", LABELLED)],
    ["Regions", atomicToggle(manifest)],
  ]);
}

/**
 * The toggles of a flow-control element `X`: Display, its own drawing (a
 * jump's arcs, symbol and brackets, a flow line's line and symbol, a jump
 * target's symbol), each the rule `{element: type, addresses: [the part's
 * address]}`; Labels, the words of its `label-display` in the rule of its
 * arcs or line, `{element: role, addresses: [{id: X}]}`.
 */
export function elementToggles(view: View, flow: FlowSubject): ToggleGroup[] {
  const { manifest } = flow.block;
  const { id, role } = flow.element;
  const addressOf = (part?: "symbol" | "bracket"): [Address] => [
    part === undefined ? { id } : { id, part: [part] },
  ];
  const labelled = LABELLED.find((type) => type === role);
  return groups([
    [
      "Display",
      drawnToggles(
        view,
        manifest,
        ELEMENT_DRAWN[role],
        ({ type, part }) => ({ element: type, addresses: addressOf(part) }),
        "element",
      ),
    ],
    [
      "Labels",
      labelled === undefined
        ? []
        : labelToggles(view, manifest, { element: labelled, addresses: addressOf() }, "element", [
            labelled,
          ]),
    ],
  ]);
}

/**
 * The value a press of `toggle` asks for on every element it shows: for
 * `display`, `none` when pressed, else `inline` (a band whose elements are
 * displayed in part is not pressed, and a press displays them all); for
 * `label-display`, the words of its first element with the toggle's word
 * taken out when pressed, else put in, in their canonical order.
 */
function askedOf(view: View, manifest: Manifest, toggle: Toggle): string {
  if (toggle.property === "display") return toggle.pressed ? "none" : "inline";
  const [first = "label"] = valuesOf(view, manifest, toggle);
  const words = labelWords(first);
  return labelValue(
    toggle.pressed ? words.filter((word) => word !== toggle.word) : [...words, toggle.word],
  );
}

/**
 * The `style` a press of `toggle` sends for `block` in `view`. "Atomic
 * sections" states `display: inline`, or removes it when pressed. Any other
 * toggle asks for one value of its property on every element it shows
 * (`askedOf`): where the manifest's own rule `toggle.select` states that
 * property and the cascade without it gives what is asked, it removes it
 * (`null`); else it states the value asked.
 */
export function toggleCommand(view: View, block: Block, toggle: Toggle): StyleCommand {
  const { property } = toggle;
  const command = (value: string | null): StyleCommand => ({
    type: "style",
    select: toggle.select,
    set: { [property]: value },
    blocks: [block.id],
  });
  if (toggle.scope === "rule") return command(toggle.pressed ? null : "inline");
  const { manifest } = block;
  const asked = askedOf(view, manifest, toggle);
  if (stated(manifest, toggle.select, property) !== undefined) {
    const removed = preview(view, command(null));
    const without = isCommandError(removed) ? undefined : removed.blocks[block.id]?.manifest;
    if (without !== undefined) {
      const values = valuesOf(view, without, toggle);
      if (values.length > 0 && values.every((value) => value === asked)) return command(null);
    }
  }
  return command(asked);
}
