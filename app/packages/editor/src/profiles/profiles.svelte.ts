/**
 * The viewer's type profiles, kept in the browser: one state per page,
 * read from `localStorage` under `PROFILES_KEY` (the profile file's
 * canonical YAML) when the editor's code is loaded. A stored text that is
 * no profile file, or storage that is unavailable, gives no profiles; a
 * change then holds until the page goes. Never part of a workspace or a
 * manifest.
 *
 * The page's state is made when this module is evaluated, never on first
 * use: state made while a `$derived` runs belongs to that derived, which
 * would then not follow its changes.
 */

import { defaultCatalogue } from "@timetoalign/timetoshare";
import type { Profiles } from "./profiles.ts";
import { NO_PROFILES, PROFILES_KEY, parseProfiles, profilesText } from "./profiles.ts";

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

export class ProfilesState {
  /** The profiles and services in force; replaced whole, never mutated. */
  profiles: Profiles = $state.raw(NO_PROFILES);
  readonly #key: string;

  /** The profiles stored under `key`; none without. */
  constructor(key: string = PROFILES_KEY) {
    this.#key = key;
    this.profiles = stored(key) ?? NO_PROFILES;
  }

  /** Read the profiles stored again, dropping what was set without storage. */
  reload(): void {
    this.profiles = stored(this.#key) ?? NO_PROFILES;
  }

  /** Make `profiles` the profiles in force, remembered where storage allows. */
  set(profiles: Profiles): void {
    this.profiles = profiles;
    try {
      localStorage.setItem(this.#key, profilesText(profiles));
    } catch {
      // Without storage the profiles hold until the page goes.
    }
  }
}

const page = new ProfilesState();

/** The page's profiles. */
export function profilesState(): ProfilesState {
  return page;
}

/** Read the page's profiles from storage again, as a new page would (for tests). */
export function resetProfiles(): void {
  page.reload();
}
