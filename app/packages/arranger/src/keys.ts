/**
 * The canvas's keys: one table of rows, each a match and what it does, read
 * in order; the first row that matches a key decides it. Every row asks the
 * canvas's rules (`rulesOf`) whether it may run, and nothing else.
 */

import type { Address, Command, View } from "@timetoalign/tilie-core";
import type { FontMetrics } from "@timetoalign/timeskeleton";
import type { BandDirection } from "./bands.ts";
import { bandStepCommand } from "./bands.ts";
import { nudgeCommand, removeCommand, type ZOrderAction, zOrderCommand } from "./commands.ts";
import type { LevelRules } from "./containers.ts";
import type { Editing } from "./editing.ts";
import type { ResizeMode } from "./resize.ts";
import type { Selection } from "./selection.ts";
import { selectedBand } from "./selection.ts";

/** Arrow keys move by one grid step; with Shift by this many. */
export const LARGE_STEP = 8;

/** What a key acts on and through: the canvas at the moment the key is pressed. */
export interface KeyContext {
  readonly view: View;
  readonly selection: Selection;
  readonly editing: Editing | null;
  /** The canvas's rules now (`rulesOf`). */
  readonly rules: LevelRules;
  readonly metrics: FontMetrics;
  /** How many editors are open: Escape closes the innermost. */
  readonly editors: number;
  select(next: Selection): void;
  /** Runs a command; whether the store accepted it (a refusal is shown). */
  dispatch(command: Command): boolean;
  /** Shows a refusal that no command produced. */
  refuse(message: string): void;
  setMode(mode: ResizeMode): void;
  toggleLock(): void;
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
  /** Ends a gesture in progress (`GestureSlot.abort`); whether there was one. */
  abortGesture(): boolean;
  /** Closes the innermost editor. */
  done(): void;
  /** Opens the editor of `target`. */
  open(target: Address): void;
  /** The editor Enter opens (`openable`); `null` when the selection opens none. */
  openable(): Address | null;
  /** What a press on the focused element (the key's target) selects, as a click would. */
  pressed(): Selection | null;
}

/** One row of the key table. */
export interface KeyRow {
  match(event: KeyboardEvent): boolean;
  /** Act; whether the key was the canvas's (it is then taken from the page). */
  run(context: KeyContext, event: KeyboardEvent): boolean;
}

const ARROWS: { readonly [key: string]: readonly [number, number] } = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const MODE_KEYS: { readonly [key: string]: ResizeMode } = { 1: "scale", 2: "box", 3: "stretch" };

const Z_ORDER: { readonly [code: string]: readonly [ZOrderAction, ZOrderAction] } = {
  BracketRight: ["forward", "front"],
  BracketLeft: ["backward", "back"],
};

const command = (event: KeyboardEvent) => event.ctrlKey || event.metaKey;
const plain = (event: KeyboardEvent) => !command(event);

/** The selected block ids, without element addresses. */
function selectedBlocks({ view, selection }: KeyContext): string[] {
  return [...selection].filter((address) => Object.hasOwn(view.blocks, address));
}

/** The key table, in the order the rows are read. */
export const KEYS: readonly KeyRow[] = [
  {
    // Ctrl/Cmd+Up/Down is the band's whenever a band is selected: it steps exactly one.
    match: (event) => command(event) && (event.key === "ArrowUp" || event.key === "ArrowDown"),
    run(context, event) {
      const bands = [...context.selection].filter(
        (address) => selectedBand(context.view, address) !== null,
      );
      if (bands.length === 0) return false;
      const [address] = bands;
      if (bands.length === 1 && address !== undefined && context.rules.bands) {
        const direction: BandDirection = event.key === "ArrowUp" ? "up" : "down";
        const step = bandStepCommand(
          context.view,
          address,
          direction,
          context.editing,
          context.metrics,
        );
        if (step !== null) context.dispatch(step);
      }
      return true;
    },
  },
  {
    // Raising and lowering reorders blocks.
    match: (event) => command(event) && Object.hasOwn(Z_ORDER, event.code),
    run(context, event) {
      const actions = Z_ORDER[event.code];
      if (actions === undefined || !context.rules.order) return false;
      const raised = zOrderCommand(
        context.view,
        selectedBlocks(context),
        actions[event.shiftKey ? 1 : 0],
      );
      if (raised !== null) context.dispatch(raised);
      return true;
    },
  },
  {
    // The arrows nudge the selected blocks where the level nudges: on the arranger.
    match: (event) => plain(event) && Object.hasOwn(ARROWS, event.key),
    run(context, event) {
      const ids = selectedBlocks(context);
      const arrow = ARROWS[event.key];
      if (ids.length === 0 || arrow === undefined || !context.rules.nudge) return false;
      const step = event.shiftKey ? LARGE_STEP : 1;
      const [dx, dy] = arrow;
      const nudged = nudgeCommand(context.view, ids, dx * step, dy * step, context.metrics);
      if (nudged !== null) context.dispatch(nudged);
      return true;
    },
  },
  {
    // A locked or read-only canvas offers no resize, so its mode is not chosen either.
    match: (event) => plain(event) && Object.hasOwn(MODE_KEYS, event.key),
    run(context, event) {
      const chosen = MODE_KEYS[event.key];
      if (chosen === undefined || !context.rules.resize) return false;
      context.setMode(chosen);
      return true;
    },
  },
  {
    match: (event) => plain(event) && (event.key === "Delete" || event.key === "Backspace"),
    run(context) {
      if (context.selection.size === 0 || !context.rules.remove) return false;
      const removed = removeCommand(context.view, context.selection, context.editing);
      if ("refused" in removed) context.refuse(removed.refused);
      else if (context.dispatch(removed)) context.select(new Set());
      return true;
    },
  },
  {
    // Enter opens the editor of the single selected box or timeline; else, like Space, it
    // selects the focused block as a click on its background would.
    match: (event) => plain(event) && (event.key === "Enter" || event.key === " "),
    run(context, event) {
      const target = event.key === "Enter" && context.rules.open ? context.openable() : null;
      if (target !== null) {
        context.open(target);
        return true;
      }
      const next = context.pressed();
      if (next === null) return false;
      context.select(next);
      return true;
    },
  },
  {
    match: (event) => plain(event) && (event.key === "+" || event.key === "-" || event.key === "0"),
    run(context, event) {
      if (event.key === "+") context.zoomIn();
      else if (event.key === "-") context.zoomOut();
      else if (Object.keys(context.view.blocks).length > 0) context.fit();
      return true;
    },
  },
  {
    match: (event) => plain(event) && (event.key === "l" || event.key === "L"),
    run(context) {
      if (!context.rules.lock) return false;
      context.toggleLock();
      return true;
    },
  },
  {
    // Escape first ends a gesture in progress, then clears the selection, then closes the
    // innermost editor.
    match: (event) => plain(event) && event.key === "Escape",
    run(context) {
      if (context.abortGesture()) return true;
      if (context.selection.size > 0) context.select(new Set());
      else if (context.editors > 0) context.done();
      return true;
    },
  },
];

/** Run the row a key matches; `false` when the key means nothing on the canvas. */
export function handleKey(context: KeyContext, event: KeyboardEvent): boolean {
  if (event.altKey) return false;
  return KEYS.find((row) => row.match(event))?.run(context, event) ?? false;
}

/** Whether `target` takes typed text: a text field, a list box or an editable element. */
export function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/** Whether `target` lies in `root` (or is it). */
export function within(root: Element | undefined, target: EventTarget | null): boolean {
  return root !== undefined && target instanceof Node && root.contains(target);
}

/** Whether arrows, Home and End belong to a toolbar the target lies in, moving between its buttons. */
export function inToolbar(event: KeyboardEvent): boolean {
  if (!(event.target instanceof Element) || event.target.closest('[role="toolbar"]') === null) {
    return false;
  }
  return event.key.startsWith("Arrow") || event.key === "Home" || event.key === "End";
}
