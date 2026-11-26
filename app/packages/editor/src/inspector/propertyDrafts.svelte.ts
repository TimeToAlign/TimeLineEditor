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
 * drafts and refusals of the fields of one element at an address: a
 * selected elision's (`elisions.ts`), a root's Proportion, a region's name,
 * start and end in the Regions tab (`regions.ts`). It
 * also keeps which blocks of the Elisions tab are open, by the key the tab
 * gives each block, so that a block opened stays open while another tab
 * is shown or the inspector is closed.
 */

import type { PlaceProperty } from "@timetoalign/tilie-arranger";
import type { Address, BlockId, Command, Manifest, Store } from "@timetoalign/tilie-core";
import { sameAddress } from "@timetoalign/tilie-core";
import type { ElisionField } from "./elisions.ts";
import type { Result } from "./problems.ts";
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

/** A field of one element at an address: a selected elision's, a root's Proportion, a region's name. */
export type DraftField = ElisionField | "proportion" | "name";

/** What a field's draft belongs to: an address in the manifest they were typed against. */
export interface FieldOwner {
  readonly address: Address;
  readonly manifest: Manifest;
}

/** The texts typed into the fields of one address and their refusals, and what they belong to. */
interface FieldDraft extends FieldOwner {
  readonly drafts: { readonly [field in DraftField]?: string };
  readonly problems: { readonly [field in DraftField]?: string };
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

/** The drafts and refusals of the Properties, Elisions and Regions tabs, and the open blocks of the Elisions tab. */
export class PropertyDrafts {
  #entry: Entry = $state.raw(EMPTY);
  #name: NameDraft | null = $state.raw(null);
  #field: FieldDraft | null = $state.raw(null);
  #opened: { readonly [key: string]: boolean } = $state.raw({});

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

  /** The drafts of `owner` in its manifest; `null` when they were typed for another. */
  #fieldOf(owner: FieldOwner): FieldDraft | null {
    const draft = this.#field;
    return draft !== null &&
      sameAddress(draft.address, owner.address) &&
      draft.manifest === owner.manifest
      ? draft
      : null;
  }

  #writeField(owner: FieldOwner, field: DraftField, text?: string, problem?: string): void {
    const draft = this.#fieldOf(owner);
    const { [field]: _text, ...drafts } = draft?.drafts ?? {};
    const { [field]: _problem, ...problems } = draft?.problems ?? {};
    this.#field = {
      address: owner.address,
      manifest: owner.manifest,
      drafts: text === undefined ? drafts : { ...drafts, [field]: text },
      problems: problem === undefined ? problems : { ...problems, [field]: problem },
    };
  }

  /** What a field shows: its draft, else `stored`, the text of the value it holds. */
  fieldValue(owner: FieldOwner, field: DraftField, stored: string): string {
    return this.#fieldOf(owner)?.drafts[field] ?? stored;
  }

  /** Why the last commit of a field was refused; `undefined` while it was not. */
  fieldProblem(owner: FieldOwner, field: DraftField): string | undefined {
    return this.#fieldOf(owner)?.problems[field];
  }

  /** Keep `text` as the draft of a field; its refusal stays until the next commit. */
  typeField(owner: FieldOwner, field: DraftField, text: string): void {
    this.#writeField(owner, field, text, this.fieldProblem(owner, field));
  }

  /** Drop the draft of a field and its refusal. */
  discardField(owner: FieldOwner, field: DraftField): void {
    this.#writeField(owner, field);
  }

  /**
   * Commit the draft of a field as the one command `edit` makes of
   * it: dropped once the store accepts it (a draft of the stored value
   * dispatches nothing), kept with the refusal otherwise.
   */
  commitField(
    owner: FieldOwner,
    field: DraftField,
    store: Store,
    edit: (text: string) => Result<Command | null>,
  ): void {
    const draft = this.#fieldOf(owner)?.drafts[field];
    if (draft === undefined) return;
    const made = edit(draft);
    const refusal = !made.ok
      ? made.problems[0]?.message
      : made.value === null
        ? undefined
        : store.dispatch(made.value)?.message;
    if (refusal === undefined) this.#writeField(owner, field);
    else this.#writeField(owner, field, draft, refusal);
  }

  /** Whether the Elisions tab's block of `key` is open: as it was last shown or hidden, else `byDefault`. */
  opened(key: string, byDefault: boolean): boolean {
    return this.#opened[key] ?? byDefault;
  }

  /** Keep the block of `key` open or closed. */
  open(key: string, open: boolean): void {
    this.#opened = { ...this.#opened, [key]: open };
  }
}
