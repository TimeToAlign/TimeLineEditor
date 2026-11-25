/**
 * The display toggles of the Properties tab: what a selected band, or a
 * selected flow-control element, shows of the drawing, and the one `style`
 * a press sends, a rule in the manifest's own layer (TimeToShare's
 * `docs/drawing.md`, sections 2.3 to 2.5).
 *
 * A toggle shows what the cascade gives (layout's `Cascade` over the
 * arranger's `styleLayers`, read on core's keys of the manifest's
 * elements): an element's toggle reads every rule, a band's every rule but
 * those naming `addresses`, so an element's own toggle overrides its band's
 * and the band's shows what its elements take where none states its own.
 * A press writes the toggle's rule only where needed: it removes the
 * property from that rule when the cascade then gives what the press asks
 * for, else states it there. "Atomic sections" is the rule of section 2.3
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

/** Whose display a toggle shows: a band's elements, one element's, or one rule's. */
type Scope = "band" | "element" | "rule";

/** One toggle of a display group: its word, its button's label, and whether it is pressed. */
export interface Toggle {
  readonly word: string;
  readonly label: string;
  readonly pressed: boolean;
  /** The rule a press writes or removes. */
  readonly select: Selector;
  readonly scope: Scope;
}

/** The toggles shown under one key of the Properties tab, in order. */
export interface ToggleGroup {
  readonly key: string;
  readonly toggles: readonly Toggle[];
}

/** The rule of section 2.3 showing the atomic sections, which the defaults hide. */
export const ATOMIC_SECTIONS: Selector = { element: "region", class: "tts:AtomicSection" };

/** The element types a flow control band's toggles show, each with its button's label. */
const BAND_WORDS: readonly { readonly type: ElementType; readonly label: string }[] = [
  { type: "jump", label: "Arcs" },
];

/** The element types of a flow-control element's own toggles, by role, each with its label. */
const ELEMENT_WORDS: {
  readonly [role in FlowSubject["element"]["role"]]: readonly {
    readonly type: ElementType;
    readonly label: string;
  }[];
} = {
  jump: [{ type: "jump", label: "Arcs" }],
  break: [{ type: "break", label: "Line" }],
  section_break: [{ type: "section_break", label: "Line" }],
  barline: [{ type: "barline", label: "Line" }],
  jump_target: [],
};

/** The cascade a block's manifest is drawn with, and its ancestry of timelines. */
function cascadeOf(view: View, manifest: Manifest): Cascade {
  return new Cascade(styleLayers(view.graphical, manifest), indexOf(manifest).ancestry);
}

/** The keys of `manifest`'s elements a selector of type `type` and `within` (or `addresses`) names. */
function keysOf(manifest: Manifest, type: ElementType, select: Selector): ElementKey[] {
  const { elements, ancestry } = indexOf(manifest);
  return elements.filter((key) => {
    if (key.type !== type) return false;
    if (select.within !== undefined) {
      return key.timeline !== null && (ancestry.get(key.timeline) ?? []).includes(select.within);
    }
    return (select.addresses ?? []).some(
      (address) => canonicalText(address) === canonicalText(key.address),
    );
  });
}

/** How many of the elements a display toggle shows are displayed: all of them, none, or some. */
type Shown = "all" | "none" | "some";

/**
 * How many of the elements of type `type` that `select` names are displayed
 * in `manifest` (`none` where it names none): a band's read without the
 * rules naming `addresses`.
 */
function shownOf(
  view: View,
  manifest: Manifest,
  type: ElementType,
  select: Selector,
  scope: "band" | "element",
): Shown {
  const cascade = cascadeOf(view, manifest);
  const shown = keysOf(manifest, type, select).map(
    (key) =>
      (scope === "band"
        ? cascade.resolveUnaddressed(key, undefined)
        : cascade.resolve(key, undefined)
      ).display === "inline",
  );
  if (shown.length > 0 && shown.every(Boolean)) return "all";
  return shown.some(Boolean) ? "some" : "none";
}

/** The `display` the manifest's own rule with selector `select` states; `undefined` for none. */
function statedDisplay(manifest: Manifest, select: Selector): string | undefined {
  const key = canonicalText(select);
  const rule = manifest.graphical?.rules?.find((item) => canonicalText(item.select) === key);
  if (rule === undefined) return undefined;
  const declaration =
    typeof rule.set === "string" ? manifest.graphical?.styles?.[rule.set] : rule.set;
  return declaration?.display;
}

/** A display toggle of `type` writing the rule `select`, offered where it names an element. */
function displayToggle(
  view: View,
  manifest: Manifest,
  word: { readonly type: ElementType; readonly label: string },
  select: Selector,
  scope: "band" | "element",
): Toggle[] {
  if (keysOf(manifest, word.type, select).length === 0) return [];
  const pressed = shownOf(view, manifest, word.type, select, scope) === "all";
  return [{ word: word.type, label: word.label, pressed, select, scope }];
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
  const pressed = statedDisplay(manifest, ATOMIC_SECTIONS) === "inline";
  return [
    {
      word: "atomic_sections",
      label: "Atomic sections",
      pressed,
      select: ATOMIC_SECTIONS,
      scope: "rule",
    },
  ];
}

/** The groups of a list of `[key, toggles]`, those without a toggle left out. */
function groups(entries: readonly (readonly [string, readonly Toggle[]])[]): ToggleGroup[] {
  return entries.flatMap(([key, toggles]) => (toggles.length === 0 ? [] : [{ key, toggles }]));
}

/**
 * The toggles of the one band the subjects name, in `view`: a flow control
 * band's Display ("Arcs": the arcs of every jump of its timeline's tree,
 * `{element: "jump", within: T}`) and Regions ("Atomic sections"); a regions
 * band's Regions. `[]` for any other band; `null` unless the subjects are
 * exactly one band.
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
      BAND_WORDS.flatMap((word) =>
        displayToggle(view, manifest, word, { element: word.type, within }, "band"),
      ),
    ],
    ["Regions", atomicToggle(manifest)],
  ]);
}

/**
 * The toggles of a flow-control element: Display, its own drawing (a jump's
 * "Arcs", a flow line's "Line"), each the rule `{element: type, addresses:
 * [{id}]}`; none for a jump target.
 */
export function elementToggles(view: View, flow: FlowSubject): ToggleGroup[] {
  const { manifest } = flow.block;
  const addresses: [Address] = [{ id: flow.element.id }];
  return groups([
    [
      "Display",
      ELEMENT_WORDS[flow.element.role].flatMap((word) =>
        displayToggle(view, manifest, word, { element: word.type, addresses }, "element"),
      ),
    ],
  ]);
}

/**
 * The `style` a press of `toggle` sends for `block` in `view`. "Atomic
 * sections" states `display: inline`, or removes it when pressed. A display
 * toggle asks for every element it shows hidden when pressed, else every
 * one displayed (a band whose elements are displayed in part is not
 * pressed, and a press displays them all): where the manifest's own rule
 * `toggle.select` states a `display` and the cascade without it gives what
 * is asked, it removes it (`null`); else it states `none` or `inline`.
 */
export function toggleCommand(view: View, block: Block, toggle: Toggle): StyleCommand {
  const command = (display: "inline" | "none" | null): StyleCommand => ({
    type: "style",
    select: toggle.select,
    set: { display },
    blocks: [block.id],
  });
  const { scope } = toggle;
  if (scope === "rule") return command(toggle.pressed ? null : "inline");
  const wanted = !toggle.pressed;
  const { manifest } = block;
  if (statedDisplay(manifest, toggle.select) !== undefined) {
    const removed = preview(view, command(null));
    const without = isCommandError(removed) ? undefined : removed.blocks[block.id]?.manifest;
    const type = toggle.select.element;
    if (without !== undefined && type !== undefined) {
      const asked: Shown = wanted ? "all" : "none";
      if (shownOf(view, without, type, toggle.select, scope) === asked) return command(null);
    }
  }
  return command(wanted ? "inline" : "none");
}
