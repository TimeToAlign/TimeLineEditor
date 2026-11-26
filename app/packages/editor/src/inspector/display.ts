/**
 * The display controls of the Properties tab, every one declared once: what
 * a selected band, a selected flow-control element or a timeline's band
 * list shows of the drawing, and the one `style` a press sends, a rule in
 * the manifest's own layer (TimeToShare's `docs/drawing.md`, sections 2.3
 * to 2.5).
 *
 * A **declaration** (`Declaration`) states the one rule a control writes
 * (its `property` in the rule `select`), the elements it can ever affect
 * (those of its `types` that the rule names) and how its effect is judged
 * (`effect`). One function reads every declaration the same way
 * (`declared`): a control whose rule names no element of the manifest is
 * never relevant and is not offered; an offered control is pressed as the
 * cascade gives its elements, and is **inert**, shown disabled with its
 * reason, where a press would change nothing drawn in the case at hand.
 *
 * A control shows what the cascade gives (layout's `Cascade` over the
 * arranger's `styleLayers`, read on core's keys of the manifest's
 * elements): whether they are displayed, or which labels their
 * `label-display` draws, so a jump's labels are composed with the words a
 * named timestamp's are (`name`, `id`, `label`). An element's control reads
 * every rule, a band's every rule but those naming `addresses`, so an
 * element's own control overrides its band's and the band's shows what
 * its elements take where none states its own. A press writes the
 * control's rule only where needed: it removes the property from that rule
 * when the cascade then gives what the press asks for, else states it
 * there. "Atomic sections" is the rule of section 2.3 alone: pressed while
 * the manifest's own layer states it, written and removed by a press.
 *
 * Whether a press changes anything drawn is read from the list of section
 * 2.4 of the ways one element hides another: an element is reached when
 * none of its holders (its band, its timeline's line, and the children
 * band and line of each ancestor; for a flow-control element of a child
 * also its root's flow control band, which lays it out) is hidden. A
 * control writing elements' `display` affects something when one of its
 * elements is reached (a jump only where it draws an arc, section 2.1); a
 * control writing `label-display` when one of its elements is reached and
 * has the label's text (a flow line also displayed itself); a band's
 * Visible when the band is reached and holds a displayed element.
 */

import type { Subject } from "@timetoalign/tilie-arranger";
import { styleLayers } from "@timetoalign/tilie-arranger";
import type {
  Block,
  ElementAddress,
  Facet,
  Manifest,
  StyleCommand,
  TimelineManifest,
  View,
} from "@timetoalign/tilie-core";
import {
  addressKey,
  addressWords,
  assertNever,
  bandAddress,
  bandOrderOf,
  canonicalText,
  facetWord,
  idAddress,
  inBlock,
  indexOf,
  isAtomicSection,
  isCommandError,
  isFacet,
  partAddress,
  preview,
  resolveAddress,
} from "@timetoalign/tilie-core";
import type { ElementKey } from "@timetoalign/tilie-core/drawing";
import { axisCoordinate, compareReal, realOf } from "@timetoalign/tilie-core/numbers";
import type { Style } from "@timetoalign/tilie-layout";
import { Cascade } from "@timetoalign/tilie-layout";
import type { Address, ElementType, Selector } from "@timetoalign/timetoshare";
import type { FlowSubject } from "./flow.ts";
import { bandWord } from "./words.ts";

/** Whose drawing a control shows: a band's elements, one element's, or one rule's. */
type Scope = "band" | "element" | "rule";

/** The property a control writes: whether elements are drawn, or which labels a flow-control element draws. */
type Property = "display" | "label-display";

/**
 * How a control's effect in the case at hand is judged: on its elements
 * being drawn (`drawn`), on their labels' text (`label`, the word of
 * `label-display` it writes), or on what a band holds (`band`, the band's
 * own Visible).
 */
type Effect = "drawn" | "label" | "band";

/** One control, declared once: the rule it writes, the elements it can affect, how its effect is judged. */
interface Declaration {
  readonly word: string;
  readonly label: string;
  readonly property: Property;
  /** The rule a press writes or removes. */
  readonly select: Selector;
  readonly scope: Scope;
  /** The types of the elements it can affect, those the rule's selector names. */
  readonly types: readonly ElementType[];
  readonly effect: Effect;
}

/** A declared control as the case at hand shows it. */
export interface Control extends Declaration {
  readonly pressed: boolean;
  /** Why a press changes nothing drawn now, the control then disabled; `null` where it changes something. */
  readonly inert: string | null;
}

/** The controls shown under one key of the Properties tab, in order. */
export interface ControlGroup {
  readonly key: string;
  readonly controls: readonly Control[];
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

/** The flow lines, whose labels their line hides (section 2.4, "An element hides its label"). */
const FLOW_LINES: readonly ElementType[] = ["break", "section_break", "barline"];

/** The types a timeline's line is drawn as: a root's, a child's, a segment's without a line (none). */
const LINE_TYPES: readonly (ElementType | null)[] = ["timeline", "child", null];

/** The facet of the band holding each type of element a band holds directly (section 2.1). */
const HELD_BY: { readonly [type in ElementType]?: Facet } = {
  region: "regions",
  map: "conversion_maps",
  wedge: "markers",
  break: "flow_control",
  section_break: "flow_control",
  barline: "flow_control",
  jump: "flow_control",
  symbol: "flow_control",
  fork: "flow_control",
};

/** What each band holds, in words: the elements its timeline's Visible would show. */
const HELD_WORDS: { readonly [facet in Facet]: string } = {
  children: "children",
  conversion_maps: "conversion maps",
  markers: "named timestamps",
  regions: "regions",
  flow_control: "flow-control elements",
};

/** One drawn part a display control shows: its element type, its button's label, the part of its address. */
interface Drawn {
  readonly type: ElementType;
  readonly label: string;
  /** The part word of its address beside the element's ID; none for the element itself. */
  readonly part?: "symbol" | "fork";
}

/** What a flow control band's Display controls show, each for every element of the band's tree. */
const BAND_DRAWN: readonly Drawn[] = [
  { type: "jump", label: "Arcs" },
  { type: "symbol", label: "Symbols" },
  { type: "fork", label: "Forks" },
];

/** What a flow-control element's own Display controls show, by its role. */
const ELEMENT_DRAWN: { readonly [role in FlowSubject["element"]["role"]]: readonly Drawn[] } = {
  jump: [
    { type: "jump", label: "Arcs" },
    { type: "symbol", label: "Symbol", part: "symbol" },
    { type: "fork", label: "Fork", part: "fork" },
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

/**
 * What the controls of one block read: the block in `view`, the cascade its
 * manifest is drawn with, and its manifest's element keys by address.
 */
class Reading {
  readonly view: View;
  readonly block: Block;
  readonly manifest: Manifest;
  readonly cascade: Cascade;
  readonly #keys = new Map<string, ElementKey[]>();
  /** The style of each key read, by key. */
  readonly #styles = new Map<ElementKey, Style>();

  constructor(view: View, block: Block) {
    this.view = view;
    this.block = block;
    this.manifest = block.manifest;
    this.cascade = cascadeOf(view.graphical, block.manifest);
    for (const key of indexOf(block.manifest).elements) {
      const text = addressKey(key.address);
      const known = this.#keys.get(text);
      if (known === undefined) this.#keys.set(text, [key]);
      else known.push(key);
    }
  }

  /** Every key of the manifest's elements. */
  get elements(): readonly ElementKey[] {
    return indexOf(this.manifest).elements;
  }

  /** The keys of the elements at `address` of one of `types`. */
  keysAt(address: ElementAddress, types: readonly (ElementType | null)[]): ElementKey[] {
    return (this.#keys.get(addressKey(address)) ?? []).filter((key) => types.includes(key.type));
  }

  /** The style the cascade gives `key`. */
  styleOf(key: ElementKey): Style {
    let style = this.#styles.get(key);
    if (style === undefined) {
      style = this.cascade.resolve(key, undefined);
      this.#styles.set(key, style);
    }
    return style;
  }

  /** Whether `key` is displayed by its own `display`. */
  own(key: ElementKey): boolean {
    return this.styleOf(key).display === "inline";
  }

  /** The IDs from the root of `timeline`'s tree down to it; a virtual timeline's itself. */
  ancestry(timeline: string): readonly string[] {
    return indexOf(this.manifest).ancestry.get(timeline) ?? [timeline];
  }

  /** The words of `address` in this block, capitalised, as the Journal names it. */
  words(address: ElementAddress): string {
    const words = addressWords(this.view, inBlock(this.block.id, address));
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
}

/** The cascade a manifest is drawn with under the workspace's `graphical`. */
function cascadeOf(graphical: View["graphical"], manifest: Manifest): Cascade {
  return new Cascade(styleLayers(graphical, manifest), indexOf(manifest).ancestry);
}

/** A holder of an element: the address whose display hides it, and the types drawn there. */
interface Holder {
  readonly address: ElementAddress;
  readonly types: readonly (ElementType | null)[];
}

const BAND: readonly ElementType[] = ["band"];

/** The band drawing `facet` of `timeline` as a holder. */
const bandHolder = (timeline: string, facet: Facet): Holder => ({
  address: bandAddress(timeline, facet),
  types: BAND,
});

/** The line of `timeline` and everything above it: the children band and line of each ancestor, nearest first. */
function lineAndAbove(reading: Reading, timeline: string): Holder[] {
  const holders: Holder[] = [];
  const ids = reading.ancestry(timeline);
  for (let index = ids.length - 1; index >= 0; index -= 1) {
    const id = ids[index];
    if (id === undefined) continue;
    if (index < ids.length - 1) holders.push(bandHolder(id, "children"));
    holders.push({ address: idAddress(id), types: LINE_TYPES });
  }
  return holders;
}

/**
 * The holders of `key`, nearest first (section 2.4): for an element a band
 * holds, that band (a child's flow-control element also its root's flow
 * control band, which lays it out); then its timeline's line and the
 * children band and line of each ancestor. A band's holders start at its
 * timeline's line, a child's at its parent's children band.
 */
function holdersOf(reading: Reading, key: ElementKey): Holder[] {
  if (key.timeline === null) return [];
  const timeline = key.timeline;
  if (key.type === "band") return lineAndAbove(reading, timeline);
  if (LINE_TYPES.includes(key.type)) return lineAndAbove(reading, timeline).slice(1);
  const facet = key.type === null ? undefined : HELD_BY[key.type];
  const bands = facet === undefined ? [] : [bandHolder(timeline, facet)];
  const [root] = reading.ancestry(timeline);
  if (facet === "flow_control" && root !== undefined && root !== timeline) {
    bands.push(bandHolder(root, "flow_control"));
  }
  return [...bands, ...lineAndAbove(reading, timeline)];
}

/** The first holder of `key` that is not displayed, but `shown`; `null` where every one is. */
function hiddenHolder(reading: Reading, key: ElementKey, shown?: ElementAddress): Holder | null {
  const kept = shown === undefined ? undefined : addressKey(shown);
  for (const holder of holdersOf(reading, key)) {
    if (addressKey(holder.address) === kept) continue;
    const keys = reading.keysAt(holder.address, holder.types);
    if (keys.length > 0 && !keys.some((item) => reading.own(item))) return holder;
  }
  return null;
}

/** Whether `distance`, a `by` on `timeline`'s axis, is 0. */
function isZero(distance: unknown, timeline: TimelineManifest): boolean {
  return compareReal(realOf(axisCoordinate(distance, timeline)), 0) === 0;
}

/**
 * Whether the element `key` draws anything of its type: a jump draws one arc
 * per destination whose place is not `by` 0 and whose `manifestation` is
 * not `volta` (section 2.1); every other element draws itself.
 */
function draws(reading: Reading, key: ElementKey): boolean {
  if (key.type !== "jump" || key.address.id === undefined) return true;
  const found = resolveAddress(reading.view, inBlock(reading.block.id, idAddress(key.address.id)));
  if (isCommandError(found) || found.kind !== "entry" || !("role" in found.element)) return true;
  const { timeline } = found.at;
  return (found.element.targets ?? []).some(
    (target) =>
      target.manifestation !== "volta" && (target.by === undefined || !isZero(target.by, timeline)),
  );
}

/**
 * The reason no element of `keys` is reached: the hidden holder of each,
 * in words ("The regions band of 'score' is hidden."); `null` where one of
 * them is reached.
 */
function hiddenReason(reading: Reading, keys: readonly ElementKey[]): string | null {
  const hidden = new Map<string, ElementAddress>();
  for (const key of keys) {
    const holder = hiddenHolder(reading, key);
    if (holder === null) return null;
    hidden.set(addressKey(holder.address), holder.address);
  }
  const words = [...hidden.values()].map((address, index) =>
    index === 0 ? reading.words(address) : uncapitalised(reading.words(address)),
  );
  const last = words.pop();
  if (last === undefined) return null;
  return words.length === 0 ? `${last} is hidden.` : `${words.join(", ")} and ${last} are hidden.`;
}

/** `text` with its first letter lower-case. */
function uncapitalised(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** The keys of the elements of `types` that the rule `select` names. */
function keysOf(reading: Reading, types: readonly ElementType[], select: Selector): ElementKey[] {
  return reading.elements.filter(
    (key) => key.type !== null && types.includes(key.type) && reading.cascade.matches(select, key),
  );
}

/**
 * The elements a band `{id: T, facet}` holds directly (section 2.1): those
 * of its facet's types on `T`, a child of `T` for the children band, and
 * for a root's flow control band also every flow-control element of its
 * tree, which it lays out; never what an ancestor line holds.
 */
function heldBy(reading: Reading, timeline: string, facet: Facet): ElementKey[] {
  const root = reading.ancestry(timeline)[0] === timeline;
  return reading.elements.filter((key) => {
    if (key.timeline === null || key.inside.includes("ancestor")) return false;
    if (facet === "children") {
      const ids = reading.ancestry(key.timeline);
      return LINE_TYPES.includes(key.type) && ids.length > 1 && ids.at(-2) === timeline;
    }
    const held = key.type === "label" && key.coordinates !== undefined ? "markers" : undefined;
    if ((key.type === null ? undefined : (HELD_BY[key.type] ?? held)) !== facet) return false;
    if (key.timeline === timeline) return true;
    return facet === "flow_control" && root && reading.ancestry(key.timeline)[0] === timeline;
  });
}

/** Whether a descendant of `timeline` holds an element of the type a band of `facet` holds. */
function heldBelow(reading: Reading, timeline: string, facet: Facet): boolean {
  return reading.elements.some(
    (key) =>
      key.timeline !== null &&
      key.timeline !== timeline &&
      key.type !== null &&
      HELD_BY[key.type] === facet &&
      reading.ancestry(key.timeline).includes(timeline),
  );
}

/**
 * Why a press of the band `{id: T, facet}`'s Visible changes nothing drawn:
 * a hidden holder of the band; else that `T` holds none of its facet's
 * elements (where `T`'s descendants hold some, they lie in their own
 * bands); else the hidden holders of what it holds, or that none of it is
 * displayed. `null` where the band is reached and holds a displayed element.
 */
function bandInert(reading: Reading, band: ElementKey): string | null {
  const holder = hiddenHolder(reading, band);
  if (holder !== null) return `${reading.words(holder.address)} is hidden.`;
  const { id } = band.address;
  const facet = band.facet;
  if (id === undefined || facet === null) return null;
  const held = heldBy(reading, id, facet).filter((key) => draws(reading, key));
  const things = HELD_WORDS[facet];
  if (held.length === 0) {
    const name = reading.words(idAddress(id));
    const below = heldBelow(reading, id, facet)
      ? `; those of its descendants lie in their own ${facetWord(facet)} bands`
      : "";
    return `${name} holds no ${things}${below}.`;
  }
  const reached = held.filter((key) => hiddenHolder(reading, key, band.address) === null);
  if (reached.some((key) => reading.own(key))) return null;
  if (reached.length === 0) return hiddenReason(reading, held);
  return `None of the ${things} it holds is displayed.`;
}

/**
 * Why a press of a control writing `label-display` changes nothing drawn:
 * no element of `keys` is reached (a flow line also displayed itself) and
 * has the text of `word`. `null` where one is and has it.
 */
function labelInert(reading: Reading, keys: readonly ElementKey[], word: string): string | null {
  const reached = keys.filter(
    (key) =>
      hiddenHolder(reading, key) === null &&
      (key.type === null || !FLOW_LINES.includes(key.type) || reading.own(key)),
  );
  if (reached.length === 0) {
    return hiddenReason(reading, keys) ?? "The lines whose labels it chooses are hidden.";
  }
  const part = LABEL_WORDS.find((item) => item.word === word)?.word;
  const texts = reached.filter((key) => {
    const { id } = key.address;
    if (id === undefined || part === undefined) return false;
    return reading.keysAt(partAddress(idAddress(id), part), ["label"]).length > 0;
  });
  return texts.length > 0 ? null : `Nothing here has a ${uncapitalised(labelOf(word))} to show.`;
}

/** The button's label of a word of `label-display`. */
function labelOf(word: string): string {
  return LABEL_WORDS.find((item) => item.word === word)?.label ?? word;
}

/**
 * Why a press of a control writing `display` changes nothing drawn: no
 * element of `keys` is reached, or none draws (a jump without an arc).
 * `null` where one is reached and draws.
 */
function drawnInert(reading: Reading, keys: readonly ElementKey[], label: string): string | null {
  const drawing = keys.filter((key) => draws(reading, key));
  if (drawing.length === 0) return `Nothing here draws ${uncapitalised(label)}.`;
  return hiddenReason(reading, drawing);
}

/** Why a press of `declaration`, whose rule names `keys`, changes nothing drawn; `null` where it changes something. */
function inertOf(
  reading: Reading,
  declaration: Declaration,
  keys: readonly ElementKey[],
): string | null {
  switch (declaration.effect) {
    case "band": {
      const [band] = keys;
      return band === undefined ? null : bandInert(reading, band);
    }
    case "label":
      return labelInert(reading, keys, declaration.word);
    case "drawn":
      return drawnInert(reading, keys, declaration.label);
    default:
      return assertNever(declaration.effect);
  }
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
 * The value of `declaration`'s property on each element it shows, as the
 * cascade of `reading` gives it: a band's read without the rules naming
 * `addresses`; a `label-display` in its canonical spelling.
 */
function valuesOf(reading: Reading, declaration: Declaration): string[] {
  return keysOf(reading, declaration.types, declaration.select).map((key) => {
    const style =
      declaration.scope === "band"
        ? reading.cascade.resolveUnaddressed(key, undefined)
        : reading.styleOf(key);
    return declaration.property === "display"
      ? style.display
      : labelValue(labelWords(style["label-display"]));
  });
}

/** Whether `declaration` shows its word on every one of `values` (none: not pressed). */
function holds(declaration: Declaration, values: readonly string[]): boolean {
  return (
    values.length > 0 &&
    values.every((value) =>
      declaration.property === "display"
        ? value === "inline"
        : labelWords(value).includes(declaration.word),
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

/**
 * `declaration` as the case at hand shows it: none where its rule names no
 * element of the manifest (never relevant); else pressed as the cascade
 * gives its elements ("Atomic sections" while the manifest's own layer
 * states it), and inert with its reason where a press changes nothing drawn.
 */
function declared(reading: Reading, declaration: Declaration): Control[] {
  const keys = keysOf(reading, declaration.types, declaration.select);
  if (keys.length === 0) return [];
  const pressed =
    declaration.scope === "rule"
      ? stated(reading.manifest, declaration.select, declaration.property) === "inline"
      : holds(declaration, valuesOf(reading, declaration));
  return [{ ...declaration, pressed, inert: inertOf(reading, declaration, keys) }];
}

/** The Display controls of `drawn`, each writing the rule `selectOf(drawn)`. */
function drawnControls(
  reading: Reading,
  drawn: readonly Drawn[],
  selectOf: (drawn: Drawn) => Selector,
  scope: "band" | "element",
): Control[] {
  return drawn.flatMap((item) =>
    declared(reading, {
      word: item.type,
      label: item.label,
      property: "display",
      select: selectOf(item),
      scope,
      types: [item.type],
      effect: "drawn",
    }),
  );
}

/** The Labels controls, Name, ID and Label, each writing `label-display` in the rule `select`. */
function labelControls(
  reading: Reading,
  select: Selector,
  scope: "band" | "element",
  types: readonly ElementType[],
): Control[] {
  return LABEL_WORDS.flatMap(({ word, label }) =>
    declared(reading, {
      word,
      label,
      property: "label-display",
      select,
      scope,
      types,
      effect: "label",
    }),
  );
}

/** The "Atomic sections" control, offered where the manifest holds atomic sections. */
function atomicControl(reading: Reading): Control[] {
  const { manifest } = reading;
  const regions = (timeline: Manifest["timelines"][number]): boolean =>
    timeline.regions.some((region) => isAtomicSection(manifest, region)) ||
    timeline.children.some(regions);
  if (!manifest.timelines.some(regions)) return [];
  return declared(reading, {
    word: "atomic_sections",
    label: "Atomic sections",
    property: "display",
    select: ATOMIC_SECTIONS,
    scope: "rule",
    types: ["region"],
    effect: "drawn",
  });
}

/** The groups of a list of `[key, controls]`, those without a control left out. */
function groups(entries: readonly (readonly [string, readonly Control[]])[]): ControlGroup[] {
  return entries.flatMap(([key, controls]) => (controls.length === 0 ? [] : [{ key, controls }]));
}

/**
 * The controls of the one band the subjects name, in `view`. A flow
 * control band of the timeline `T`: Display, the arcs, symbols and forks
 * of every element of `T`'s tree (`{element: type, within: T}`); Labels,
 * the words of their `label-display` (`{within: T}`); Regions, "Atomic
 * sections". A regions band: Regions. `[]` for any other band; `null`
 * unless the subjects are exactly one band.
 */
export function bandControls(view: View, subjects: readonly Subject[]): ControlGroup[] | null {
  const [subject, ...others] = subjects;
  if (subject === undefined || others.length > 0 || subject.resolved.kind !== "band") return null;
  const { block, at, facet } = subject.resolved;
  const reading = new Reading(view, block);
  if (facet === "regions") return groups([["Regions", atomicControl(reading)]]);
  if (facet !== "flow_control") return [];
  const within = at.timeline.id;
  return groups([
    [
      "Display",
      drawnControls(reading, BAND_DRAWN, ({ type }) => ({ element: type, within }), "band"),
    ],
    ["Labels", labelControls(reading, { within }, "band", LABELLED)],
    ["Regions", atomicControl(reading)],
  ]);
}

/**
 * The controls of a flow-control element `X`: Display, its own drawing (a
 * jump's arcs, symbol and fork, a flow line's line and symbol, a jump
 * target's symbol), each the rule `{element: type, addresses: [the part's
 * address]}`; Labels, the words of its `label-display` in the rule of its
 * arcs or line, `{element: role, addresses: [{id: X}]}`.
 */
export function elementControls(view: View, flow: FlowSubject): ControlGroup[] {
  const reading = new Reading(view, flow.block);
  const { id, role } = flow.element;
  const addressOf = (part?: "symbol" | "fork"): [Address] => [
    part === undefined ? { id } : { id, part: [part] },
  ];
  const labelled = LABELLED.find((type) => type === role);
  return groups([
    [
      "Display",
      drawnControls(
        reading,
        ELEMENT_DRAWN[role],
        ({ type, part }) => ({ element: type, addresses: addressOf(part) }),
        "element",
      ),
    ],
    [
      "Labels",
      labelled === undefined
        ? []
        : labelControls(reading, { element: labelled, addresses: addressOf() }, "element", [
            labelled,
          ]),
    ],
  ]);
}

/**
 * The value a press of `control` asks for on every element it shows: for
 * `display`, `none` when pressed, else `inline` (a band whose elements are
 * displayed in part is not pressed, and a press displays them all); for
 * `label-display`, the words of its first element with the control's word
 * taken out when pressed, else put in, in their canonical order.
 */
function askedOf(reading: Reading, control: Control): string {
  if (control.property === "display") return control.pressed ? "none" : "inline";
  const [first = "label"] = valuesOf(reading, control);
  const words = labelWords(first);
  return labelValue(
    control.pressed ? words.filter((word) => word !== control.word) : [...words, control.word],
  );
}

/**
 * The `style` a press of `control` sends for `block` in `view`. "Atomic
 * sections" states `display: inline`, or removes it when pressed. Any other
 * control asks for one value of its property on every element it shows
 * (`askedOf`): where the manifest's own rule `control.select` states that
 * property and the cascade without it gives what is asked, it removes it
 * (`null`); else it states the value asked.
 */
export function controlCommand(view: View, block: Block, control: Control): StyleCommand {
  const { property } = control;
  const command = (value: string | null): StyleCommand => ({
    type: "style",
    select: control.select,
    set: { [property]: value },
    blocks: [block.id],
  });
  if (control.scope === "rule") return command(control.pressed ? null : "inline");
  const asked = askedOf(new Reading(view, block), control);
  if (stated(block.manifest, control.select, property) !== undefined) {
    const removed = preview(view, command(null));
    const without = isCommandError(removed) ? undefined : removed.blocks[block.id];
    if (!isCommandError(removed) && without !== undefined) {
      const values = valuesOf(new Reading(removed, without), control);
      if (values.length > 0 && values.every((value) => value === asked)) return command(null);
    }
  }
  return command(asked);
}

/** One row of a timeline's band list: the band's facet and its Visible checkbox. */
export interface BandRow {
  readonly facet: Facet;
  /** The band's own `display`: its word the facet, its label the band's word, pressed while it is displayed. */
  readonly control: Control;
}

/** The ID of the timeline or virtual timeline a subject names by its card, its line or one of its bands. */
function timelineOf({ resolved }: Subject): string | null {
  if (resolved.kind === "card" || resolved.kind === "timeline" || resolved.kind === "band") {
    return resolved.at.timeline.id;
  }
  if (
    resolved.kind === "virtual_timeline" ||
    resolved.kind === "virtual_card" ||
    resolved.kind === "virtual_band"
  ) {
    return resolved.virtual.id;
  }
  return null;
}

/**
 * The band list of the timeline the subjects name, in `view`: when every
 * subject is the card of one timeline or virtual timeline `T`, its line, or
 * one of its bands, one row per band of `T` in its band order
 * (`bandOrderOf`: its entry of `graphical.order` completed against the
 * order it inherits), every timeline alike: a root's, a child's (its flow
 * control band included, which holds the child's flow-control elements),
 * a virtual timeline's (its markers and regions, the bands it has). Each
 * row is the control of the band's own `display`, the rule `{element:
 * "band", addresses: [{id: T, facet}]}`, pressed while the cascade
 * displays the band, inert where showing or hiding it changes nothing
 * drawn; a press writes or removes that rule as every element control
 * does (`controlCommand`). `null` for any other selection.
 */
export function bandList(view: View, subjects: readonly Subject[]): BandRow[] | null {
  const [first] = subjects;
  if (first === undefined) return null;
  const ids = new Set<string>();
  for (const subject of subjects) {
    const id = timelineOf(subject);
    if (subject.block !== first.block || id === null) return null;
    ids.add(id);
  }
  const [id, ...others] = ids;
  if (id === undefined || others.length > 0) return null;
  const block = view.blocks[first.block];
  if (block === undefined) return null;
  const reading = new Reading(view, block);
  return bandOrderOf(reading.manifest, id)
    .filter(isFacet)
    .flatMap((facet) =>
      declared(reading, {
        word: facet,
        label: bandWord(facet),
        property: "display",
        select: { element: "band", addresses: [{ id, facet }] },
        scope: "element",
        types: ["band"],
        effect: "band",
      }).map((control) => ({ facet, control })),
    );
}
