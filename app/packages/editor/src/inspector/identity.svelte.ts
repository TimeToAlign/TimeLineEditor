/**
 * Who asserts the links the viewer creates: an identity given as a URI
 * (an ORCID iD, for instance), the viewer's own state, never written to the
 * workspace except inside the assertions of the links they create. It is
 * remembered in the browser's `localStorage` under a key the host gives;
 * without a key, or where storage is unavailable, it holds until the
 * editor goes.
 */

/** What the identity dialog answers: the identity given, `null` to go on without one. */
export interface IdentityAnswer {
  readonly uri: string | null;
}

/** The identity remembered under `key`; `null` without a key, without one remembered, or without storage. */
function remembered(key: string | null): string | null {
  if (key === null) return null;
  try {
    const stored = localStorage.getItem(key);
    return stored === null || stored === "" ? null : stored;
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

  /** The identity remembered under `key` (`null` remembers nothing); one remembered counts as answered. */
  constructor(key: string | null) {
    this.#key = key;
    this.uri = remembered(key);
    this.answered = this.uri !== null;
  }

  /** Whether a paste asks for the identity first: nobody was asked yet. */
  get asks(): boolean {
    return !this.answered;
  }

  /** Give the identity (`null`: go on without one), remembered where storage allows. */
  give(uri: string | null): void {
    this.uri = uri;
    this.answered = true;
    if (this.#key === null) return;
    try {
      if (uri === null) localStorage.removeItem(this.#key);
      else localStorage.setItem(this.#key, uri);
    } catch {
      // Without storage the identity holds until the editor goes.
    }
  }
}
