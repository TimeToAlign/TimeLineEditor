/**
 * What the Metadata tab's actions change, each as one `set`: a skeleton
 * after the action, built by TimeToShare's statement functions on the
 * frame's skeleton (which throw where an action does not apply; the caller
 * posts the message), and `commandOf`, the one command holding a change per
 * element whose statements or provenance differ.
 */

import type { Address, PathSegment, SetCommand, Skeleton } from "@timetoalign/tilie-core";
import { canonicalText, TILIE_AGENT } from "@timetoalign/tilie-core";
import type { Belief, PairProvenance } from "@timetoalign/timetoshare";
import {
  expandIri,
  isJsonObject,
  withBelief,
  withoutPair,
  withPair,
} from "@timetoalign/timetoshare";
import type { JsonObject } from "./catalogue.ts";
import { compactIri } from "./catalogue.ts";
import type { CandidateRow, Frame, Pair, Thing } from "./frame.ts";

/** The paradata written for every pair an Add states; the person in `stated_by` believes it `true`. */
export interface EntryFields {
  readonly stated_by: readonly [string];
  readonly date: string;
  readonly method: "manual" | "reconciled" | "imported" | "inferred";
  readonly service?: string;
  readonly basis?: readonly string[];
  readonly match?: "exact" | "close" | "broad" | "narrow" | "related";
}

/**
 * The skeleton with `pairs` stated on the frame's element, each with its
 * paradata from `fields` and the belief `true` of the person who states it
 * (`fields.stated_by`) on `fields.date`.
 */
export function added(frame: Frame, pairs: readonly Pair[], fields: EntryFields): Skeleton {
  const provenance: PairProvenance = { ...fields };
  const [actor] = fields.stated_by;
  return pairs.reduce(
    (skeleton, [property, value]) =>
      withPair(skeleton, frame.path, property, value, { provenance, actor, date: fields.date }),
    frame.skeleton,
  );
}

/** The note of the "same as" a tie writes, in words. */
export const TIE_NOTE =
  "written by “＋ Add vocabulary” to keep the value with the thing it was chosen for";

/**
 * `pairs` with every value node whose `id` names another thing than
 * `thing` tied to it: `schema:sameAs` gains `{id: <thing, compact>}`, once,
 * and the node's `provenance` an entry saying so: inferred by TiLiE on
 * `day` from the thing, with `TIE_NOTE`; no one believes it.
 */
export function tied(
  pairs: readonly Pair[],
  thing: Thing,
  prefixes: Readonly<Record<string, string>>,
  day: string,
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
    if (known) return [property, value];
    const entries = Array.isArray(value.provenance) ? value.provenance : [];
    const tie = {
      basis: [thing.iri],
      date: day,
      method: "inferred",
      note: TIE_NOTE,
      property: "schema:sameAs",
      stated_by: [TILIE_AGENT],
      value: { id: same },
    };
    return [
      property,
      { ...value, "schema:sameAs": [...before, { id: same }], provenance: [...entries, tie] },
    ];
  });
}

/** The skeleton without the pair the frame's element states, and its provenance entry. */
export function removed(frame: Frame, [property, value]: Pair): Skeleton {
  return withoutPair(frame.skeleton, frame.path, property, value);
}

/**
 * The skeleton with `actor`'s belief in the pair of the subject at
 * `subject` (the frame's element or a value node it states), on `day`,
 * replacing the actor's earlier one; whether the pair is stated stays as it is.
 */
export function believed(
  frame: Frame,
  subject: readonly PathSegment[],
  [property, value]: Pair,
  actor: string,
  belief: Belief,
  day: string,
): Skeleton {
  return withBelief(frame.skeleton, subject, property, value, { actor, belief, date: day });
}

/**
 * The skeleton with a candidate stated by `actor` on `day`: the pair
 * stated, its entry kept as the stated pair's, and the actor's belief
 * `true` recorded in it.
 */
export function stated(frame: Frame, row: CandidateRow, actor: string, day: string): Skeleton {
  const [property, value] = row.pair;
  return withPair(frame.skeleton, row.subject, property, value, { actor, date: day });
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
