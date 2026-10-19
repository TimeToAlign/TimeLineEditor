/**
 * The inspector's tab rule: which tabs are present, which one is shown and
 * where the keys move. Pure: the component holds the tab last chosen and
 * reads the store's count of editor openings.
 */

/** The inspector's sections, in tab order; Editor is there only while an editor is open. */
export const TABS = ["editor", "properties", "manifest", "journal"] as const;
export type Tab = (typeof TABS)[number];

/** The word on each tab. */
export const TAB_LABELS: { readonly [tab in Tab]: string } = {
  editor: "Editor",
  properties: "Properties",
  manifest: "Manifest",
  journal: "Journal",
};

/** The tabs present while `depth` editors are open, in order. */
export function tabsOf(depth: number): readonly Tab[] {
  return depth > 0 ? TABS : TABS.filter((tab) => tab !== "editor");
}

/** The tab last chosen, and how many editors had been opened when it was. */
export interface Picked {
  readonly tab: Tab;
  readonly openings: number;
}

/** What is chosen when the inspector appears: Editor while an editor is open, else Properties. */
export function initialPick(depth: number, openings: number): Picked {
  return { tab: depth > 0 ? "editor" : "properties", openings };
}

/**
 * The tab shown: Editor once an editor was opened after the last choice,
 * else the tab chosen; Properties instead of Editor while no editor is
 * open. So Editor is shown on every opening, Properties when the last
 * editor closes with Editor shown, and the chosen tab is kept otherwise.
 */
export function shownTab(picked: Picked, openings: number, depth: number): Tab {
  const chosen = openings > picked.openings ? "editor" : picked.tab;
  return depth === 0 && chosen === "editor" ? "properties" : chosen;
}

/** A key press as the tab list reads it. */
type TabKey = Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey">;

/**
 * The tab a key on the tab `from` moves to: the arrows the next or
 * previous tab present (wrapping), Home and End the first and last;
 * `undefined` for any other key and for a key held with Alt, Ctrl or Meta,
 * which is the browser's (Alt+ArrowLeft goes back).
 */
export function nextTab(tabs: readonly Tab[], from: Tab, key: TabKey): Tab | undefined {
  if (key.altKey || key.ctrlKey || key.metaKey) return undefined;
  const at = tabs.indexOf(from);
  switch (key.key) {
    case "ArrowRight":
      return tabs[(at + 1) % tabs.length];
    case "ArrowLeft":
      return tabs[(at + tabs.length - 1) % tabs.length];
    case "Home":
      return tabs[0];
    case "End":
      return tabs.at(-1);
    default:
      return undefined;
  }
}
