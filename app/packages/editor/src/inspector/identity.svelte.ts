/**
 * Who asserts the links the viewer creates: an identity given as a URI
 * (an ORCID iD, for instance), the viewer's own state, never written to the
 * workspace except inside the assertions of the links they create. It is
 * remembered in the browser's `localStorage` under a key the host gives:
 * the URI, or `NO_IDENTITY` for a viewer who chose to go on without one, so
 * that neither is asked again; nothing stored means never asked. A stored
 * text that is no URI, as the dialog reads one, is asked for again. Without
 * a key, or where storage is unavailable, the answer holds until the editor
 * goes.
 */

import { isUri } from "./metadata.ts";

/** What the identity dialog answers: the identity given, `null` to go on without one. */
export interface IdentityAnswer {
  readonly uri: string | null;
}

/** What is stored for a viewer who chose to go on without an identity; no URI reads so. */
export const NO_IDENTITY = "none";

/** The answer remembered under `key`; `null` without a key, without one remembered, or without storage. */
function remembered(key: string | null): IdentityAnswer | null {
  if (key === null) return null;
  try {
    const stored = localStorage.getItem(key);
    if (stored === NO_IDENTITY) return { uri: null };
    return stored !== null && isUri(stored) ? { uri: stored } : null;
  } catch {
    return null;
  }
}

/** The viewer's identity and whether they were asked for it. */
export class Identity {
  /** The identity, a URI; `null` while none is given. */
  uri: string | null = $state(null);
  /** Whether the viewer was asked and answered, giving one or going on without. */
  answered = $state(false);
  readonly #key: string | null;

  /** The answer remembered under `key` (`null` remembers nothing); one remembered counts as answered. */
  constructor(key: string | null) {
    this.#key = key;
    const answer = remembered(key);
    this.uri = answer?.uri ?? null;
    this.answered = answer !== null;
  }

  /** Whether a change asks for the identity first: nobody was asked yet. */
  get asks(): boolean {
    return !this.answered;
  }

  /** Give the identity (`null`: go on without one), remembered where storage allows. */
  give(uri: string | null): void {
    this.uri = uri;
    this.answered = true;
    if (this.#key === null) return;
    try {
      localStorage.setItem(this.#key, uri ?? NO_IDENTITY);
    } catch {
      // Without storage the answer holds until the editor goes.
    }
  }
}
