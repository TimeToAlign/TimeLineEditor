/**
 * The arrangement of a bundle's items side by side (`docs/drawing.md` in
 * TimeToShare, "Drawn once"): its groups, ungrouped roots and placed virtual
 * timelines in one row, and every **shared root**, one that two or more
 * groups hang on, drawn once behind the row on a line, several roots side by
 * side on one line where they do not overlap along the row (the lines are
 * the layout's, which knows the widths).
 *
 * A group **hangs on** a root when one of its members lies inside that root
 * (a child, a grandchild, …; a member that is the root itself does not). Its
 * first such member in the group's display order is its **anchor** on that
 * root, and the stretch the anchor covers on the root's axis, from its start
 * (the offsets down to it summed) to its end as drawn (section 3.4: its
 * length, else the end the drawing gives a timeline of unknown length), is
 * its **stretch** there. An ungrouped root is an item that hangs on nothing.
 * A root that one group hangs on is no shared root: its ancestor card stays
 * behind that group's frame, and no rule binds it.
 *
 * The rules: along every shared root the stretches of the groups hanging on
 * it follow the row from left to right without overlapping (touching is
 * allowed), and in every group the anchors on shared roots lie in the same
 * top-to-bottom order as the lines of their roots. The row and the roots are
 * ordered when neither relation has a cycle; otherwise the arrangement is
 * refused, naming the groups and roots in conflict.
 */

import type { TimeUnit } from "@timetoalign/timetoshare";
import { prettyText, prettyUnit } from "../number/display.ts";
import type { Real } from "../number/real.ts";
import { compareReal, exactCoordinate } from "../number/real.ts";
import { cardStamps } from "./elements.ts";
import { compareByName, memberDrawings, ungroupedVirtuals } from "./files.ts";
import { displayOrder } from "./order.ts";
import type { Group, Manifest, TimelineManifest } from "./types.ts";

/** A group's anchor on a root: the member, and its stretch on the root's own axis. */
export interface Anchor {
  /** The ID of the group hanging on the root. */
  readonly group: string;
  /** The ID of the root. */
  readonly root: string;
  /** The ID of the group's first member in display order lying inside the root. */
  readonly member: string;
  /** Where the member starts on the root's axis: the offsets from the root down to it, summed. */
  readonly start: Real;
  /** Where the member ends as drawn on the root's axis (section 3.4). */
  readonly end: Real;
}

/** A bundle's items arranged side by side. */
export interface Row {
  /** The IDs of every item, left to right. */
  readonly row: readonly string[];
  /**
   * The IDs of the shared roots, each drawn once, in the order they take their lines: sorted by
   * `above`, starting from the place in the row of the first group hanging on each, roots of one
   * first group in name order.
   */
  readonly roots: readonly string[];
  /**
   * The pairs of shared roots that some group's anchors order, `[upper, lower]`: the upper root's
   * line lies above the lower's. Each pair once, in the order the groups give them.
   */
  readonly above: readonly (readonly [string, string])[];
  /**
   * Every anchor on a shared root, by its group's place in the row, then in the group's display
   * order.
   */
  readonly anchors: readonly Anchor[];
}

/** Why a bundle's items cannot stand side by side. */
export interface ArrangementConflict {
  /** The IDs of the groups in conflict. */
  readonly groups: readonly string[];
  /** The IDs of the roots they are in conflict on. */
  readonly roots: readonly string[];
  /** The conflict in words, every group and root by its name, else its ID. */
  readonly reason: string;
}

/** Whether a result of `rowOf` is a refusal. */
export function isArrangementConflict(
  value: Row | ArrangementConflict,
): value is ArrangementConflict {
  return "reason" in value;
}

/** `value`, which the caller knows is there; throws where it is not. */
function present<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`${what} is missing`);
  return value;
}

/** A group or timeline in a reason: its name, else its ID, in double quotes. */
const quoted = (element: Group | TimelineManifest): string => `"${element.name ?? element.id}"`;

/**
 * The IDs of a bundle's items in drawing order (sections 8.1 and 8.10): its
 * groups, its ungrouped roots, then its virtual timelines in no group, each
 * in name order (`compareByName`), a virtual timeline the item of its
 * block-held card, which the block draws where its `places` holds the ID
 * (core's `containersOf` lists those cards alike); a drawing passes over the
 * items it does not draw.
 */
function itemsOf(manifest: Manifest): readonly string[] {
  const drawn = memberDrawings(manifest);
  return [
    ...drawn.frames.map((frame) => frame.group.id),
    ...drawn.ungrouped.map((member) => member.timeline.id),
    ...ungroupedVirtuals(manifest).map((item) => item.id),
  ];
}

/**
 * The order of a bundle's items an arrangement's stored `order` gives: the
 * items it names, each at its first mention, then every item it leaves out
 * in drawing order. An ID naming no item is passed over.
 */
export function itemOrder(manifest: Manifest, order: readonly string[]): readonly string[] {
  const items = itemsOf(manifest);
  const known = new Set(items);
  const ordered = new Set(order.filter((id) => known.has(id)));
  return [...ordered, ...items.filter((id) => !ordered.has(id))];
}

const foundAnchors = new WeakMap<Manifest, readonly Anchor[]>();

/**
 * Every anchor of a bundle, memoised by manifest: per group in drawing order
 * (name order), per root in the order of the group's display order. A group
 * has at most one anchor on each root.
 */
export function anchorsOf(manifest: Manifest): readonly Anchor[] {
  const known = foundAnchors.get(manifest);
  if (known !== undefined) return known;
  // Each anchor is the first member of its group inside its root, which is
  // what aligns an ancestor card to its frame; the root's drawing gives the
  // member's start and drawn end on the root's axis.
  const anchors = memberDrawings(manifest).ancestorCards.map(({ group, member, root }): Anchor => {
    const line = cardStamps(manifest, root).timelines.find(
      (item) => !item.ancestor && item.timeline.id === member.timeline.id,
    );
    if (line === undefined || line.end === null) {
      throw new Error(`'${member.timeline.id}' has no end in the card of its root`);
    }
    return {
      group: group.id,
      root: root.timeline.id,
      member: member.timeline.id,
      start: line.start,
      end: line.end,
    };
  });
  foundAnchors.set(manifest, anchors);
  return anchors;
}

/** A directed edge of an order: `from` before `to`, because of `by`. */
interface Edge {
  readonly from: string;
  readonly to: string;
  readonly by: string;
}

/**
 * `nodes` ordered so that every edge's `from` precedes its `to`, of the
 * nodes free to go next always the first in `nodes`' order; else a cycle,
 * as its edges, starting at the first node of the cycle in `nodes`' order.
 * Nodes that only follow a cycle take no part in it.
 * Of several edges between two nodes, the first in `edges` names the reason.
 */
function sorted(
  nodes: readonly string[],
  edges: readonly Edge[],
): { readonly order: readonly string[] } | { readonly cycle: readonly Edge[] } {
  const rank = new Map(nodes.map((node, index) => [node, index]));
  const out = new Map<string, Edge[]>(nodes.map((node) => [node, []]));
  const into = new Map<string, Edge[]>(nodes.map((node) => [node, []]));
  const before = new Map<string, number>(nodes.map((node) => [node, 0]));
  for (const edge of edges) {
    const list = out.get(edge.from);
    if (list === undefined || list.some((item) => item.to === edge.to)) continue;
    list.push(edge);
    into.get(edge.to)?.push(edge);
    before.set(edge.to, (before.get(edge.to) ?? 0) + 1);
  }
  const order: string[] = [];
  const placed = new Set<string>();
  while (order.length < nodes.length) {
    const next = nodes.find((node) => !placed.has(node) && before.get(node) === 0);
    if (next === undefined) break;
    order.push(next);
    placed.add(next);
    for (const edge of out.get(next) ?? []) before.set(edge.to, (before.get(edge.to) ?? 0) - 1);
  }
  if (order.length === nodes.length) return { order };
  // Every node left has an edge from another node left, but a node only
  // following a cycle may have none to one: strip those, last first, so that
  // every node still left has an edge to another, then walk them until one
  // repeats.
  const left = new Set(nodes.filter((node) => !placed.has(node)));
  const after = new Map(
    [...left].map((node) => [
      node,
      (out.get(node) ?? []).filter((edge) => left.has(edge.to)).length,
    ]),
  );
  const ends = [...left].filter((node) => after.get(node) === 0);
  for (let end = ends.pop(); end !== undefined; end = ends.pop()) {
    left.delete(end);
    for (const edge of into.get(end) ?? []) {
      if (!left.has(edge.from)) continue;
      const count = (after.get(edge.from) ?? 0) - 1;
      after.set(edge.from, count);
      if (count === 0) ends.push(edge.from);
    }
  }
  const onward = (edge: Edge) => left.has(edge.to);
  const byRank = (a: Edge, b: Edge) => (rank.get(a.to) ?? 0) - (rank.get(b.to) ?? 0);
  const start = present(
    nodes.find((node) => left.has(node)),
    "a node on a cycle",
  );
  const walked: Edge[] = [];
  const seen = new Map<string, number>();
  let at = start;
  while (!seen.has(at)) {
    seen.set(at, walked.length);
    const edge = present(
      (out.get(at) ?? []).filter(onward).sort(byRank)[0],
      `an edge from '${at}'`,
    );
    walked.push(edge);
    at = edge.to;
  }
  const cycle = walked.slice(seen.get(at));
  // Start the cycle at its first node in `nodes`' order.
  const first = cycle.reduce(
    (best, edge, index) =>
      (rank.get(edge.from) ?? 0) < (rank.get(cycle[best]?.from ?? "") ?? 0) ? index : best,
    0,
  );
  return { cycle: [...cycle.slice(first), ...cycle.slice(0, first)] };
}

/** The text of the stretch `[start, end]` on the axis of `root`: `5–10 ♩`, seconds as `1′05″–1′10″`. */
function stretchText(root: TimelineManifest, start: Real, end: Real): string {
  const unit: TimeUnit = root.unit;
  const text = (value: Real, withUnit: boolean) => {
    const coordinate = exactCoordinate(value, unit, root.number_type);
    const written = coordinate === undefined ? value : coordinate.value;
    return prettyText(written, root.number_type, withUnit ? unit : null);
  };
  return unit === "seconds"
    ? `${text(start, true)}–${text(end, true)}`
    : `${text(start, false)}–${text(end, false)} ${prettyUnit(unit)}`;
}

const foundRows = new WeakMap<Manifest, Map<string, Row | ArrangementConflict>>();

/**
 * A bundle's items side by side, starting from the stored order `order`
 * (`itemOrder`): the row, which keeps that order wherever the stretches
 * leave it free, the shared roots drawn once in the order they take their
 * lines, the pairs of them the groups order, and the anchors on them; or the
 * conflict that makes it impossible, the first found of: two stretches
 * overlapping on a shared root (the first root in name order, the first pair
 * in the item order), the stretches ordering the groups in a cycle, the
 * groups ordering the roots in a cycle. Memoised by manifest and order.
 */
export function rowOf(manifest: Manifest, order: readonly string[]): Row | ArrangementConflict {
  let byOrder = foundRows.get(manifest);
  if (byOrder === undefined) {
    byOrder = new Map();
    foundRows.set(manifest, byOrder);
  }
  const key = JSON.stringify(order);
  const known = byOrder.get(key);
  if (known !== undefined) return known;
  const found = arranged(manifest, itemOrder(manifest, order));
  byOrder.set(key, found);
  return found;
}

function arranged(manifest: Manifest, items: readonly string[]): Row | ArrangementConflict {
  const groups = new Map(manifest.groups.map((group) => [group.id, group]));
  const roots = new Map(manifest.timelines.map((root) => [root.id, root]));
  const groupOf = (id: string) => present(groups.get(id), `group '${id}'`);
  const rootOf = (id: string) => present(roots.get(id), `root '${id}'`);
  const anchors = sharedAnchors(manifest);
  const place = new Map(items.map((id, index) => [id, index]));
  const byPlace = (a: Anchor, b: Anchor) => (place.get(a.group) ?? 0) - (place.get(b.group) ?? 0);
  const shared = [...new Set(anchors.map((anchor) => anchor.root))]
    .map(rootOf)
    .sort(compareByName)
    .map((root) => root.id);
  // Along each shared root: an overlap refuses; otherwise each pair of stretches orders its groups.
  const precedes: Edge[] = [];
  for (const root of shared) {
    const on = anchors.filter((anchor) => anchor.root === root).sort(byPlace);
    for (const [index, left] of on.entries()) {
      for (const right of on.slice(index + 1)) {
        const leftFirst = compareReal(left.end, right.start) <= 0;
        const rightFirst = compareReal(right.end, left.start) <= 0;
        if (!leftFirst && !rightFirst) {
          const start = compareReal(left.start, right.start) >= 0 ? left.start : right.start;
          const end = compareReal(left.end, right.end) <= 0 ? left.end : right.end;
          const reason = `${quoted(groupOf(left.group))} and ${quoted(groupOf(right.group))} overlap on ${quoted(rootOf(root))} (${stretchText(rootOf(root), start, end)})`;
          return { groups: [left.group, right.group], roots: [root], reason };
        }
        if (leftFirst && rightFirst) continue;
        precedes.push(
          leftFirst
            ? { from: left.group, to: right.group, by: root }
            : { from: right.group, to: left.group, by: root },
        );
      }
    }
  }
  const row = sorted(items, precedes);
  if ("cycle" in row) {
    const { cycle } = row;
    const steps = cycle.map((edge, index) =>
      `on ${quoted(rootOf(edge.by))} ${quoted(groupOf(edge.from))} ${
        cycle.length === 2
          ? index === 0
            ? "comes first"
            : ""
          : `${index === 0 ? "comes " : ""}before ${quoted(groupOf(edge.to))}`
      }`.trimEnd(),
    );
    return {
      groups: cycle.map((edge) => edge.from),
      roots: cycle.map((edge) => edge.by),
      reason: steps.join(", "),
    };
  }
  // In each group, in drawing order, its anchors on shared roots in display order give the roots'
  // order, top to bottom.
  const above: Edge[] = [];
  for (const { group } of memberDrawings(manifest).frames) {
    const members = displayOrder(manifest, group.id);
    const own = anchors
      .filter((anchor) => anchor.group === group.id)
      .sort((a, b) => members.indexOf(a.member) - members.indexOf(b.member));
    for (const [index, upper] of own.entries()) {
      const lower = own[index + 1];
      if (lower !== undefined) above.push({ from: upper.root, to: lower.root, by: group.id });
    }
  }
  // The roots start from the place of their first group in the row, roots of one first group in
  // name order; a cycle is found among them in name order.
  const inRow = new Map(row.order.map((id, index) => [id, index]));
  const firstAt = (root: string) =>
    Math.min(
      ...anchors
        .filter((anchor) => anchor.root === root)
        .map((anchor) => inRow.get(anchor.group) ?? 0),
    );
  const byFirst = shared
    .map((root, index) => ({ root, index, first: firstAt(root) }))
    .sort((a, b) => a.first - b.first || a.index - b.index)
    .map(({ root }) => root);
  const stacked = sorted(byFirst, above);
  if ("cycle" in stacked) {
    const found = sorted(shared, above);
    const cycle = "cycle" in found ? found.cycle : stacked.cycle;
    return {
      groups: cycle.map((edge) => edge.by),
      roots: cycle.map((edge) => edge.from),
      reason: cycle
        .map(
          (edge) =>
            `${quoted(groupOf(edge.by))} holds ${quoted(rootOf(edge.from))} above ${quoted(rootOf(edge.to))}`,
        )
        .join(", "),
    };
  }
  const pairs: (readonly [string, string])[] = [];
  for (const { from, to } of above) {
    if (!pairs.some(([upper, lower]) => upper === from && lower === to)) pairs.push([from, to]);
  }
  const ordered = anchors
    .map((anchor, index) => ({ anchor, index }))
    .sort(
      (a, b) =>
        (inRow.get(a.anchor.group) ?? 0) - (inRow.get(b.anchor.group) ?? 0) || a.index - b.index,
    )
    .map(({ anchor }) => anchor);
  return { row: row.order, roots: stacked.order, above: pairs, anchors: ordered };
}

/** The anchors of `manifest` on its shared roots, the roots two or more groups hang on. */
function sharedAnchors(manifest: Manifest): readonly Anchor[] {
  const all = anchorsOf(manifest);
  const groupsOn = new Map<string, Set<string>>();
  for (const { root, group } of all) {
    const known = groupsOn.get(root) ?? new Set<string>();
    known.add(group);
    groupsOn.set(root, known);
  }
  return all.filter((anchor) => (groupsOn.get(anchor.root)?.size ?? 0) > 1);
}

/**
 * Why giving group `group` the display order `order` would change one of
 * its anchors on a shared root: `would anchor "<member>" on "<root>" instead
 * of "<anchor>"` for the first root, in the group's present display order of
 * its anchors, whose anchor would change; `null` when every such anchor
 * stays. A drop that changes an anchor on a shared root is refused while the
 * bundle is arranged side by side; an anchor on a root that one group hangs
 * on is bound by no rule.
 */
export function anchorChange(
  manifest: Manifest,
  group: string,
  order: readonly string[],
): string | null {
  const shown = displayOrder(manifest, group);
  const own = sharedAnchors(manifest)
    .filter((anchor) => anchor.group === group)
    .sort((a, b) => shown.indexOf(a.member) - shown.indexOf(b.member));
  const drawn = memberDrawings(manifest).frames.find((frame) => frame.group.id === group);
  const members = new Map(
    (drawn?.members ?? []).map((member) => [member.timeline.id, member] as const),
  );
  const timeline = (id: string) => present(members.get(id), `member '${id}'`).timeline;
  for (const anchor of own) {
    const first = order.find(
      (member) => members.get(member)?.ancestors[0]?.timeline.id === anchor.root,
    );
    if (first !== undefined && first !== anchor.member) {
      const root = present(members.get(first)?.ancestors[0], `the root of '${first}'`).timeline;
      return `would anchor ${quoted(timeline(first))} on ${quoted(root)} instead of ${quoted(timeline(anchor.member))}`;
    }
  }
  return null;
}
