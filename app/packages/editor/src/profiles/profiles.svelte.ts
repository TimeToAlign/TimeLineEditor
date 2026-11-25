/**
 * The viewer's type profiles in one editor: a state the editor makes from
 * its storage options and gives every part through context. With a key it
 * reads `localStorage[key]` (the profile file's canonical YAML) when it is
 * made and writes there on every change; a stored text that is no profile
 * file, or storage that is unavailable, gives no profiles. Without a key it
 * never touches storage: the profiles hold until the editor goes. Never part
 * of a workspace or a manifest.
 */

import type { Catalogue } from "@timetoalign/timetoshare";
import { defaultCatalogue } from "@timetoalign/timetoshare";
import { createContext } from "svelte";
import type { Profiles } from "./profiles.ts";
import { NO_PROFILES, parseProfiles, profilesText, withProfiles } from "./profiles.ts";

/** The profiles stored under `key`, or `null` when none are, or what is stored is no profile file. */
function stored(key: string): Profiles | null {
  try {
    const text = localStorage.getItem(key);
    if (text === null) return null;
    const read = parseProfiles(text, defaultCatalogue());
    return typeof read === "string" ? null : read;
  } catch {
    return null;
  }
}

/** The viewer's type profiles and the catalogue they extend, as Svelte state. */
export class ProfilesState {
  /** The profiles and services in force; replaced whole, never mutated. */
  profiles: Profiles = $state.raw(NO_PROFILES);
  /**
   * The catalogue the Metadata tab offers: the shipped one with these
   * profiles (`withProfiles`), made again only when they change.
   */
  readonly catalogue: Catalogue = $derived(withProfiles(defaultCatalogue(), this.profiles));
  readonly #key: string | null;

  /** The profiles stored under `key`; none without a key, and storage is then never touched. */
  constructor(key: string | null) {
    this.#key = key;
    if (key !== null) this.profiles = stored(key) ?? NO_PROFILES;
  }

  /** Make `profiles` the profiles in force, remembered under the key where storage allows. */
  set(profiles: Profiles): void {
    this.profiles = profiles;
    if (this.#key === null) return;
    try {
      localStorage.setItem(this.#key, profilesText(profiles));
    } catch {
      // Without storage the profiles hold until the editor goes.
    }
  }
}

/** The editor's profiles, read from its context, and the call that provides them. */
export const [profilesOf, provideProfiles] = createContext<ProfilesState>();
