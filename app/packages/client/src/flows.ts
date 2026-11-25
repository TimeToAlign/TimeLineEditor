/**
 * The flows of a timeline, as `tilie-server` computes them with timetoalign:
 * the request of `POST /api/flows` and of `POST /api/flows/flow-maps`, the
 * reader of the first one's answer and the check of the second one's. Each
 * body is a JSON object of parameters behind its length, followed by the
 * manifest's text.
 */

import type { FlowReading } from "@timetoalign/tilie-core";
import { isRecord, member } from "./claimProvenance.ts";

/** How flow control is played: as written, once through, or the axis as it stands. */
export type FlowConvention = "default" | "single" | "printed";

/** The number type of a timeline's axis, which says how a value on it is written. */
export type FlowNumberType = "int" | "float" | "fraction";

/**
 * A value on the timeline's own axis, written as its manifest writes one: an
 * integer under `int`, a number under `float`, a `[numerator, denominator]`
 * pair of safe integers under `fraction`.
 */
export type FlowValue = number | readonly [number, number];

/** A stretch of the axis played without a jump: its start and its end, exclusive. */
export type FlowRun = readonly [FlowValue, FlowValue];

/** A stretch of the axis that flow control never divides, named by its letter. */
export interface AtomicSection {
  readonly name: string;
  readonly start: FlowValue;
  readonly end: FlowValue;
}

/** What playing flow control can find. */
export type FlowFindingKind =
  | "flow_ends_at_break"
  | "never_played"
  | "endless_loop"
  | "ambiguous_targets"
  | "undetermined_target";

/**
 * Something playing flow control found: where (the start of the stretch, for
 * a stretch never played, whose `end` is given too) and timetoalign's
 * sentence about it.
 */
export interface FlowFinding {
  readonly kind: FlowFindingKind;
  readonly coordinate: FlowValue;
  readonly end?: FlowValue;
  readonly message: string;
}

/**
 * One flow: the runs in the order played and the names of the atomic
 * sections they cover, in that order. The `default` flow alone has
 * `findings`.
 */
export interface Flow {
  readonly runs: readonly FlowRun[];
  readonly sections: readonly string[];
  readonly findings?: readonly FlowFinding[];
}

/**
 * The flows of one timeline: its bare ID, its number type, its atomic
 * sections in the order of the axis, and the flow of each convention asked
 * for.
 */
export interface Flows {
  readonly timeline: string;
  readonly number_type: FlowNumberType;
  readonly atomic_sections: readonly AtomicSection[];
  readonly conventions: Readonly<Partial<Record<FlowConvention, Flow>>>;
}

/** What `flows` may be asked besides the timeline. */
export interface FlowOptions {
  /** The one convention to answer; all three without it. */
  readonly convention?: FlowConvention;
  /**
   * Which flow-control elements are read: those whose state for the
   * reading's believer is one of its states (core's `flowReading`, the
   * editor's user under the block's belief filter); without it the
   * elements no actor rejects.
   */
  readonly reading?: FlowReading;
}

/** What `withFlowMaps` may be asked besides the timeline. */
export interface WrittenFlowOptions extends Pick<FlowOptions, "reading"> {
  /**
   * Who asks: the actor whose belief `false` rejects an atomic section
   * written before whose stretch is none any more. The server refuses to
   * write over such a section without it.
   */
  readonly actor?: string;
  /** The day of that belief, `YYYY-MM-DD`; the server's day without it. */
  readonly date?: string;
}

/** The message of a flows answer that is not of the route's form. */
export const MALFORMED_FLOWS = "the flows answer is not the flows of the timeline asked for";

/** The message of a flow-maps answer that is no manifest file in JSON. */
export const MALFORMED_FLOW_MAPS = "the flow-maps answer is not a manifest";

const PREFIX = 4;
const CONVENTIONS: readonly FlowConvention[] = ["default", "single", "printed"];
const NUMBER_TYPES: readonly FlowNumberType[] = ["int", "float", "fraction"];
const FINDING_KINDS: readonly FlowFindingKind[] = [
  "flow_ends_at_break",
  "never_played",
  "endless_loop",
  "ambiguous_targets",
  "undetermined_target",
];

/**
 * A request of the flow routes: the parameters' UTF-8 length (little-endian),
 * the parameters as JSON (`timeline`, then `convention`, the reading's
 * `believer` and `beliefs`, `actor` and `date` where given), then the
 * manifest's text.
 */
export function flowsRequest(
  timeline: string,
  options: FlowOptions & WrittenFlowOptions,
  manifest: string,
): Blob {
  const { convention, reading, actor, date } = options;
  const parameters = {
    timeline,
    ...(convention === undefined ? {} : { convention }),
    ...(reading === undefined ? {} : { believer: reading.believer, beliefs: reading.beliefs }),
    ...(actor === undefined ? {} : { actor }),
    ...(date === undefined ? {} : { date }),
  };
  const text = new TextEncoder().encode(JSON.stringify(parameters));
  const prefix = new Uint8Array(PREFIX);
  new DataView(prefix.buffer).setUint32(0, text.length, true);
  return new Blob([prefix, text, manifest]);
}

function hasExactly(value: object, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => own.includes(key));
}

/** The value `value` is on an axis of `numberType`, or `undefined`. */
function axisValueOf(value: unknown, numberType: FlowNumberType): FlowValue | undefined {
  if (numberType === "fraction") {
    if (!Array.isArray(value) || value.length !== 2) return undefined;
    const [numerator, denominator]: unknown[] = value;
    if (typeof numerator !== "number" || typeof denominator !== "number") return undefined;
    if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) return undefined;
    return denominator > 0 ? [numerator, denominator] : undefined;
  }
  if (typeof value !== "number") return undefined;
  const fits = numberType === "int" ? Number.isSafeInteger(value) : Number.isFinite(value);
  return fits ? value : undefined;
}

function sectionOf(value: unknown, numberType: FlowNumberType): AtomicSection | undefined {
  if (!isRecord(value) || !hasExactly(value, ["name", "start", "end"])) return undefined;
  const name = member(value, "name");
  const start = axisValueOf(member(value, "start"), numberType);
  const end = axisValueOf(member(value, "end"), numberType);
  if (typeof name !== "string" || start === undefined || end === undefined) return undefined;
  return { name, start, end };
}

function runOf(value: unknown, numberType: FlowNumberType): FlowRun | undefined {
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  const start = axisValueOf(value[0], numberType);
  const end = axisValueOf(value[1], numberType);
  return start === undefined || end === undefined ? undefined : [start, end];
}

function isFindingKind(value: unknown): value is FlowFindingKind {
  return FINDING_KINDS.some((kind) => kind === value);
}

function findingOf(value: unknown, numberType: FlowNumberType): FlowFinding | undefined {
  if (!isRecord(value)) return undefined;
  const ended = "end" in value;
  const keys = ended ? ["kind", "coordinate", "end", "message"] : ["kind", "coordinate", "message"];
  if (!hasExactly(value, keys)) return undefined;
  const kind = member(value, "kind");
  const coordinate = axisValueOf(member(value, "coordinate"), numberType);
  const message = member(value, "message");
  if (!isFindingKind(kind) || coordinate === undefined || typeof message !== "string") {
    return undefined;
  }
  if (!ended) return { kind, coordinate, message };
  const end = axisValueOf(member(value, "end"), numberType);
  return end === undefined ? undefined : { kind, coordinate, end, message };
}

/** Every item of `value` read by `read`, or `undefined` when it is no list or an item is not read. */
function listOf<T>(value: unknown, read: (item: unknown) => T | undefined): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: T[] = [];
  for (const item of value) {
    const one = read(item);
    if (one === undefined) return undefined;
    items.push(one);
  }
  return items;
}

/** The flow of `convention` that `value` is, its sections among `names`, or `undefined`. */
function flowOf(
  value: unknown,
  convention: FlowConvention,
  numberType: FlowNumberType,
  names: readonly string[],
): Flow | undefined {
  const found = convention === "default";
  const keys = found ? ["runs", "sections", "findings"] : ["runs", "sections"];
  if (!isRecord(value) || !hasExactly(value, keys)) return undefined;
  const runs = listOf(member(value, "runs"), (run) => runOf(run, numberType));
  const sections = listOf(member(value, "sections"), (name) =>
    typeof name === "string" && names.includes(name) ? name : undefined,
  );
  if (runs === undefined || sections === undefined) return undefined;
  if (!found) return { runs, sections };
  const findings = listOf(member(value, "findings"), (finding) => findingOf(finding, numberType));
  return findings === undefined ? undefined : { runs, sections, findings };
}

/**
 * The flows of the timeline `timeline` that a 2xx body of the flows route
 * holds, or `undefined` when the body is not of its form: the timeline
 * asked, a number type, the atomic sections, and exactly the conventions
 * asked for (`convention`, or all three), every value written as the number
 * type says and every section of a flow one of the atomic sections.
 */
export function flowsOf(
  body: unknown,
  timeline: string,
  convention: FlowConvention | undefined,
): Flows | undefined {
  const keys = ["timeline", "number_type", "atomic_sections", "conventions"];
  if (!isRecord(body) || !hasExactly(body, keys) || member(body, "timeline") !== timeline) {
    return undefined;
  }
  const numberType = NUMBER_TYPES.find((type) => type === member(body, "number_type"));
  if (numberType === undefined) return undefined;
  const sections = listOf(member(body, "atomic_sections"), (section) =>
    sectionOf(section, numberType),
  );
  const answered = member(body, "conventions");
  const asked = convention === undefined ? CONVENTIONS : [convention];
  if (sections === undefined || !isRecord(answered) || !hasExactly(answered, asked)) {
    return undefined;
  }
  const names = sections.map((section) => section.name);
  const conventions: Partial<Record<FlowConvention, Flow>> = {};
  for (const one of asked) {
    const flow = flowOf(member(answered, one), one, numberType, names);
    if (flow === undefined) return undefined;
    conventions[one] = flow;
  }
  return { timeline, number_type: numberType, atomic_sections: sections, conventions };
}

/** Whether `text` is JSON holding an object with a `timelines` list: a manifest file. */
export function isManifestText(text: string): boolean {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return false;
  }
  return isRecord(value) && Array.isArray(member(value, "timelines"));
}
