/**
 * The texts typed into a stamp tab's fields and the refusals shown at its
 * controls, both by key (`name`, a value row's key, a control's word), held
 * for the stamp they were typed for: once the tab shows another timestamp
 * or MatchStamp, none is shown. One object per tab, read by each of its
 * sections, so that a refusal shows at the control that caused it.
 */

import type { Problem } from "@timetoalign/tilie-core";

/** Texts by key. */
export type Texts = { readonly [key: string]: string };

const NONE: Texts = {};

function without(texts: Texts, key: string): Texts {
  const { [key]: _, ...rest } = texts;
  return rest;
}

export class StampDrafts<Owner> {
  readonly #owner: () => Owner;
  #typed: { readonly owner: Owner | undefined; readonly drafts: Texts; readonly problems: Texts } =
    $state.raw({ owner: undefined, drafts: NONE, problems: NONE });

  /** `owner` gives the stamp shown now, compared by identity. */
  constructor(owner: () => Owner) {
    this.#owner = owner;
  }

  /** The texts typed for the stamp shown, by key. */
  get drafts(): Texts {
    return this.#typed.owner === this.#owner() ? this.#typed.drafts : NONE;
  }

  /** The refusals shown for the stamp shown, by key. */
  get problems(): Texts {
    return this.#typed.owner === this.#owner() ? this.#typed.problems : NONE;
  }

  #set(drafts: Texts, problems: Texts): void {
    this.#typed = { owner: this.#owner(), drafts, problems };
  }

  /** `text` typed at `key`: kept, and its refusal dropped. */
  draft(key: string, text: string): void {
    this.#set({ ...this.drafts, [key]: text }, without(this.problems, key));
  }

  /** Drop the draft and the refusal of `key`: the field shows what is stored again. */
  settled(key: string): void {
    this.#set(without(this.drafts, key), without(this.problems, key));
  }

  /** Keep the draft of `key` and show why it was refused. */
  refused(key: string, message: string): void {
    this.#set(this.drafts, { ...this.problems, [key]: message });
  }

  /** Drop the draft of `key`, the stored value shown again, and say why at it. */
  reverted(key: string, message: string): void {
    this.#set(without(this.drafts, key), { ...this.problems, [key]: message });
  }

  /** Run `dispatch`; its refusal is shown at `key`, an acceptance settles it. Whether it was accepted. */
  send(key: string, dispatch: () => Problem | null): boolean {
    const refusal = dispatch();
    if (refusal === null) this.settled(key);
    else this.refused(key, refusal.message);
    return refusal === null;
  }
}
