/**
 * The Properties form's state: what was typed into a field and not
 * committed yet, and why a commit was refused. Both belong to the
 * containers they were typed for in the manifest they were typed against:
 * once the form edits other containers, or the block's manifest is
 * replaced (an applied text, an undo), they are gone. The form reads each
 * field's text through `value`, a draft else the value every container
 * shares.
 */

import type { PlaceProperty } from "@timetoalign/tilie-arranger";
import type { BlockId, Manifest, Store } from "@timetoalign/tilie-core";
import type { Edit, Geometry, Role } from "./properties.ts";
import {
  commonValue,
  decimalOf,
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
  readonly addresses: readonly string[];
}

type Texts = { readonly [property in PlaceProperty]?: string };

interface Entry {
  readonly owner: DraftOwner | null;
  readonly drafts: Texts;
  readonly problems: Texts;
}

const EMPTY: Entry = { owner: null, drafts: {}, problems: {} };

/** Dispatch an edit's command; the message of its refusal, or of the store's, else `undefined`. */
function dispatched(edit: Edit, store: Store): string | undefined {
  if (!edit.ok) return edit.problems[0]?.message;
  return edit.value === null ? undefined : store.dispatch(edit.value)?.message;
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
    left.addresses.every((address, index) => address === right.addresses[index])
  );
}

/** `texts` with `property` set to `text`, or left out for `undefined`. */
function withText(texts: Texts, property: PlaceProperty, text: string | undefined): Texts {
  const { [property]: _dropped, ...rest } = texts;
  return text === undefined ? rest : { ...rest, [property]: text };
}

export class PropertyDrafts {
  #entry: Entry = $state.raw(EMPTY);

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
    return geometry.role === "box" && (property === "width" || property === "height")
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
   * the refusal otherwise.
   */
  commit(geometry: Geometry, property: PlaceProperty, store: Store): void {
    const draft = this.#of(geometry).drafts[property];
    if (draft === undefined) return;
    const refusal = dispatched(propertyCommand(store.view, geometry, property, draft), store);
    this.#write(geometry, property, refusal === undefined ? undefined : draft, refusal);
  }

  /**
   * Commit one step of the property's `STEPS` (`direction` ±1) at once:
   * from the draft when there is one (an empty field counts as 0, a draft
   * that is no number is not stepped), else each container from its own
   * exact value, never from the rounded text the field shows.
   */
  step(geometry: Geometry, property: PlaceProperty, direction: 1 | -1, store: Store): void {
    const draft = this.#of(geometry).drafts[property]?.trim();
    if (draft === undefined) {
      const refusal = dispatched(stepCommand(store.view, geometry, property, direction), store);
      this.#write(geometry, property, undefined, refusal);
      return;
    }
    const base = draft === "" ? null : decimalOf(draft);
    if (draft !== "" && base === null) return;
    this.#write(geometry, property, String(stepValue(base, direction, STEPS[property])));
    this.commit(geometry, property, store);
  }
}
