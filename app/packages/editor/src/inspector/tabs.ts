/**
 * The inspector's tab rule: which tabs there are, which one is shown and
 * where the keys move. Pure: the component holds the tab last chosen, the
 * drawer tells the rule when the inspector is shown or hidden, and both
 * read the store's count of editor openings.
 */

import type { Level } from "@timetoalign/tilie-arranger";
import { levelWord } from "./words.ts";

/** The inspector's sections, in tab order: the level tab first, then the three others. */
export const TABS = ["level", "properties", "manifest", "journal"] as const;
export type Tab = (typeof TABS)[number];

/** The word on each tab but the level tab, which is named by its level. */
const TAB_LABELS: { readonly [tab in Exclude<Tab, "level">]: string } = {
  properties: "Properties",
  manifest: "Manifest",
  journal: "Journal",
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
