/**
 * Bulk proposals: the names stated without an identifier (value nodes with
 * a `label` and no `id`) of the shown element and every element below it,
 * looked up in the systems the lookup reconciles, the best candidate of each
 * written by TiLiE as a candidate for review, never stated. Stating such a
 * candidate states the identified thing in place of the one name it can be
 * for.
 */

import type { PathSegment, Skeleton, View } from "@timetoalign/tilie-core";
import { canonicalText, skeletonOf, statementHolders, TILIE_AGENT } from "@timetoalign/tilie-core";
import type { Catalogue, Pair } from "@timetoalign/timetoshare";
import {
  entries,
  expandIri,
  pairs,
  samePair,
  subjectPath,
  verbOf,
  withCandidate,
  withoutPair,
  withPair,
} from "@timetoalign/timetoshare";
import type { Candidate, Lookup, ValueKind } from "../../lookup/index.ts";
import type { JsonObject } from "./catalogue.ts";
import { compactIri, systemChoices, valueKindOf } from "./catalogue.ts";
import type { CandidateRow, Frame } from "./frame.ts";
import { entryPair, isNode } from "./frame.ts";

/** The systems names are reconciled in, in the order their candidates are preferred. */
export const RECONCILING: readonly string[] = ["wikidata", "gnd", "musicbrainz"];

/** A catalogue pattern's thing slot: a name is read as the thing it would be. */
const SLOT = "?";

/** A name stated without an identifier, and where it could be looked up. */
export interface Unreconciled {
  /** The ID of the timeline or region whose statements hold it; `null` for the bundle's. */
  readonly holder: string | null;
  /** The element or value node stating it. */
  readonly subject: readonly PathSegment[];
  readonly property: string;
  /** The value node as stated. */
  readonly node: JsonObject;
  readonly label: string;
  /** The kind of value its verb takes. */
  readonly kind: ValueKind;
  /** The systems its verb can be stated in that the lookup searches for that kind, preferred first. */
  readonly systems: readonly string[];
}

function startsWith(path: readonly PathSegment[], prefix: readonly PathSegment[]): boolean {
  return prefix.every((step, index) => path[index] === step);
}

/** The pairs of `subject` with each value's path: a value's index counts within its property. */
function placedPairs(
  skeleton: Skeleton,
  subject: readonly PathSegment[],
  container: readonly PathSegment[],
): (readonly [Pair, readonly PathSegment[]])[] {
  const seen = new Map<string, number>();
  return pairs(skeleton, subject).map((pair) => {
    const index = seen.get(pair[0]) ?? 0;
    seen.set(pair[0], index + 1);
    return [pair, [...container, pair[0], index]] as const;
  });
}

/**
 * The names stated without an identifier by the frame's element and every
 * timeline and region below it, value nodes within value nodes included, in
 * the order of the holders and their pairs: each a value node without `id`
 * whose `label` is not blank, under a property a catalogue verb reads (the
 * node read as the thing it names), offered where at least one system of
 * `RECONCILING` can state the verb and the lookup searches it for the
 * verb's kind of value.
 */
export function unreconciledOf(frame: Frame, catalogue: Catalogue, lookup: Lookup): Unreconciled[] {
  const { skeleton } = frame;
  const context = skeleton["@context"];
  const found: Unreconciled[] = [];
  const visit = (
    holder: string | null,
    subject: readonly PathSegment[],
    [property, value]: Pair,
    path: readonly PathSegment[],
  ): void => {
    if (!isNode(value)) return;
    const { label } = value;
    if (value.id === undefined && typeof label === "string" && label.trim() !== "") {
      const verb = verbOf(catalogue, context, property, { ...value, id: SLOT });
      const kind = verb === null ? null : valueKindOf(verb[0]);
      const offered = new Set(
        verb === null
          ? []
          : systemChoices(catalogue, { id: verb[0], inverse: verb[1], label: "" }).map(
              (choice) => choice.id,
            ),
      );
      const systems =
        kind === null
          ? []
          : RECONCILING.filter((system) => offered.has(system) && lookup.searchable(system, kind));
      if (kind !== null && systems.length > 0) {
        found.push({ holder, subject, property, node: value, label, kind, systems });
      }
    }
    for (const [pair, inner] of placedPairs(skeleton, path, path)) visit(holder, path, pair, inner);
  };
  for (const holder of statementHolders(frame.block.manifest)) {
    if (!startsWith(holder.path, frame.path)) continue;
    const container = [...holder.path, "statements"];
    for (const [pair, path] of placedPairs(skeleton, holder.path, container)) {
      visit(holder.id, holder.path, pair, path);
    }
  }
  return found;
}

/** One `reconcile` call: the names of one kind looked up in one system. */
export interface Question {
  readonly system: string;
  readonly kind: ValueKind;
  readonly texts: readonly string[];
}

/** The calls the names need: one per system and kind, systems preferred first, each name once. */
export function questionsOf(found: readonly Unreconciled[]): Question[] {
  const asked = new Map<string, { system: string; kind: ValueKind; texts: string[] }>();
  for (const system of RECONCILING) {
    for (const item of found) {
      if (!item.systems.includes(system)) continue;
      const key = canonicalText([system, item.kind]);
      const question = asked.get(key) ?? { system, kind: item.kind, texts: [] };
      if (!question.texts.includes(item.label)) question.texts.push(item.label);
      asked.set(key, question);
    }
  }
  return [...asked.values()];
}

/** The best candidate of each name per system and kind, `null` where none was found. */
export type Answers = ReadonlyMap<string, Candidate | null>;

/** The key of a name's answer. */
export function answerKey(system: string, kind: ValueKind, text: string): string {
  return canonicalText([system, kind, text]);
}

/** A system that could not be asked, and why. */
export interface Failure {
  readonly system: string;
  readonly message: string;
}

/** Ask every question; a system that fails answers nothing and is named among the failures. */
export async function answersTo(
  lookup: Lookup,
  questions: readonly Question[],
  signal?: AbortSignal,
): Promise<{ readonly answers: Answers; readonly failures: readonly Failure[] }> {
  const answers = new Map<string, Candidate | null>();
  const failures: Failure[] = [];
  await Promise.all(
    questions.map(async ({ system, kind, texts }) => {
      try {
        const best = await lookup.reconcile(system, kind, texts, signal);
        texts.forEach((text, index) => {
          answers.set(answerKey(system, kind, text), best[index] ?? null);
        });
      } catch (error) {
        failures.push({ system, message: error instanceof Error ? error.message : String(error) });
      }
    }),
  );
  return { answers, failures };
}

/** The note of a candidate found for a name, in words: which stated name it was looked up for. */
export function proposalNote(label: string): string {
  return `found for the name “${label}”`;
}

/** How many proposals one element was given: the timeline or region of that ID, or the bundle (`null`). */
export interface Placed {
  readonly holder: string | null;
  readonly count: number;
}

/**
 * The skeleton with the best candidate of each name written as TiLiE's
 * candidate (TimeToShare's `withCandidate`): the candidate of the first
 * system in `RECONCILING` that found one, `{id}` under the name's property
 * on the name's subject, `reconciled` by the candidate's service on `day`,
 * its match `exact` where the service says it matches and none where it
 * says nothing, and the note naming the name. A pair the subject already
 * states, or has any entry of (a candidate, believed `false` by someone or
 * not), is passed over. With the number proposed, and how many went to each
 * element (`placed`, those given one, in the order of their names).
 */
export function proposed(
  frame: Frame,
  found: readonly Unreconciled[],
  answers: Answers,
  prefixes: Readonly<Record<string, string>>,
  day: string,
): { readonly skeleton: Skeleton; readonly count: number; readonly placed: readonly Placed[] } {
  let skeleton = frame.skeleton;
  let count = 0;
  const placed: { holder: string | null; count: number }[] = [];
  const context = skeleton["@context"];
  for (const item of found) {
    const candidate = item.systems
      .map((system) => answers.get(answerKey(system, item.kind, item.label)) ?? null)
      .find((answer) => answer !== null);
    if (candidate === undefined || candidate === null) continue;
    const value = { id: compactIri(prefixes, candidate.iri), label: candidate.label };
    const pair: Pair = [item.property, value];
    const known =
      pairs(skeleton, item.subject).some((stated) => samePair(context, stated, pair)) ||
      entries(skeleton, item.subject).some((entry) =>
        samePair(context, entryPair(context, entry), pair),
      );
    if (known) continue;
    skeleton = withCandidate(skeleton, item.subject, item.property, value, {
      stated_by: [TILIE_AGENT],
      date: day,
      method: "reconciled",
      service: candidate.service,
      ...(candidate.match ? { match: "exact" as const } : {}),
      note: proposalNote(item.label),
    });
    count += 1;
    const at = placed.find((entry) => entry.holder === item.holder);
    if (at === undefined) placed.push({ holder: item.holder, count: 1 });
    else at.count += 1;
  }
  return { skeleton, count, placed };
}

/** "1 match", "2 matches". */
function matches(count: number): string {
  return `${count} ${count === 1 ? "match" : "matches"}`;
}

/**
 * What the panel says after proposing: how many, and where they are listed.
 * All on the element shown (`here`, its ID or `null` for the bundle): they
 * are listed under its Candidates. Some on elements below it: the count
 * here, then each other element's count and its words (`words`), in
 * `placed`'s order: "Proposed 3 matches: 2 here, 1 on timeline 'clt_6'; …".
 */
export function proposedText(
  placed: readonly Placed[],
  here: string | null,
  words: (holder: string | null) => string,
): string {
  const total = placed.reduce((sum, entry) => sum + entry.count, 0);
  const others = placed.filter((entry) => entry.holder !== here);
  if (others.length === 0) return `Proposed ${matches(total)}: they are listed under Candidates.`;
  const own = placed.find((entry) => entry.holder === here)?.count ?? 0;
  const parts = [
    `${own} here`,
    ...others.map((entry) => `${entry.count} on ${words(entry.holder)}`),
  ];
  return `Proposed ${matches(total)}: ${parts.join(", ")}; each is listed under Candidates of the element it is proposed for.`;
}

/**
 * The skeleton with a candidate for a name stated by `actor` on `day`: where
 * the candidate's value is a thing (a node with `id`) and its subject states
 * exactly one name under a property of the same IRI (a value node with a
 * `label` and no `id`), that name is taken out and the thing stated in its
 * place, the name's node with the thing's `id`, so its label and other keys
 * stay; the candidate's entry becomes the stated pair's, with the actor's
 * belief `true`. `null` for any other candidate, and where several names
 * could be the one: the candidate is then stated as it is. The entry's
 * `note` is words and is never read.
 */
export function statedForName(
  frame: Frame,
  row: CandidateRow,
  actor: string,
  day: string,
): Skeleton | null {
  const { skeleton } = frame;
  const context = skeleton["@context"];
  const [property, value] = row.pair;
  if (!isNode(value) || typeof value.id !== "string") return null;
  const iri = expandIri(context, property);
  const names = pairs(skeleton, row.subject).filter(
    ([key, held]) =>
      isNode(held) &&
      held.id === undefined &&
      typeof held.label === "string" &&
      expandIri(context, key) === iri,
  );
  const [name, ...others] = names;
  if (name === undefined || others.length > 0 || !isNode(name[1])) return null;
  const [key, node] = name;
  const without = withoutPair(skeleton, row.subject, key, node);
  return withPair(without, row.subject, property, { ...node, id: value.id }, { actor, date: day });
}

/**
 * `frame` as it stands in `view` now: its block's current manifest and
 * skeleton, the element's path in it; `null` when the block or the element
 * is gone.
 */
export function frameIn(view: View, frame: Frame): Frame | null {
  const block = view.blocks[frame.block.id];
  if (block === undefined) return null;
  const skeleton = skeletonOf(block.manifest);
  try {
    return { ...frame, block, skeleton, path: subjectPath(skeleton, frame.id) };
  } catch {
    return null;
  }
}
