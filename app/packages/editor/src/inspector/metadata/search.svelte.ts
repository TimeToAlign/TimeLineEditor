/**
 * The Value field's search: the text typed, the candidates the lookup
 * found for it, whether a search runs and why the last one failed. Typing
 * is `input`, the setter of the field's function binding: it waits `delay`
 * milliseconds for more typing, aborts the request it replaces and asks the
 * lookup only where the system searches the verb's kind of value.
 */

import type { Candidate, Lookup, ValueKind } from "../../lookup/index.ts";
import { CATALOGUE, systemChoice } from "./catalogue.ts";

/** What is searched: a system and the kind of value the verb takes; `null` searches nothing. */
export type Query = { readonly system: string; readonly kind: ValueKind } | null;

/** The message of anything thrown. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class Search {
  /** The field's text. */
  text = $state("");
  /** The candidates found for the text last searched. */
  results: readonly Candidate[] = $state.raw([]);
  /** Whether a search is waiting or running. */
  loading = $state(false);
  /** Why the last search failed, in words; `null` when it did not. */
  error: string | null = $state(null);

  readonly #lookup: Lookup;
  readonly #query: () => Query;
  readonly #delay: number;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #controller: AbortController | null = null;

  constructor(lookup: Lookup, query: () => Query, delay = 250) {
    this.#lookup = lookup;
    this.#query = query;
    this.#delay = delay;
  }

  /** Stop what waits or runs. */
  #stop(): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
    this.#controller?.abort();
    this.#controller = null;
  }

  /** The text typed: search for it after the delay, unless nothing is to be searched. */
  input = (text: string): void => {
    this.text = text;
    this.#stop();
    const query = this.#query();
    const searched =
      query !== null && text.trim() !== "" && this.#lookup.searchable(query.system, query.kind);
    this.error = null;
    if (!searched) {
      this.results = [];
      this.loading = false;
      return;
    }
    this.loading = true;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      const controller = new AbortController();
      this.#controller = controller;
      this.#lookup.search(query.system, query.kind, text.trim(), controller.signal).then(
        (found) => {
          if (controller.signal.aborted) return;
          this.results = found;
          this.loading = false;
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          this.results = [];
          this.loading = false;
          this.error = `${systemChoice(CATALOGUE, query.system).label} could not be searched: ${messageOf(error)}`;
        },
      );
    }, this.#delay);
  };

  /** Stop searching; the search is not used afterwards. */
  dispose(): void {
    this.#stop();
  }
}
