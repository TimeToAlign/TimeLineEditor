/**
 * The composer's state: what is chosen in its three fields (verb,
 * vocabulary, value), the form of the pattern, the named slots and the
 * "Other property…" fields, and the element it was opened on (`owner`,
 * the frame's key), so that a selection change hides it without being
 * told. `pairs` turns the choices into the pairs an Add states, or says
 * what is missing.
 */

import type { Catalogue, Recognition } from "@timetoalign/timetoshare";
import { compactIri, expandIri, instantiate, recognize } from "@timetoalign/timetoshare";
import type { Candidate } from "../../lookup/index.ts";
import type { SystemChoice, VerbChoice } from "./catalogue.ts";
import { alternativeAt, namedSlots, OTHER, patternSystem } from "./catalogue.ts";
import type { Frame, Pair } from "./frame.ts";
import { framePrefixes } from "./frame.ts";

/** The value chosen in the Value field. */
export type ValueChoice =
  | { readonly kind: "candidate"; readonly candidate: Candidate }
  | {
      readonly kind: "recognized";
      readonly recognition: Recognition;
      readonly label: string | null;
    }
  | { readonly kind: "element"; readonly id: string; readonly label: string }
  | {
      readonly kind: "type";
      readonly type: string;
      readonly label: string;
      readonly pairs: readonly Pair[];
    }
  | { readonly kind: "literal"; readonly text: string };

/** What "Other property…" states: a thing (IRI), a text, a text in a language, or a date. */
export type OtherKind = "thing" | "text" | "language" | "date";

/** The fields of "Other property…". */
export interface OtherFields {
  property: string;
  kind: OtherKind;
  text: string;
  language: string;
}

/** What `open` takes besides the owner. */
export interface OpenOptions {
  readonly verb?: VerbChoice;
  readonly mode?: "statement" | "vocabulary";
  readonly rectangle?: string;
}

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/u;

/** The thing a value names, as an IRI, where it names one. */
export function valueIri(value: ValueChoice): string | null {
  switch (value.kind) {
    case "candidate":
      return value.candidate.iri;
    case "recognized":
      return value.recognition.iri;
    default:
      return null;
  }
}

/** The words a value shows in its field. */
export function valueText(value: ValueChoice): string {
  switch (value.kind) {
    case "candidate":
      return value.candidate.label;
    case "recognized":
      return value.label ?? value.recognition.iri ?? value.recognition.value;
    case "element":
    case "type":
      return value.label;
    case "literal":
      return value.text;
  }
}

export class ComposerState {
  /** The key of the frame the composer was opened on; `null` while closed. */
  owner: string | null = $state(null);
  mode: "statement" | "vocabulary" = $state("statement");
  /** In vocabulary mode, the key of the rectangle extended; its verb is fixed. */
  rectangle: string | null = $state(null);
  verb: VerbChoice | null = $state.raw(null);
  system: SystemChoice | null = $state.raw(null);
  /** The index of the pattern's alternative among its system's. */
  alternative = $state(0);
  value: ValueChoice | null = $state.raw(null);
  /** The values of named slots (`role`, `date`, `value`, `position`), by name. */
  slots: Record<string, string> = $state({});
  verbText = $state("");
  systemText = $state("");
  other: OtherFields = $state({ property: "", kind: "thing", text: "", language: "" });

  /** Open on the frame keyed `owner`, every choice cleared, the verb given where one is. */
  open = (owner: string, options: OpenOptions = {}): void => {
    this.owner = owner;
    this.mode = options.mode ?? "statement";
    this.rectangle = options.rectangle ?? null;
    this.verb = options.verb ?? null;
    this.verbText = options.verb?.label ?? "";
    this.system = null;
    this.systemText = "";
    this.alternative = 0;
    this.value = null;
    this.slots = {};
    this.other = { property: "", kind: "thing", text: "", language: "" };
  };

  close = (): void => {
    this.owner = null;
  };

  /** Whether the composer is open on the frame keyed `owner`. */
  isOpenOn = (owner: string): boolean => this.owner === owner;

  /** The pairs "Other property…" states, or what is missing. */
  #other = (frame: Frame, catalogue: Catalogue): readonly Pair[] | string => {
    const prefixes = framePrefixes(frame, catalogue);
    const property = this.other.property.trim();
    const iri = property === "" ? null : expandIri(prefixes, property);
    if (iri === null) return "Write the property as a compact IRI with a known prefix or in full.";
    const key = compactIri(prefixes, iri);
    const text = this.other.text.trim();
    if (text === "") return "Write the value.";
    switch (this.other.kind) {
      case "thing": {
        const thing = expandIri(prefixes, text);
        return thing === null
          ? "Write the value as a compact IRI with a known prefix or in full."
          : [[key, { id: compactIri(prefixes, thing) }]];
      }
      case "text":
        return [[key, text]];
      case "language": {
        const language = this.other.language.trim();
        return language === ""
          ? "Write the language, as a tag such as en or de."
          : [[key, { "@value": text, "@language": language }]];
      }
      case "date":
        return DATE.test(text)
          ? [[key, { "@value": text, "@type": "xsd:date" }]]
          : "Write the date as YYYY-MM-DD.";
    }
  };

  /**
   * The pairs the choices state: the chosen form of the verb's pattern in
   * the system (the fallback's for an element or a system without a
   * pattern of its own) with the value and the named slots; a type's own
   * pairs; "Other property…"'s pair. Where something is missing, or the
   * pattern does not take the value, the text says so.
   */
  pairs = (catalogue: Catalogue, frame: Frame): readonly Pair[] | string => {
    const verb = this.verb;
    if (verb === null) return "Choose a verb.";
    if (verb.id === OTHER) return this.#other(frame, catalogue);
    const system = this.system;
    if (system === null) return "Choose a vocabulary.";
    const value = this.value;
    if (value === null) return "Choose a value.";
    if (value.kind === "type") return value.pairs;
    const prefixes = framePrefixes(frame, catalogue);
    const iri = valueIri(value);
    let argument: string;
    let label: string | undefined;
    switch (value.kind) {
      case "candidate":
        argument = compactIri(prefixes, value.candidate.iri);
        label = value.candidate.label;
        break;
      case "recognized":
        argument =
          value.recognition.iri === null
            ? value.recognition.value
            : compactIri(prefixes, value.recognition.iri);
        label = value.label ?? undefined;
        break;
      case "element":
        argument = `#${value.id}`;
        break;
      case "literal":
        argument = value.text;
        break;
    }
    const pattern = alternativeAt(catalogue, verb, system.id, this.alternative)?.pattern;
    const slots: Record<string, string> = {};
    for (const name of namedSlots(pattern)) {
      const given = this.slots[name]?.trim() ?? "";
      if (given !== "") slots[name] = given;
      else if (name === "value") {
        const found = iri === null ? null : recognize(catalogue, iri);
        if (found !== null) slots.value = found.value;
      }
    }
    try {
      return instantiate(catalogue, verb.id, patternSystem(catalogue, verb, system.id), argument, {
        alternative: this.alternative,
        ...(label === undefined ? {} : { label }),
        slots,
      });
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };
}
