/** Gestures as commands: every completed gesture is one `set` or one `remove`. */

import type {
  AddCommand,
  Block,
  BlockId,
  Change,
  Manifest,
  RemoveCommand,
  SetCommand,
  StyleCommand,
  View,
} from "@timetoalign/tilie-core";
import {
  type Address,
  addressKey,
  addressWords,
  assertNever,
  canonicalText,
  FACETS,
  idAddress,
  inBlock,
  indicesBetween,
  isCommandError,
  preview,
  removedBy,
  resolveAddress,
  sameAddress,
  TITLE_ADDRESS,
  WORKSPACE,
} from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import type { FontMetrics, Selector } from "@timetoalign/timetoshare";
import { drawingOf, nodePosition } from "./drawing.ts";
import { addressParts, type Editing } from "./editing.ts";
import { GRID_FREE, positionStep, quantize, sameSequence } from "./numbers.ts";
import type { PaneSource } from "./pane.ts";
import { blocksInOrder } from "./project.ts";
import { type Selection, selectedBand } from "./selection.ts";

/** A block's node position after a gesture, before quantization. */
export interface Move {
  readonly id: BlockId;
  readonly x: number;
  readonly y: number;
}

const NO_ORIGIN = { x: 0, y: 0 } as const;

function setOf(changes: readonly Change[]): SetCommand | null {
  return changes.length === 0 ? null : { type: "set", changes };
}

/**
 * One `set` of `{x, y}` per block: each node position quantized to `step`,
 * then turned into the position of the block's place origin (`nodePosition`
 * inverted) quantized to `GRID_FREE`, leaving out a block whose position is
 * its stored one.
 */
function placing(
  view: View,
  moves: readonly Move[],
  step: number,
  metrics: FontMetrics,
  pane: PaneSource | undefined,
): SetCommand | null {
  const changes: Change[] = [];
  for (const move of moves) {
    const block = view.blocks[move.id];
    const origin =
      block === undefined
        ? NO_ORIGIN
        : drawingOf(block, view.graphical, metrics, undefined, pane).origin;
    const scale = block?.scale ?? 1;
    const x = quantize(quantize(move.x, step) + origin.x * scale, GRID_FREE);
    const y = quantize(quantize(move.y, step) + origin.y * scale, GRID_FREE);
    if (block !== undefined && block.x === x && block.y === y) continue;
    changes.push({ target: { block: move.id }, values: { x, y } });
  }
  return setOf(changes);
}

/**
 * One `set` placing every moved block where its node is dropped, `moves`
 * holding node positions (the block's top-left corner, `nodePosition`): each
 * quantized to `GRID_FREE` and stored as the position of the block's place
 * origin, in the order of `moves`; a block whose stored position does not
 * change is left out, and `null` is returned when nothing is left. Snapping
 * is `snap`'s job: the caller passes the dragged node's snapped position,
 * and the other nodes of the drag moved by the same delta.
 */
export function moveCommand(
  view: View,
  moves: readonly Move[],
  metrics: FontMetrics,
  pane?: PaneSource,
): SetCommand | null {
  return placing(view, moves, GRID_FREE, metrics, pane);
}

/**
 * One `set` moving the blocks `ids` by `dx`, `dy` grid steps: each node's
 * position moved and quantized to the grid when it snaps, otherwise to
 * `GRID_FREE`, then stored as the position of its place origin. `null` when
 * nothing moves.
 */
export function nudgeCommand(
  view: View,
  ids: readonly BlockId[],
  dx: number,
  dy: number,
  metrics: FontMetrics,
  pane?: PaneSource,
): SetCommand | null {
  if (dx === 0 && dy === 0) return null;
  const { grid } = view.settings;
  const moves: Move[] = [];
  for (const id of ids) {
    const block = view.blocks[id];
    if (block === undefined) continue;
    const node = nodePosition(block, drawingOf(block, view.graphical, metrics, undefined, pane));
    moves.push({ id, x: node.x + dx * grid.size, y: node.y + dy * grid.size });
  }
  return placing(view, moves, positionStep(grid), metrics, pane);
}

/** The visible part of the canvas: Svelte Flow's transform and the pane's size in screen pixels. */
export interface Visible {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
  readonly width: number;
  readonly height: number;
}

/** A node's rectangle on the canvas. */
interface NodeRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** The node rectangle of `block` drawn as `drawing`: its drawing's size times its scale, from its node position. */
function nodeRect(block: Pick<Block, "x" | "y" | "scale">, drawing: Drawing): NodeRect {
  const { x, y } = nodePosition(block, drawing);
  return {
    left: x,
    top: y,
    right: x + drawing.width * block.scale,
    bottom: y + drawing.height * block.scale,
  };
}

/** Whether the interiors of two rectangles intersect; edges that only touch do not. */
function overlaps(a: NodeRect, b: NodeRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** `rect` grown by `margin` on every side. */
function grown(rect: NodeRect, margin: number): NodeRect {
  return {
    left: rect.left - margin,
    top: rect.top - margin,
    right: rect.right + margin,
    bottom: rect.bottom + margin,
  };
}

/**
 * One `add` of a new block `id` holding `manifest`, its top-left at the
 * centre of what `visible` shows, quantized as a move under the view's grid
 * is, then moved right past every block it would overlap: while its node
 * rectangle (its drawing at the workspace's block defaults) meets a root
 * block's grown by the grid size on every side, its node moves to the right
 * edge of the rightmost such block plus the grid size, its `x` rounded up
 * to the position step. Its `y` never changes; its other placement members
 * are the workspace's block defaults.
 */
export function addCommand(
  view: View,
  id: BlockId,
  manifest: Manifest,
  visible: Visible,
  metrics: FontMetrics,
  pane?: PaneSource,
): AddCommand {
  const { grid } = view.settings;
  const step = positionStep(grid);
  let x = quantize((visible.width / 2 - visible.x) / visible.zoom, step);
  const y = quantize((visible.height / 2 - visible.y) / visible.zoom, step);
  const command = (): AddCommand => ({
    type: "add",
    into: WORKSPACE,
    block: { id, manifest, x, y },
  });
  const added = preview(view, command());
  const block = isCommandError(added) ? undefined : added.blocks[id];
  // A manifest core refuses is refused by the dispatch too; where it would lie does not matter.
  if (block === undefined) return command();
  const drawing = drawingOf(block, view.graphical, metrics, undefined, pane);
  let others = Object.values(view.blocks)
    .filter((other) => other.parent === null)
    .map((other) =>
      grown(nodeRect(other, drawingOf(other, view.graphical, metrics, undefined, pane)), grid.size),
    );
  for (;;) {
    const rect = nodeRect({ x, y, scale: block.scale }, drawing);
    const met = others.filter((other) => overlaps(rect, other));
    if (met.length === 0) return command();
    // The grown right edge is the block's right edge plus the grid size.
    const right = Math.max(...met.map((other) => other.right));
    x = Math.ceil((right + drawing.origin.x * block.scale) / step) * step + 0;
    // Every block met lies left of the new place, so each is passed once and the search ends.
    others = others.filter((other) => !met.includes(other));
  }
}

/** A change of stacking order: to the front or back, or one step forward or backward. */
export type ZOrderAction = "front" | "back" | "forward" | "backward";

/** The ids of one sibling list after `action` on its members in `chosen`. */
function reordered(
  order: readonly BlockId[],
  chosen: ReadonlySet<BlockId>,
  action: ZOrderAction,
): BlockId[] {
  const picked = order.filter((id) => chosen.has(id));
  const rest = order.filter((id) => !chosen.has(id));
  switch (action) {
    case "front":
      return [...rest, ...picked];
    case "back":
      return [...picked, ...rest];
    case "forward":
      // From the top down, each chosen block passes the unchosen one above it.
      return passed([...order].reverse(), chosen).reverse();
    case "backward":
      return passed(order, chosen);
  }
}

/** `order` with every chosen id swapped with the unchosen one before it, from the start on. */
function passed(order: readonly BlockId[], chosen: ReadonlySet<BlockId>): BlockId[] {
  const next = [...order];
  for (let index = 1; index < next.length; index += 1) {
    const here = next[index];
    const before = next[index - 1];
    if (here === undefined || before === undefined) continue;
    if (chosen.has(here) && !chosen.has(before)) {
      next[index] = before;
      next[index - 1] = here;
    }
  }
  return next;
}

/**
 * One `set` of `index` raising or lowering the blocks `ids` among their
 * siblings: to the front or back, or one step past their unchosen
 * neighbour. Only the chosen blocks get new fractional indices, each run of
 * them between its unchosen neighbours and below every index a chosen block
 * holds there. `null` when the order is unchanged.
 */
export function zOrderCommand(
  view: View,
  ids: readonly BlockId[],
  action: ZOrderAction,
): SetCommand | null {
  const chosen = new Set(ids.filter((id) => view.blocks[id] !== undefined));
  const families = new Map<string, Block[]>();
  for (const block of blocksInOrder(view)) {
    const key = block.parent ?? "";
    families.set(key, [...(families.get(key) ?? []), block]);
  }
  const changes: Change[] = [];
  for (const family of families.values()) {
    const order = family.map((block) => block.id);
    const target = reordered(order, chosen, action);
    if (sameSequence(target, order)) continue;
    const indexOf = new Map(family.map((block) => [block.id, block.index]));
    const held = family.filter((block) => chosen.has(block.id)).map((block) => block.index);
    let run: BlockId[] = [];
    let lower: string | null = null;
    const place = (above: string | null) => {
      let upper = above;
      // A `set` applies its changes in turn, so no new index may equal an index a
      // chosen block still holds: the run fills the gap below the first of them.
      for (const index of held) {
        if ((lower === null || index > lower) && (upper === null || index < upper)) upper = index;
      }
      const indices = indicesBetween(lower, upper, run.length);
      for (const [offset, index] of indices.entries()) {
        const id = run[offset];
        if (id !== undefined) changes.push({ target: { block: id }, values: { index } });
      }
      run = [];
    };
    for (const id of target) {
      if (chosen.has(id)) {
        run.push(id);
        continue;
      }
      const index = indexOf.get(id) ?? null;
      if (run.length > 0) place(index);
      lower = index;
    }
    if (run.length > 0) place(null);
  }
  return setOf(changes);
}

/** What Delete does with one selected address of `view`, read through core's `resolveAddress`. */
type Deleted =
  | { readonly kind: "flow_control" }
  | { readonly kind: "chunk" }
  | { readonly kind: "hide"; readonly target: Address }
  | { readonly kind: "framed" }
  | { readonly kind: "owner" };

function deletedAs(view: View, block: BlockId, address: Address, owner: Address): Deleted {
  let resolved = resolveAddress(view, address);
  if (!isCommandError(resolved)) {
    // A part (a chunk's label, leader or start) stands for what it is a part of.
    while (resolved.kind === "part") resolved = resolved.owner;
    if (resolved.kind === "chunk" || resolved.kind === "chunk_band") return { kind: "chunk" };
    if (resolved.kind === "virtual_card") {
      const placed = view.blocks[block]?.places[resolved.virtual.id] !== undefined;
      return placed ? { kind: "hide", target: owner } : { kind: "framed" };
    }
  }
  // Read through the owner, so an address core cannot resolve never hands a flow-control element to core.
  const flow = resolveAddress(view, owner);
  return !isCommandError(flow) && flow.kind === "entry" && flow.entry === "flow_control"
    ? { kind: "flow_control" }
    : { kind: "owner" };
}

/** The hints of Delete for a selection naming nothing it deletes. */
const DELETE_HINTS = {
  flow_control: "A flow-control element is not deleted: reject it with a belief in Properties.",
  chunk:
    "A chunk is changed in its FlowMap; open the flow-control editor of its root to change it.",
  framed:
    "A virtual card in a frame is not hidden; delete its virtual timeline in the Properties tab.",
  mixed:
    "Virtual cards are hidden apart from what is deleted; select the virtual cards alone to hide them.",
} as const;

/**
 * The `set` hiding the cards of the virtual timelines `targets` (each
 * `{block, id: V}`, its card held by its block): every member of each one's
 * stated place unstated, the virtual timeline kept. Only a virtual
 * timeline's card is hidden so: a root's card is drawn whether its place is
 * stated or not, so a rule hides it (`rootDisplayCommand`), and a member's
 * card in its frame has no place of its own.
 */
export function hideCommand(view: View, targets: readonly Address[]): SetCommand {
  const changes = targets.map((target) => {
    const { block, element } = addressParts(target);
    const place = element?.id === undefined ? undefined : view.blocks[block]?.places[element.id];
    const members = Object.keys(place ?? {}).map((member) => [member, null] as const);
    return { target, values: { place: Object.fromEntries(members) } };
  });
  return { type: "set", changes };
}

/**
 * The selector of the one rule hiding the root timeline `root`: its card
 * address (every card of `root`, its ancestor cards behind frames
 * included), its own address (its line and its ancestor lines) and the
 * address of each of its five bands. A card that is not displayed keeps
 * everything drawn in it, so the card alone would hide only its box
 * (TimeToShare's `docs/drawing.md`, section 2.4); the line that is not
 * displayed hides the timeline's whole drawing, and the bands are named
 * too, so the rule states every container of the root.
 */
function rootSelector(root: string): Selector {
  return {
    addresses: [
      { id: root, part: ["card"] },
      { id: root },
      ...FACETS.map((facet) => ({ id: root, facet })),
    ],
  };
}

/**
 * The `style` hiding the root timeline `root` of the block `block`
 * (`display: none` on `rootSelector`'s addresses), or, with `hidden`
 * false, removing that rule, so the root is drawn again. Its card keeps
 * its place while hidden (section 8.4); a member of a group lying inside
 * the root is drawn by its frame and stays, without the root's ancestor
 * line, and the ancestor cards of the root behind frames are not drawn.
 */
export function rootDisplayCommand(block: BlockId, root: string, hidden: boolean): StyleCommand {
  return {
    type: "style",
    select: rootSelector(root),
    set: { display: hidden ? "none" : null },
    blocks: [block],
  };
}

/** Whether `manifest`'s own rules hide the root `root` with `rootDisplayCommand`'s rule. */
export function rootHidden(manifest: Manifest, root: string): boolean {
  const key = canonicalText(rootSelector(root));
  return (manifest.graphical?.rules ?? []).some(
    (rule) =>
      canonicalText(rule.select) === key &&
      typeof rule.set !== "string" &&
      rule.set.display === "none",
  );
}

/**
 * What Delete stores for the selected addresses: one `remove`, an
 * element's part or card standing for the element whose ID it carries, or
 * one `set` hiding the selected virtual cards. Every element can be
 * removed, timelines and groups included; a selection holding a manifest's
 * title, which goes only with its block, is refused whole, with a hint
 * naming the block. A band is never removed: its address is left out, and a
 * selection of bands alone is refused with a hint. Nor is a flow-control
 * element, which is rejected through its provenance and never deleted, nor
 * a chunk of a virtual timeline or of a switched card, which is changed in
 * its FlowMap: their addresses, or those of their parts, are left out, and
 * a selection that names nothing else is refused with a hint. A selected
 * virtual card held by its block is hidden: its place is unstated (core's
 * `set` of `place` with every stated member null) and its virtual timeline
 * kept, which only a `remove` of the virtual timeline's own address
 * deletes (the Properties tab's "Delete virtual timeline"); a virtual card
 * in a frame is left out with a hint, and a selection hiding virtual cards
 * and deleting anything else is refused with a hint. Whether a segment may
 * go is core's to decide: one that would leave a gap in its segment line is
 * refused there (`segment_not_removable`), and the canvas shows that
 * refusal as it shows every refusal of the store. Inside an editor the
 * edited element is never removed, a part of it standing for it as well:
 * it is left out of the targets, and a selection that names nothing else
 * is refused with a hint to close the editor first. A `remove` that also
 * takes along virtual timelines made from what it names is asked about
 * before it is stored (`deleteQuestion`).
 */
export function removeCommand(
  view: View,
  selection: Selection,
  editing: Editing | null,
): RemoveCommand | SetCommand | { readonly refused: string } {
  if (selection.size === 0) return { refused: "Nothing is selected." };
  const addresses = [...selection.values()].filter(
    (address) => selectedBand(view, address) === null,
  );
  if (addresses.length === 0) {
    return { refused: "A band is not deleted; select its elements to delete them." };
  }
  const targets = new Map<string, Address>();
  const hidden = new Map<string, Address>();
  const add = (target: Address) => targets.set(addressKey(target), target);
  let left: keyof typeof DELETE_HINTS | null = null;
  for (const address of addresses) {
    const { block: id, element } = addressParts(address);
    const block = view.blocks[id];
    if (block === undefined || element === null) {
      add(address);
      continue;
    }
    if (element.id === undefined) {
      const title = addressWords(view, inBlock(block.id, TITLE_ADDRESS));
      return {
        refused: `${title.charAt(0).toUpperCase()}${title.slice(1)} is removed only with its block; select the block to delete it.`,
      };
    }
    const owner = inBlock(block.id, idAddress(element.id));
    const deleted = deletedAs(view, block.id, address, owner);
    switch (deleted.kind) {
      case "owner":
        add(owner);
        break;
      case "hide":
        hidden.set(addressKey(deleted.target), deleted.target);
        break;
      case "flow_control":
      case "chunk":
      case "framed":
        left ??= deleted.kind;
        break;
      default:
        return assertNever(deleted);
    }
  }
  const removed = [...targets.values()].filter(
    (target) => editing === null || !sameAddress(target, editing.target),
  );
  if (hidden.size > 0) {
    return removed.length > 0
      ? { refused: DELETE_HINTS.mixed }
      : hideCommand(view, [...hidden.values()]);
  }
  if (targets.size === 0 && left !== null) return { refused: DELETE_HINTS[left] };
  if (removed.length === 0) return { refused: "Close its editor to delete the edited element." };
  return { type: "remove", targets: removed };
}

/**
 * What a deletion asks first: it also deletes virtual timelines made from
 * what it names, and the user chooses between deleting them all and
 * hiding instead, or, where core would refuse to delete them all, learns
 * why and may only hide instead.
 */
export interface DeleteQuestion {
  /**
   * The question: what is deleted, and every virtual timeline it takes
   * along, each by its kind and its name, else its ID (`addressWords`);
   * where core refuses "Delete all", that they cannot all be deleted and
   * core's reason.
   */
  readonly question: string;
  /**
   * "Delete all": the `remove` naming those virtual timelines as well;
   * `null` where core refuses it, so it is not offered.
   */
  readonly remove: RemoveCommand | null;
  /**
   * "Hide instead", which removes nothing: the `set` hiding the cards of
   * the targets where every one is a virtual timeline whose card its block
   * holds (`hideCommand`), the `style` hiding the one target where it is a
   * root timeline (`rootDisplayCommand`); else `null`.
   */
  readonly hide: SetCommand | StyleCommand | null;
}

/**
 * The command hiding instead of deleting `targets` (`DeleteQuestion.hide`):
 * `hideCommand` where every target is a virtual timeline whose card its
 * block holds, `rootDisplayCommand` where the one target is a root
 * timeline; else `null`.
 */
function hidingOf(view: View, targets: readonly Address[]): SetCommand | StyleCommand | null {
  const named = targets.map((target) => {
    if (target.block === undefined) return null;
    const { block, element } = addressParts(target);
    const held = view.blocks[block];
    const id = element?.id;
    return held === undefined || id === undefined ? null : { held, id };
  });
  const [only] = named;
  if (named.length === 1 && only?.held.manifest.timelines.some((root) => root.id === only.id)) {
    return rootDisplayCommand(only.held.id, only.id, true);
  }
  const placed = named.every(
    (item) =>
      item !== null &&
      item.held.places[item.id] !== undefined &&
      (item.held.manifest.virtual_timelines ?? []).some((virtual) => virtual.id === item.id),
  );
  return placed ? hideCommand(view, targets) : null;
}

/** `items` as a sentence lists them: `a`, `a and b`, `a, b and c`. */
function listed(items: readonly string[]): string {
  const last = items.at(-1) ?? "";
  return items.length < 2 ? last : `${items.slice(0, -1).join(", ")} and ${last}`;
}

/**
 * The question `command` asks before it is stored, where removing its
 * targets also removes virtual timelines it does not name (core's
 * `removedBy`: those made from a removed timeline or virtual timeline, or
 * through a removed FlowMap, at any depth); `null` where it removes none,
 * and for the virtual timelines of a block removed whole. Core refuses to
 * remove a virtual timeline another one left is made from, so "Delete all"
 * names each of them, after the targets, in each block's order of its
 * virtual timelines. That `remove` is previewed with core (`preview`),
 * never checked by a copy of its rules: where core refuses it (a FlowMap
 * left names one of them as a chunk), the question says so in core's
 * words and offers only hiding instead, where hiding is possible.
 */
export function deleteQuestion(view: View, command: RemoveCommand): DeleteQuestion | null {
  const whole = new Set<BlockId>();
  const named = new Map<BlockId, string[]>();
  for (const target of command.targets) {
    if (target.block === undefined) continue;
    const { block, element } = addressParts(target);
    if (element === null) whole.add(block);
    else if (element.id !== undefined) named.set(block, [...(named.get(block) ?? []), element.id]);
  }
  const taken: Address[] = [];
  for (const [id, ids] of named) {
    const block = view.blocks[id];
    if (block === undefined || whole.has(id)) continue;
    const removed = removedBy(block.manifest, ids);
    const asked = new Set(ids);
    for (const item of block.manifest.virtual_timelines ?? []) {
      if (removed.has(item.id) && !asked.has(item.id)) taken.push(inBlock(id, idAddress(item.id)));
    }
  }
  if (taken.length === 0) return null;
  const all: RemoveCommand = { type: "remove", targets: [...command.targets, ...taken] };
  const refusal = preview(view, all);
  const remove = isCommandError(refusal) ? null : all;
  const hide = hidingOf(view, command.targets);
  const subjects = command.targets.map((target) => addressWords(view, target));
  const pronoun = subjects.length === 1 ? "it" : "them";
  const cards = subjects.length === 1 ? "its card" : "their cards";
  const choice = isCommandError(refusal)
    ? ` They cannot all be deleted. ${refusal.message.charAt(0).toUpperCase()}${refusal.message.slice(1)}.${hide === null ? "" : ` Hide ${cards} instead?`}`
    : hide === null
      ? " Delete all?"
      : ` Delete all, or hide ${cards} instead?`;
  return {
    question: `Deleting ${listed(subjects)} also deletes what is made from ${pronoun}: ${listed(taken.map((target) => addressWords(view, target)))}.${choice}`,
    remove,
    hide,
  };
}
