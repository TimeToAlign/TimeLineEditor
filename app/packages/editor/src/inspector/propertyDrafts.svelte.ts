/**
 * The Properties form's state: what was typed into a field and not
 * committed yet, and why a commit was refused. Both belong to the
 * containers they were typed for in the manifest they were typed against:
 * once the form edits other containers, or the block's manifest is
 * replaced (an applied text, an undo), they are gone. The form reads each
 * field's text through `value`, a draft else the value every container
 * shares. A commit that wrote something other than what was typed (a size
 * below its container's minimum) returns a notice saying so, which the form
 * posts as information. The name field's draft and refusal belong to the
 * target named in the manifest it was typed against, alike, and so do the
 * drafts and refusals of a selected elision's fields (`elisions.ts`).
 */

import type { PlaceProperty } from "@timetoalign/tilie-arranger";
import type { Address, BlockId, Manifest, Store } from "@timetoalign/tilie-core";
import { sameAddress } from "@timetoalign/tilie-core";
import type { ElisionField, ElisionForm } from "./elisions.ts";
import { fieldCommand } from "./elisions.ts";
import type { Edit, Geometry, NameField, Role } from "./properties.ts";
import {
  commonValue,
  decimalOf,
  nameCommand,
  propertyCommand,
  STEPS,
  shownValue,
  stepCommand,
  stepValue,
} from "./properties.ts";

/** What drafts belong to: the block, its manifest, the role and the containers edited. */
interface DraftOwner {
  readonly block: BlockId;
  readonly manifest: Manifest;
  readonly role: Role;
  readonly addresses: readonly Address[];
}

type Texts = { readonly [property in PlaceProperty]?: string };

interface Entry {
  readonly owner: DraftOwner | null;
  readonly drafts: Texts;
  readonly problems: Texts;
}

const EMPTY: Entry = { owner: null, drafts: {}, problems: {} };

/** The name field's text and refusal, and the target and manifest they belong to. */
interface NameDraft {
  readonly target: Address;
  readonly manifest: Manifest | null;
  readonly text: string;
  readonly problem: string | undefined;
}

/** The texts typed into a selected elision's fields and their refusals, and what they belong to. */
interface ElisionDraft {
  readonly address: Address;
  readonly manifest: Manifest;
  readonly drafts: { readonly [field in ElisionField]?: string };
  readonly problems: { readonly [field in ElisionField]?: string };
}

/** What dispatching an edit gave: the refusal's message, or the notice of what it wrote. */
interface Dispatched {
  readonly refusal: string | undefined;
  readonly notice: string | null;
}

/** Dispatch an edit's command: the message of its refusal, or of the store's, or its notice. */
function dispatched(edit: Edit, store: Store): Dispatched {
  if (!edit.ok) return { refusal: edit.problems[0]?.message, notice: null };
  const { command, notice } = edit.value;
  const refusal = command === null ? undefined : store.dispatch(command)?.message;
  return refusal === undefined ? { refusal, notice } : { refusal, notice: null };
}

function ownerOf(geometry: Geometry): DraftOwner {
  return {
    block: geometry.block.id,
    manifest: geometry.block.manifest,
    role: geometry.role,
    addresses: geometry.elements.map((element) => element.address),
  };
}

function sameOwner(left: DraftOwner | null, right: DraftOwner): boolean {
  return (
    left !== null &&
    left.block === right.block &&
    left.manifest === right.manifest &&
    left.role === right.role &&
    left.addresses.length === right.addresses.length &&
    left.addresses.every((address, index) => {
      const other = right.addresses[index];
      return other !== undefined && sameAddress(address, other);
    })
  );
}

/** `texts` with `property` set to `text`, or left out for `undefined`. */
function withText(texts: Texts, property: PlaceProperty, text: string | undefined): Texts {
  const { [property]: _dropped, ...rest } = texts;
  return text === undefined ? rest : { ...rest, [property]: text };
}

export class PropertyDrafts {
  #entry: Entry = $state.raw(EMPTY);
  #name: NameDraft | null = $state.raw(null);
  #elision: ElisionDraft | null = $state.raw(null);

  /** The drafts and refusals of `geometry`'s containers; none when they were typed for others. */
  #of(geometry: Geometry): Entry {
    return sameOwner(this.#entry.owner, ownerOf(geometry)) ? this.#entry : EMPTY;
  }

  #write(geometry: Geometry, property: PlaceProperty, draft: string | undefined, problem?: string) {
    const entry = this.#of(geometry);
    this.#entry = {
      owner: ownerOf(geometry),
      drafts: withText(entry.drafts, property, draft),
      problems: withText(entry.problems, property, problem),
    };
  }

  /** Why the last commit of `property` was refused; `undefined` while it was not. */
  problem(geometry: Geometry, property: PlaceProperty): string | undefined {
    return this.#of(geometry).problems[property];
  }

  /**
   * What a field shows: its draft, else the value every edited container
   * shares (stated, else drawn, the live one during a gesture), rounded to
   * two decimals; empty while the containers' values differ.
   */
  value(geometry: Geometry, property: PlaceProperty): string {
    const draft = this.#of(geometry).drafts[property];
    if (draft !== undefined) return draft;
    const value = commonValue(geometry, property);
    return value === undefined ? "" : shownValue(value);
  }

  /** A field's placeholder: "mixed" while the containers differ, "auto" for the box's own size. */
  placeholder(geometry: Geometry, property: PlaceProperty): string | undefined {
    if (commonValue(geometry, property) === undefined) return "mixed";
    return geometry.role === "block" && (property === "width" || property === "height")
      ? "auto"
      : undefined;
  }

  /** Keep `text` as the draft of `property`; its refusal stays until the next commit. */
  type(geometry: Geometry, property: PlaceProperty, text: string): void {
    this.#write(geometry, property, text, this.#of(geometry).problems[property]);
  }

  /** Drop the draft of `property` and its refusal. */
  discard(geometry: Geometry, property: PlaceProperty): void {
    this.#write(geometry, property, undefined);
  }

  /**
   * Commit the draft of `property` as one `set`: dropped once the store
   * accepts it (a draft of the stored value dispatches nothing), kept with
   * the refusal otherwise. Returns the notice of what it wrote, if any.
   */
  commit(geometry: Geometry, property: PlaceProperty, store: Store): string | null {
    const draft = this.#of(geometry).drafts[property];
    if (draft === undefined) return null;
    const { refusal, notice } = dispatched(
      propertyCommand(store.view, geometry, property, draft),
      store,
    );
    this.#write(geometry, property, refusal === undefined ? undefined : draft, refusal);
    return notice;
  }

  /**
   * Commit one step of the property's `STEPS` (`direction` ±1) at once:
   * from the draft when there is one (an empty field counts as 0, a draft
   * that is no number is not stepped), else each container from its own
   * exact value, never from the rounded text the field shows. Returns the
   * notice of what it wrote, if any.
   */
  step(
    geometry: Geometry,
    property: PlaceProperty,
    direction: 1 | -1,
    store: Store,
  ): string | null {
    const draft = this.#of(geometry).drafts[property]?.trim();
    if (draft === undefined) {
      const { refusal, notice } = dispatched(
        stepCommand(store.view, geometry, property, direction),
        store,
      );
      this.#write(geometry, property, undefined, refusal);
      return notice;
    }
    const base = draft === "" ? null : decimalOf(draft);
    if (draft !== "" && base === null) return null;
    this.#write(geometry, property, String(stepValue(base, direction, STEPS[property])));
    return this.commit(geometry, property, store);
  }

  /** The name draft of `field`'s target in its manifest; `null` when it was typed for another. */
  #nameOf(field: NameField): NameDraft | null {
    const draft = this.#name;
    return draft !== null &&
      sameAddress(draft.target, field.target) &&
      draft.manifest === field.manifest
      ? draft
      : null;
  }

  /** What the name field shows: its draft, else the stored name (empty for none). */
  nameValue(field: NameField): string {
    return this.#nameOf(field)?.text ?? field.name ?? "";
  }

  /** Why the last commit of the name was refused; `undefined` while it was not. */
  nameProblem(field: NameField): string | undefined {
    return this.#nameOf(field)?.problem;
  }

  /** Keep `text` as the name's draft; its refusal stays until the next commit. */
  typeName(field: NameField, text: string): void {
    const { target, manifest } = field;
    this.#name = { target, manifest, text, problem: this.#nameOf(field)?.problem };
  }

  /** Drop the name's draft and its refusal. */
  discardName(field: NameField): void {
    if (this.#nameOf(field) !== null) this.#name = null;
  }

  /**
   * Commit the name's draft as one `set`: dropped once the store accepts it
   * (a draft of the stored name dispatches nothing), kept with the refusal
   * otherwise.
   */
  commitName(field: NameField, store: Store): void {
    const draft = this.#nameOf(field);
    if (draft === null) return;
    const command = nameCommand(field, draft.text);
    const problem = command === null ? undefined : store.dispatch(command)?.message;
    this.#name = problem === undefined ? null : { ...draft, problem };
  }

  /** The drafts of `form`'s elision in its manifest; `null` when they were typed for another. */
  #elisionOf(form: ElisionForm): ElisionDraft | null {
    const draft = this.#elision;
    return draft !== null &&
      sameAddress(draft.address, form.address) &&
      draft.manifest === form.block.manifest
      ? draft
      : null;
  }

  #writeElision(form: ElisionForm, field: ElisionField, text?: string, problem?: string): void {
    const draft = this.#elisionOf(form);
    const { [field]: _text, ...drafts } = draft?.drafts ?? {};
    const { [field]: _problem, ...problems } = draft?.problems ?? {};
    this.#elision = {
      address: form.address,
      manifest: form.block.manifest,
      drafts: text === undefined ? drafts : { ...drafts, [field]: text },
      problems: problem === undefined ? problems : { ...problems, [field]: problem },
    };
  }

  /** What an elision's field shows: its draft, else its stored value (a width form's converted one). */
  elisionValue(form: ElisionForm, field: ElisionField): string {
    const draft = this.#elisionOf(form)?.drafts[field];
    if (draft !== undefined) return draft;
    return field === "start" || field === "end" ? form[field] : form.widths[field];
  }

  /** Why the last commit of an elision's field was refused; `undefined` while it was not. */
  elisionProblem(form: ElisionForm, field: ElisionField): string | undefined {
    return this.#elisionOf(form)?.problems[field];
  }

  /** Keep `text` as the draft of an elision's field; its refusal stays until the next commit. */
  typeElision(form: ElisionForm, field: ElisionField, text: string): void {
    this.#writeElision(form, field, text, this.elisionProblem(form, field));
  }

  /** Drop the draft of an elision's field and its refusal. */
  discardElision(form: ElisionForm, field: ElisionField): void {
    this.#writeElision(form, field);
  }

  /**
   * Commit the draft of an elision's field as one command (`fieldCommand`):
   * dropped once the store accepts it (a draft of the stored value
   * dispatches nothing), kept with the refusal otherwise.
   */
  commitElision(form: ElisionForm, field: ElisionField, store: Store): void {
    const draft = this.#elisionOf(form)?.drafts[field];
    if (draft === undefined) return;
    const edit = fieldCommand(form, field, draft);
    const refusal = !edit.ok
      ? edit.problems[0]?.message
      : edit.value === null
        ? undefined
        : store.dispatch(edit.value)?.message;
    if (refusal === undefined) this.#writeElision(form, field);
    else this.#writeElision(form, field, draft, refusal);
  }
}
