/**
 * What the Metadata tab's actions change, each as one `set`: a skeleton
 * after the action, built by TimeToShare's statement functions on the
 * frame's skeleton (which throw where an action does not apply; the caller
 * posts the message), and `commandOf`, the one command holding a change per
 * element whose statements or provenance differ.
 */

import type { Address, SetCommand, Skeleton, User } from "@timetoalign/tilie-core";
import { canonicalText, statedBy } from "@timetoalign/tilie-core";
import type { PairProvenance } from "@timetoalign/timetoshare";
import {
  expandIri,
  isJsonObject,
  withConfirmation,
  withoutPair,
  withPair,
  withRejection,
} from "@timetoalign/timetoshare";
import type { JsonObject } from "./catalogue.ts";
import { compactIri } from "./catalogue.ts";
import type { DrawerRow, Frame, Pair, RectangleView, Thing } from "./frame.ts";
import { entryPair } from "./frame.ts";

/** The annotation written for every pair an Add states. */
export interface EntryFields {
  readonly stated_by: readonly [string];
  readonly date: string;
  readonly method: "manual" | "reconciled" | "imported" | "inferred";
  readonly service?: string;
  readonly basis?: readonly string[];
  readonly match?: "exact" | "close" | "broad" | "narrow" | "related";
}

/** The skeleton with `pairs` stated on the frame's element, each with its annotation from `fields`. */
export function added(frame: Frame, pairs: readonly Pair[], fields: EntryFields): Skeleton {
  const provenance: PairProvenance = { ...fields };
  return pairs.reduce(
    (skeleton, [property, value]) =>
      withPair(skeleton, frame.path, property, value, { provenance }),
    frame.skeleton,
  );
}

/**
 * `pairs` with every value node whose `id` names another thing than
 * `thing` tied to it: `schema:sameAs` gains `{id: <thing, compact>}`, once.
 */
export function tied(
  pairs: readonly Pair[],
  thing: Thing,
  prefixes: Readonly<Record<string, string>>,
): Pair[] {
  const same = compactIri(prefixes, thing.iri);
  return pairs.map(([property, value]): Pair => {
    if (!isJsonObject(value) || typeof value.id !== "string") return [property, value];
    if ((expandIri(prefixes, value.id) ?? value.id) === thing.iri) return [property, value];
    const before = Array.isArray(value["schema:sameAs"]) ? value["schema:sameAs"] : [];
    const known = before.some(
      (item) =>
        isJsonObject(item) &&
        typeof item.id === "string" &&
        (expandIri(prefixes, item.id) ?? item.id) === thing.iri,
    );
    return [property, known ? value : { ...value, "schema:sameAs": [...before, { id: same }] }];
  });
}

/** The skeleton without the rectangle's pairs and their confirmed annotations. */
export function removedRectangle(frame: Frame, rectangle: RectangleView): Skeleton {
  return rectangle.pairs.reduce(
    (skeleton, [property, value]) => withoutPair(skeleton, frame.path, property, value),
    frame.skeleton,
  );
}

/** The skeleton with the rectangle's pairs rejected by `user` on `day`: removed, kept as rejected annotations. */
export function rejectedRectangle(
  frame: Frame,
  rectangle: RectangleView,
  user: User,
  day: string,
): Skeleton {
  const decision = { stated_by: [statedBy(user)], date: day };
  return rectangle.pairs.reduce(
    (skeleton, [property, value]) => withRejection(skeleton, frame.path, property, value, decision),
    frame.skeleton,
  );
}

/** The pair of a drawer row, as the statement functions take it. */
function rowPair(frame: Frame, row: DrawerRow): Pair {
  return entryPair(frame.skeleton["@context"], { ...row.entry });
}

/** The skeleton with a drawer row's pair confirmed by `user` on `day`: stated, its annotation confirmed. */
export function confirmed(frame: Frame, row: DrawerRow, user: User, day: string): Skeleton {
  const [property, value] = rowPair(frame, row);
  return withConfirmation(frame.skeleton, row.subject, property, value, {
    stated_by: [statedBy(user)],
    date: day,
  });
}

/** The skeleton with a drawer row's pair rejected by `user` on `day`. */
export function rejected(frame: Frame, row: DrawerRow, user: User, day: string): Skeleton {
  const [property, value] = rowPair(frame, row);
  return withRejection(frame.skeleton, row.subject, property, value, {
    stated_by: [statedBy(user)],
    date: day,
  });
}

/** An element of a skeleton that may hold statements, with its bare ID (`null`: the bundle). */
interface Described {
  readonly id: string | null;
  readonly statements?: unknown;
  readonly provenance?: unknown;
}

function* described(skeleton: Skeleton): Generator<Described> {
  yield { id: null, statements: skeleton.statements, provenance: skeleton.provenance };
  function* timeline(value: Skeleton["timelines"][number]): Generator<Described> {
    yield value;
    for (const region of value.regions) yield region;
    for (const child of value.children) yield* timeline(child);
  }
  for (const root of skeleton.timelines) yield* timeline(root);
}

/** Whether two members are the same: both absent, or the same canonical text. */
function same(left: unknown, right: unknown): boolean {
  if (left === undefined || right === undefined) return left === right;
  return canonicalText(left) === canonicalText(right);
}

/**
 * The one `set` changing the frame's block from `frame.skeleton` to
 * `after`: a change per element whose `statements` or `provenance` differ,
 * holding only the members that differ (`null` for one gone); `null` when
 * nothing differs.
 */
export function commandOf(frame: Frame, after: Skeleton): SetCommand | null {
  const before = new Map<string | null, Described>();
  for (const element of described(frame.skeleton)) before.set(element.id, element);
  const changes = [...described(after)].flatMap((element) => {
    const old = before.get(element.id);
    const values: JsonObject = {};
    for (const member of ["statements", "provenance"] as const) {
      if (!same(old?.[member], element[member])) values[member] = element[member] ?? null;
    }
    if (Object.keys(values).length === 0) return [];
    const target: Address =
      element.id === null ? { block: frame.block.id } : { block: frame.block.id, id: element.id };
    return [{ target, values }];
  });
  return changes.length === 0 ? null : { type: "set", changes };
}

/** The calendar date of `now` in the viewer's time zone, `YYYY-MM-DD`: the day a statement is made. */
export function dayOf(now: Date): string {
  const two = (value: number) => String(value).padStart(2, "0");
  return `${String(now.getFullYear()).padStart(4, "0")}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}
