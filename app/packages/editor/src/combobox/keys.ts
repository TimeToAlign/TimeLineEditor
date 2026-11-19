/**
 * The combobox's key table: what a key does to the list of options, after
 * the WAI-ARIA Authoring Practices "Combobox Pattern", example "Editable
 * Combobox With List Autocomplete". Pure, so that the table is tested row by
 * row without a DOM; `Combobox.svelte` applies it.
 */

/** Whether the list is open, and which option is active (none: `null`). */
export interface ComboboxState {
  readonly open: boolean;
  readonly active: number | null;
}

/** What a key asks of the combobox's user besides the next state. */
export type ComboboxAction = "none" | "pick" | "enter" | "clear";

/** The answer to one key. */
export interface Keyed {
  readonly state: ComboboxState;
  readonly action: ComboboxAction;
  /** Whether the combobox consumes the key; any other key keeps its native meaning. */
  readonly handled: boolean;
}

const CLOSED: ComboboxState = { open: false, active: null };

/** The keys that move the caret in the field and leave no option active. */
const CARET_KEYS: ReadonlySet<string> = new Set(["Home", "End", "ArrowLeft", "ArrowRight"]);

/**
 * The answer to `key` (a `KeyboardEvent.key`) pressed with or without Alt
 * in `state`, over `count` options and the field's `text`. An active option
 * outside the options counts as none. Alt changes only the two arrows.
 */
export function keyed(
  state: ComboboxState,
  key: string,
  alt: boolean,
  count: number,
  text: string,
): Keyed {
  const { open } = state;
  const active = state.active !== null && state.active < count ? state.active : null;
  const last = count === 0 ? null : count - 1;
  const answer = (next: ComboboxState, action: ComboboxAction = "none"): Keyed => ({
    state: next,
    action,
    handled: true,
  });
  const unhandled = (next: ComboboxState = state): Keyed => ({
    state: next,
    action: "none",
    handled: false,
  });
  switch (key) {
    case "ArrowDown":
      if (alt) return answer(open ? state : { open: true, active });
      if (!open) return answer({ open: true, active: count === 0 ? null : 0 });
      return answer({
        open,
        active: count === 0 ? null : active === last ? 0 : (active ?? -1) + 1,
      });
    case "ArrowUp":
      if (alt) return open ? answer(CLOSED) : unhandled();
      if (!open || active === null || active === 0) return answer({ open: true, active: last });
      return answer({ open, active: active - 1 });
    case "Enter":
      if (!open) return answer(state, "enter");
      return answer(CLOSED, active === null ? "enter" : "pick");
    case "Escape":
      if (open) return answer(CLOSED);
      return text === "" ? unhandled() : answer(state, "clear");
    case "Tab":
      return unhandled(open ? CLOSED : state);
    default:
      return CARET_KEYS.has(key) ? unhandled({ open, active: null }) : unhandled();
  }
}

/** The state after typing gives the field `text`: open with text, closed without, none active. */
export function typed(text: string): ComboboxState {
  return { open: text !== "", active: null };
}

/** The status region's words for `count` options, or for a search still running. */
export function announcement(count: number, loading: boolean): string {
  if (loading) return "Searching…";
  if (count === 0) return "No results";
  return count === 1 ? "1 result" : `${count} results`;
}
