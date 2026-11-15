/**
 * The inspector's tab rule: which tabs there are, which one is shown and
 * where the keys move, and how a pinned timestamp selects the Timestamp tab.
 * Pure: the component holds the tab last chosen and the pin, the drawer
 * tells the rule when the inspector is shown or hidden and when a timestamp
 * is pinned, and both read the store's count of editor openings.
 */

import type { Level } from "@timetoalign/tilie-arranger";
import type { Address, Manifest, Pin, View } from "@timetoalign/tilie-core";
import { resolveAddress } from "@timetoalign/tilie-core";
import { levelWord } from "./words.ts";

/** The inspector's sections, in tab order: the level tab first, then the four others. */
export const TABS = ["level", "properties", "manifest", "journal", "timestamp"] as const;
export type Tab = (typeof TABS)[number];

/** The word on each tab but the level tab, which is named by its level. */
const TAB_LABELS: { readonly [tab in Exclude<Tab, "level">]: string } = {
  properties: "Properties",
  manifest: "Manifest",
  journal: "Journal",
  timestamp: "Timestamp",
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
 * is shown nothing but a choice changes the pick, so entering or leaving an
 * editor never changes the tab shown.
 */
export function toggled(picked: Picked, openings: number, shown: boolean): Picked {
  const tab = shown && openings !== picked.openings ? "level" : picked.tab;
  return { tab, openings };
}

/**
 * An unnamed pin as the inspector holds it: core's pin, with the manifest
 * of its block it was read from, so that it is never shown with another;
 * the granularity it was read under is its spec's.
 */
export interface UnnamedPinning {
  readonly pin: Pin;
  readonly manifest: Manifest;
}

/**
 * A named timestamp as the inspector holds it: its address `{block, id}`,
 * its pin read anew from the view, and with the canvas's MeasureMap rows,
 * whenever it is shown.
 */
export interface NamedPinning {
  readonly named: Address;
}

/** What the Timestamp tab shows: an unnamed pin, or a named timestamp. */
export type Pinning = UnnamedPinning | NamedPinning;

/** A pinning as shown, and the tab shown before the first pin, shown again when the pin is cleared. */
export type ShownPin = Pinning & { readonly before: Tab };

/** `pin` held in `view`: with its block's manifest; `null` when its block is gone. */
export function pinningOf(view: View, pin: Pin): UnnamedPinning | null {
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
 * Whether `pinning` no longer holds in `view`. An unnamed pin: its block is
 * deleted, the block's manifest is another object (any change to it), or
 * the granularity is another object than the one it was read under (a
 * change to it). A named timestamp: its address names no named timestamp.
 */
export function outlived(pinning: Pinning, view: View): boolean {
  if ("named" in pinning) return !namesTimestamp(view, pinning.named);
  return (
    view.blocks[pinning.pin.timestamp.block]?.manifest !== pinning.manifest ||
    view.settings.granularity !== pinning.pin.spec.granularity
  );
}

/** What the inspector shows: the pick, and the pin (`null` without one). */
export interface Shown {
  readonly picked: Picked;
  readonly pin: ShownPin | null;
}

/**
 * What is shown once `pinning` is pinned: the Timestamp tab, remembering
 * the tab shown before unless a pin already did; or, for `null`, once the
 * pin is cleared: the tab remembered, nothing pinned. Clearing without a
 * pin changes nothing.
 */
export function pinned(shown: Shown, pinning: Pinning | null): Shown {
  const { picked, pin } = shown;
  if (pinning !== null) {
    return {
      picked: { tab: "timestamp", openings: picked.openings },
      pin: { ...pinning, before: pin?.before ?? picked.tab },
    };
  }
  if (pin === null) return shown;
  return { picked: { tab: pin.before, openings: picked.openings }, pin: null };
}

/** What is shown once `tab` is chosen: that tab; any tab but Timestamp clears the pin. */
export function chosen(shown: Shown, tab: Tab, openings: number): Shown {
  return { picked: { tab, openings }, pin: tab === "timestamp" ? shown.pin : null };
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
