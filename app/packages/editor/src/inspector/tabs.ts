/**
 * The inspector's tab rule: which tabs there are, which one is shown and
 * where the keys move, which editors show their level tab when entered, how
 * a pinned timestamp selects the Timestamp tab, a pinned or selected
 * MatchStamp the Matchstamp tab and a selected elision the Elisions tab.
 * Pure: the component holds the tab last chosen and the pin, the drawer
 * tells the rule when the inspector is shown or hidden, when a timestamp
 * is pinned and when the selection changes, and both read the store's
 * count of editor openings.
 */

import type { Level } from "@timetoalign/tilie-arranger";
import type {
  Address,
  AnchorIndex,
  EditorKind,
  Manifest,
  Pin,
  View,
} from "@timetoalign/tilie-core";
import { assertNever, resolveAddress } from "@timetoalign/tilie-core";
import { levelWord } from "./words.ts";

/** The inspector's sections, in tab order: the level tab first, then Properties and Regions, then the six others, Elisions last. */
export const TABS = [
  "level",
  "properties",
  "regions",
  "metadata",
  "manifest",
  "journal",
  "timestamp",
  "matchstamp",
  "elisions",
] as const;
/** One of the inspector's tabs. */
export type Tab = (typeof TABS)[number];

/** The word on each tab but the level tab, which is named by its level. */
const TAB_LABELS: { readonly [tab in Exclude<Tab, "level">]: string } = {
  properties: "Properties",
  regions: "Regions",
  metadata: "Metadata",
  manifest: "Manifest",
  journal: "Journal",
  timestamp: "Timestamp",
  matchstamp: "Matchstamp",
  elisions: "Elisions",
};

/** The word on tab `tab` at level `level`: the level's word on the level tab (`Arranger`, `Bundle`, …). */
export function tabLabel(tab: Tab, level: Level): string {
  return tab === "level" ? levelWord(level) : TAB_LABELS[tab];
}

/**
 * The tab last chosen, and how many editors the store had opened when it
 * was chosen or when the inspector was last shown or hidden.
 */
export interface Picked {
  readonly tab: Tab;
  readonly openings: number;
}

/** What is chosen when the inspector is first made: the level tab while an editor is open, else Properties. */
export function initialPick(depth: number, openings: number): Picked {
  return { tab: depth > 0 ? "level" : "properties", openings };
}

/**
 * The pick once the inspector is shown (`shown` true) or hidden. Hiding it
 * records the count of openings; showing it again shows the level tab when
 * an editor was opened while it was hidden (the count differs, as it does
 * for a store replaced meanwhile), else the tab chosen. While the inspector
 * is shown nothing but a choice and entering an editor whose level tab holds
 * its work (`entered`) changes the pick, so leaving an editor never
 * changes the tab shown.
 */
export function toggled(picked: Picked, openings: number, shown: boolean): Picked {
  const tab = shown && openings !== picked.openings ? "level" : picked.tab;
  return { tab, openings };
}

/**
 * The pick once an editor of `kind` is entered, the store having opened
 * `openings` editors: a children editor and a flow-control editor show their
 * level tab, which holds what they edit (the timeline's children, the
 * flow-control elements of the root's tree); entering any other editor
 * leaves the pick as it is.
 */
export function entered(picked: Picked, kind: EditorKind, openings: number): Picked {
  switch (kind) {
    case "children":
    case "flow":
      return { tab: "level", openings };
    case "bundle":
    case "group":
    case "timeline":
      return picked;
    default:
      return assertNever(kind);
  }
}

/**
 * A pin as the inspector holds it: core's pin (unnamed, or showing a named
 * timestamp), with the manifest of its block it was read from.
 */
export interface Held {
  readonly pin: Pin;
  readonly manifest: Manifest;
}

/** A held pin as shown, and the tab shown before the first pin, shown again when the pin is cleared. */
export type ShownPin = Held & { readonly before: Tab };

/** `pin` held in `view`: with its block's manifest; `null` when its block is gone. */
export function heldOf(view: View, pin: Pin): Held | null {
  const block = view.blocks[pin.timestamp.block];
  if (block === undefined) return null;
  return { pin, manifest: block.manifest };
}

/** Whether `address` names a named timestamp of `view`. */
export function namesTimestamp(view: View, address: Address): boolean {
  if (address.id === undefined) return false;
  const resolved = resolveAddress(view, address);
  return "kind" in resolved && resolved.kind === "timestamp";
}

/**
 * Whether `held` no longer holds in `view`. An unnamed pin: its block is
 * deleted, the block's manifest is another object (any change to it), or
 * the granularity is another object than the one it was read under (a
 * change to it). A named timestamp's pin, which is read anew from the view
 * whenever it is shown: its address names no named timestamp.
 */
export function outlived(held: Held, view: View): boolean {
  const { pin } = held;
  if (pin.named !== null) {
    return !namesTimestamp(view, { block: pin.spec.block, id: pin.named.id });
  }
  return (
    view.blocks[pin.timestamp.block]?.manifest !== held.manifest ||
    view.settings.granularity !== pin.spec.granularity
  );
}

/** What the inspector shows: the pick, and the pin (`null` without one). */
export interface Shown {
  readonly picked: Picked;
  readonly pin: ShownPin | null;
}

/**
 * What is shown once `held` is pinned: the Timestamp tab, remembering the
 * tab shown before unless a pin already did; or, for `null`, once the pin
 * is cleared: the tab remembered, nothing pinned. Clearing without a pin
 * changes nothing.
 */
export function pinned(shown: Shown, held: Held | null): Shown {
  const { picked, pin } = shown;
  if (held !== null) {
    return {
      picked: { tab: "timestamp", openings: picked.openings },
      pin: { ...held, before: pin?.before ?? picked.tab },
    };
  }
  if (pin === null) return shown;
  return { picked: { tab: pin.before, openings: picked.openings }, pin: null };
}

/** What is shown once `tab` is chosen: that tab; any tab but Timestamp clears the pin. */
export function chosen(shown: Shown, tab: Tab, openings: number): Shown {
  return { picked: { tab, openings }, pin: tab === "timestamp" ? shown.pin : null };
}

/**
 * Whether `address` names an elision of `view` itself, whose form the
 * Elisions tab shows: a stored one (`{block, id: E}`) or an automatic one,
 * which the drawing derives and core resolves as the part `elision` of the
 * timeline it lies on (`{block, id: T, part: ["elision"]}`). Never one of
 * their parts, which a press on the canvas selects as the elision itself.
 */
export function namesElision(view: View, address: Address): boolean {
  if (address.id === undefined) return false;
  const resolved = resolveAddress(view, address);
  if (!("kind" in resolved)) return false;
  return (
    resolved.kind === "elision" ||
    (resolved.kind === "part" && resolved.word === "elision" && resolved.owner.kind === "timeline")
  );
}

/**
 * What is shown once the selection changed to `addresses`: when they are
 * exactly one elision, stored or automatic (`namesElision`), the Elisions tab, as though it were chosen
 * (`chosen`: the pin cleared), remembering no tab to go back to, so the
 * tab stays once the selection leaves the elision; any other selection,
 * several things with an elision among them included, changes nothing
 * (`shown` itself). Told of a change of the selection only, never while
 * the same elision stays selected, so a tab chosen meanwhile stays.
 */
export function elisionSelected(
  shown: Shown,
  view: View,
  addresses: readonly Address[],
  openings: number,
): Shown {
  const [only, ...others] = addresses;
  if (only === undefined || others.length > 0 || !namesElision(view, only)) return shown;
  return chosen(shown, "elisions", openings);
}

/**
 * A MatchStamp as the Matchstamp tab holds it: a potential one, pinned on
 * the canvas, by its number in the anchor index of its block's table it was
 * read from; or a named one, by its ID.
 */
export type HeldMatch =
  | {
      readonly kind: "potential";
      readonly block: string;
      readonly index: AnchorIndex;
      readonly matchStamp: number;
    }
  | { readonly kind: "named"; readonly block: string; readonly id: string };

/** A held MatchStamp as shown, and the tab shown before it, shown again when it is let go. */
export type ShownMatch = HeldMatch & { readonly before: Tab };

/** What the inspector shows of MatchStamps: the pick, and the MatchStamp (`null` without one). */
export interface MatchShown {
  readonly picked: Picked;
  readonly match: ShownMatch | null;
}

/**
 * What is shown once `held` is shown: the Matchstamp tab, remembering the
 * tab shown before unless a MatchStamp already did; or, for `null`, once it
 * is let go: the tab remembered, no MatchStamp. Letting go without one
 * changes nothing.
 */
export function matchPinned(shown: MatchShown, held: HeldMatch | null): MatchShown {
  const { picked, match } = shown;
  if (held !== null) {
    return {
      picked: { tab: "matchstamp", openings: picked.openings },
      match: { ...held, before: match?.before ?? picked.tab },
    };
  }
  if (match === null) return shown;
  return { picked: { tab: match.before, openings: picked.openings }, match: null };
}

/** The ID of the named MatchStamp `address` names in `view`, itself or one of its anchors; `null` for anything else. */
export function namedMatchStampOf(view: View, address: Address): string | null {
  if (address.id === undefined || address.part !== undefined) return null;
  const resolved = resolveAddress(view, address);
  if (!("kind" in resolved)) return null;
  return resolved.kind === "matchstamp" || resolved.kind === "anchor"
    ? resolved.matchstamp.id
    : null;
}

/**
 * Whether `held` no longer holds in `view`: a named MatchStamp its address
 * no longer names; a potential one, its block's anchor index now another
 * than the one it was read from (`index`, `null` without a table: the
 * table, the filter or the user changed).
 */
export function matchOutlived(held: HeldMatch, view: View, index: AnchorIndex | null): boolean {
  if (held.kind === "named") {
    return namedMatchStampOf(view, { block: held.block, id: held.id }) !== held.id;
  }
  return view.blocks[held.block] === undefined || index !== held.index;
}

/** A key press as the tab list reads it. */
type TabKey = Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey">;

/**
 * The tab a key on the tab `from` moves to: the arrows the next or
 * previous tab (wrapping), Home and End the first and last; `undefined`
 * for any other key and for a key held with Alt, Ctrl or Meta, which is
 * the browser's (Alt+ArrowLeft goes back).
 */
export function nextTab(from: Tab, key: TabKey): Tab | undefined {
  if (key.altKey || key.ctrlKey || key.metaKey) return undefined;
  const at = TABS.indexOf(from);
  switch (key.key) {
    case "ArrowRight":
      return TABS[(at + 1) % TABS.length];
    case "ArrowLeft":
      return TABS[(at + TABS.length - 1) % TABS.length];
    case "Home":
      return TABS[0];
    case "End":
      return TABS[TABS.length - 1];
    default:
      return undefined;
  }
}
