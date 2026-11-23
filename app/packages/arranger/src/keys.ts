/**
 * The canvas's keys: one table of rows, each a match and what it does, read
 * in order; the first row that matches a key decides it. Every row asks the
 * canvas's rules (`rulesOf`) whether it may run, and nothing else.
 */

import type { Address, Command, Granularity, View } from "@timetoalign/tilie-core";
import {
  holdingOf,
  isCommandError,
  isElementAddress,
  resolveAddress,
} from "@timetoalign/tilie-core";
import type { FontMetrics } from "@timetoalign/timetoshare";
import type { BandDirection } from "./bands.ts";
import { bandStepCommand } from "./bands.ts";
import { nudgeCommand, removeCommand, type ZOrderAction, zOrderCommand } from "./commands.ts";
import type { Arranged, LevelRules } from "./containers.ts";
import { drawingOf } from "./drawing.ts";
import type { Editing } from "./editing.ts";
import { addressParts } from "./editing.ts";
import type { GapEdge, GapModes } from "./gaps.ts";
import { gapCommand, gapStep, isDefaultGap, isGap, piecesOf, subjectOf } from "./gaps.ts";
import type { PaneSource } from "./pane.ts";
import { blocksInOrder } from "./project.ts";
import {
  blockIndexCommand,
  itemArrangementCommand,
  rowRefusal,
  shownItemOrder,
  steppedOrder,
} from "./reorder.ts";
import type { ResizeMode } from "./resize.ts";
import type { Selection } from "./selection.ts";
import { NOTHING_SELECTED, selectedBand, selectionOf } from "./selection.ts";

/**
 * Whether `address` names cards that are ancestor cards alone (`docs/drawing.md` in TimeToShare,
 * section 8.8): the card address of a root drawn in no card of its own.
 */
function namesAncestorCards(view: View, address: Address): boolean {
  const resolved = resolveAddress(view, address);
  return (
    !isCommandError(resolved) &&
    resolved.kind === "card" &&
    resolved.cards.every((card) => holdingOf(card) === "ancestor")
  );
}

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
  /** The pane the canvas's drawings are fitted to (`Pane.view`). */
  readonly pane: PaneSource | undefined;
  /** How finely a key moving an elision's edge picks its value: the canvas's granularity. */
  readonly granularity: Granularity;
  /** What a selected elision's handles and arrows change (the gap mode menu's toggles). */
  readonly gapModes: GapModes;
  /** Presses or releases one of the gap modes; releasing the last pressed one does nothing. */
  toggleGapMode(mode: keyof GapModes): void;
  /** The edge of a selected elision the arrows move: `[` chooses the start, `]` the end. */
  readonly gapEdge: GapEdge;
  chooseGapEdge(edge: GapEdge): void;
  /** How many editors are open: Escape closes the innermost. */
  readonly editors: number;
  select(next: Selection): void;
  /** Runs a command; whether the store accepted it (a refusal is shown). */
  dispatch(command: Command): boolean;
  /** Shows a refusal that no command produced. */
  refuse(message: string): void;
  setMode(mode: ResizeMode): void;
  toggleLock(): void;
  /** Turns "Show coordinates" on or off. */
  toggleCoordinates(): void;
  /** Turns "Show matches" on or off. */
  toggleMatches(): void;
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

/** The keys of the gap mode menu, read on a selected elision before the resize modes. */
const GAP_MODE_KEYS: { readonly [key: string]: keyof GapModes } = { 1: "coordinates", 2: "width" };

/** The keys choosing a selected elision's edge, by the character typed (`event.key`). */
const GAP_EDGE_KEYS: { readonly [key: string]: GapEdge } = { "[": "start", "]": "end" };

const Z_ORDER: { readonly [code: string]: readonly [ZOrderAction, ZOrderAction] } = {
  BracketRight: ["forward", "front"],
  BracketLeft: ["backward", "back"],
};

const command = (event: KeyboardEvent) => event.ctrlKey || event.metaKey;
const plain = (event: KeyboardEvent) => !command(event);

/** The ids of the selected blocks, without element addresses. */
function selectedBlocks({ view, selection }: KeyContext): string[] {
  return [...selection.values()].flatMap((address) =>
    address.block !== undefined &&
    !isElementAddress(address) &&
    Object.hasOwn(view.blocks, address.block)
      ? [address.block]
      : [],
  );
}

/** The one selected address, when it is an elision's gap, with its block's drawing. */
function selectedGap(context: KeyContext) {
  if (context.selection.size !== 1) return null;
  const [address] = context.selection.values();
  if (address === undefined) return null;
  const { block: id, element } = addressParts(address);
  const block = context.view.blocks[id];
  if (block === undefined || element === null || !isGap(block.manifest, element)) return null;
  const drawing = drawingOf(
    block,
    context.view.graphical,
    context.metrics,
    undefined,
    context.pane,
  );
  return { block, drawing, element };
}

/**
 * Left or Right on the one selected stored elision: its chosen edge (`[`
 * the start, `]` the end; the other where its pieces show only that one)
 * moves one grid step under the canvas's gap modes (`gapStep`), one `set`.
 * `null` when no elision is selected; a default or carried gap takes the
 * key and changes nothing.
 */
function gapArrow(context: KeyContext, event: KeyboardEvent): boolean | null {
  const gap = selectedGap(context);
  if (gap === null) return null;
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return true;
  if (!context.rules.resize) return true;
  const { block, drawing, element } = gap;
  const { manifest } = block;
  const subjects = piecesOf(drawing, element).flatMap((piece) => {
    const subject = subjectOf(manifest, drawing, piece);
    return subject === null || subject.edges.length === 0 ? [] : [subject];
  });
  const chosen = context.gapEdge;
  const subject = subjects.find(({ edges }) => edges.includes(chosen)) ?? subjects[0];
  const edge = subject?.edges.includes(chosen) ? chosen : subject?.edges[0];
  if (subject === undefined || edge === undefined) return true;
  const direction = event.key === "ArrowLeft" ? -1 : 1;
  const step = context.view.settings.grid.size;
  const gapContext = { block: block.id, manifest, drawing, granularity: context.granularity };
  const change = gapStep(gapContext, subject, edge, direction, step, context.gapModes);
  const command = change === null ? null : gapCommand(context.view, block.id, subject, change);
  if (command !== null) context.dispatch(command);
  return true;
}

/**
 * How many places an arrow moves a content of an arrangement: along it,
 * Up and Down one place in a column, Left and Right in a row, and in a
 * matrix Left and Right one place in its row, Up and Down one row (the
 * number of columns); 0 for an arrow across a column or a row.
 */
export function arrangedStep(arranged: Arranged, key: string): number {
  const back = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
  const vertical = key === "ArrowUp" || key === "ArrowDown";
  switch (arranged.direction) {
    case "vertical":
      return vertical ? back : 0;
    case "horizontal":
      return vertical ? 0 : back;
    case "matrix":
      return vertical ? back * arranged.columns : back;
  }
}

/**
 * The item of the edited block the one selected address names (a group's
 * frame, an ungrouped root or its card), with its block; `null` otherwise.
 */
function selectedItem(context: KeyContext) {
  if (context.selection.size !== 1 || context.editing === null) return null;
  const [address] = context.selection.values();
  if (address === undefined) return null;
  const { block: id, element } = addressParts(address);
  const block = context.view.blocks[id];
  if (block === undefined || element === null || element.id === undefined) return null;
  if (element.facet !== undefined) return null;
  if (element.part !== undefined && (element.part.length !== 1 || element.part[0] !== "card")) {
    return null;
  }
  return shownItemOrder(block).includes(element.id) ? { block, item: element.id } : null;
}

/**
 * An arrow on an arranged level (`rules.arranged`): the one selected block on
 * the arranger, or the one selected item in the bundle editor, moves
 * `arrangedStep` places along the arrangement, one `set` (a block's new
 * `index`, a block's arrangement's order); nothing beyond the first or the
 * last place. Side by side, an order the stretches refuse (`rowRefusal`)
 * is refused with its reason. `null` where the level is not arranged or
 * nothing it arranges is selected.
 */
function arrangedArrow(context: KeyContext, event: KeyboardEvent): boolean | null {
  const { arranged } = context.rules;
  if (arranged === undefined) return null;
  const step = arrangedStep(arranged, event.key);
  if (context.editing === null) {
    const ids = selectedBlocks(context);
    const [id] = ids;
    if (id === undefined) return null;
    if (ids.length > 1) return true;
    const order = blocksInOrder(context.view).map((block) => block.id);
    const next = steppedOrder(order, id, step);
    const moved = next === null ? null : blockIndexCommand(context.view, next, id);
    if (moved !== null) context.dispatch(moved);
    return true;
  }
  const selected = selectedItem(context);
  if (selected === null) return null;
  const { block, item } = selected;
  const next = steppedOrder(shownItemOrder(block), item, step);
  const direction = block.arrangement?.direction;
  if (next === null || direction === undefined) return true;
  const refused = direction === "horizontal" ? rowRefusal(block.manifest, next, item) : null;
  if (refused !== null) {
    context.refuse(refused);
    return true;
  }
  const moved = itemArrangementCommand(block, { direction, order: next });
  if (moved !== null) context.dispatch(moved);
  return true;
}

/**
 * Delete on default gaps (`{id: T, part: ["elision"]}`): an automatic
 * elision is never deleted on its own, its root's Custom mode edits them;
 * refused. `null` when the selection holds none.
 */
function deleteDefaultGaps(context: KeyContext): boolean | null {
  const defaults = [...context.selection.values()].filter((address) => {
    const { element } = addressParts(address);
    return element !== null && isDefaultGap(element);
  });
  if (defaults.length === 0) return null;
  context.refuse("Automatic elisions are not deleted one by one: choose Custom to edit them.");
  return true;
}

/** The key table, in the order the rows are read. */
export const KEYS: readonly KeyRow[] = [
  {
    // Ctrl/Cmd+Up/Down is the band's whenever a band is selected: it steps exactly one.
    match: (event) => command(event) && (event.key === "ArrowUp" || event.key === "ArrowDown"),
    run(context, event) {
      const bands = [...context.selection.values()].filter(
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
          context.pane,
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
    // The arrows nudge the selected blocks where the level nudges: on the arranger. On the one
    // selected elision, Left and Right move its chosen edge under the gap modes; on an arranged
    // level they move the selected block or item to another place of the arrangement.
    match: (event) => plain(event) && Object.hasOwn(ARROWS, event.key),
    run(context, event) {
      const moved = gapArrow(context, event) ?? arrangedArrow(context, event);
      if (moved !== null) return moved;
      const ids = selectedBlocks(context);
      const arrow = ARROWS[event.key];
      if (ids.length === 0 || arrow === undefined || !context.rules.nudge) return false;
      const step = event.shiftKey ? LARGE_STEP : 1;
      const [dx, dy] = arrow;
      const nudged = nudgeCommand(
        context.view,
        ids,
        dx * step,
        dy * step,
        context.metrics,
        context.pane,
      );
      if (nudged !== null) context.dispatch(nudged);
      return true;
    },
  },
  {
    // A locked or read-only canvas offers no resize, so its mode is not chosen either. On a
    // selected elision `1` and `2` press or release the gap modes Coordinates and Width instead.
    match: (event) => plain(event) && Object.hasOwn(MODE_KEYS, event.key),
    run(context, event) {
      const gapMode = GAP_MODE_KEYS[event.key];
      if (selectedGap(context) !== null) {
        if (gapMode === undefined) return true;
        if (context.rules.resize) context.toggleGapMode(gapMode);
        return true;
      }
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
      const defaults = deleteDefaultGaps(context);
      if (defaults !== null) return defaults;
      // An ancestor card stands for no element of its own: Delete leaves it, and its root, alone.
      const selection = selectionOf(
        [...context.selection.values()].filter(
          (address) => !namesAncestorCards(context.view, address),
        ),
      );
      if (selection.size === 0) return true;
      const removed = removeCommand(context.view, selection, context.editing);
      if ("refused" in removed) context.refuse(removed.refused);
      else if (context.dispatch(removed)) context.select(NOTHING_SELECTED);
      return true;
    },
  },
  {
    // `[` and `]` (the characters typed, whatever the layout) choose the edge of a selected
    // elision the arrows move: the start and the end.
    match: (event) => plain(event) && Object.hasOwn(GAP_EDGE_KEYS, event.key),
    run(context, event) {
      const edge = GAP_EDGE_KEYS[event.key];
      if (edge === undefined || selectedGap(context) === null) return false;
      context.chooseGapEdge(edge);
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
    // "Show coordinates" is the viewer's own, on any canvas, read-only included.
    match: (event) => plain(event) && (event.key === "c" || event.key === "C"),
    run(context) {
      context.toggleCoordinates();
      return true;
    },
  },
  {
    // "Show matches" is the viewer's own too, on any canvas; it and "Show coordinates" take turns.
    match: (event) => plain(event) && (event.key === "m" || event.key === "M"),
    run(context) {
      context.toggleMatches();
      return true;
    },
  },
  {
    // Escape first ends a gesture in progress, then clears the selection, then closes the
    // innermost editor.
    match: (event) => plain(event) && event.key === "Escape",
    run(context) {
      if (context.abortGesture()) return true;
      if (context.selection.size > 0) context.select(NOTHING_SELECTED);
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
