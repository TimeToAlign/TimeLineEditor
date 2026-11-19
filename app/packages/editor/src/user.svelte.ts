/**
 * The one user of the editor: the name the journal records as each entry's
 * author and, with an ORCID iD where given, the IRI that states what the
 * user states in the Metadata tab (core's `statedBy`). It belongs to the
 * viewer, never to a workspace: it is remembered in the browser's
 * `localStorage` under a key the host gives, as JSON `{name, orcid}`; a
 * stored text that is not that, no key, or storage that is unavailable
 * gives the default user, and a change then holds until the editor goes.
 */

import type { User } from "@timetoalign/tilie-core";
import { DEFAULT_USER, readOrcid, statedBy } from "@timetoalign/tilie-core";
import { createContext } from "svelte";

/** The user stored under `key`, or `null` without a key, a stored user or storage. */
function stored(key: string | null): User | null {
  if (key === null) return null;
  try {
    const text = localStorage.getItem(key);
    if (text === null) return null;
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null) return null;
    const { name, orcid } = value as { name?: unknown; orcid?: unknown };
    if (typeof name !== "string" || name.trim() === "") return null;
    if (orcid === null) return { name, orcid: null };
    if (typeof orcid !== "string") return null;
    const read = readOrcid(orcid);
    return read === null ? null : { name, orcid: read };
  } catch {
    return null;
  }
}

export class UserState {
  /** The user's name: the journal's author, and the words of what they state. */
  name: string = $state(DEFAULT_USER.name);
  /** The user's bare ORCID iD; `null` without one. */
  orcid: string | null = $state(null);
  readonly #key: string | null;

  /** The user stored under `key` (`null` stores nothing); the default user without one. */
  constructor(key: string | null) {
    this.#key = key;
    const user = stored(key) ?? DEFAULT_USER;
    this.name = user.name;
    this.orcid = user.orcid;
  }

  get user(): User {
    return { name: this.name, orcid: this.orcid };
  }

  /** The IRI that states what the user states. */
  get statedBy(): string {
    return statedBy(this.user);
  }

  /** Make `user` the user, remembered where storage allows. */
  set(user: User): void {
    this.name = user.name;
    this.orcid = user.orcid;
    if (this.#key === null) return;
    try {
      localStorage.setItem(this.#key, JSON.stringify({ name: user.name, orcid: user.orcid }));
    } catch {
      // Without storage the user holds until the editor goes.
    }
  }
}

/** The user and the question that changes it, for every part of the editor. */
export interface UserContext {
  readonly state: UserState;
  /** Ask for the user's name and iD ("Your name"); a saved answer becomes the user and the journal's author. */
  ask(): Promise<void>;
}

export const [userOf, provideUser] = createContext<UserContext>();
