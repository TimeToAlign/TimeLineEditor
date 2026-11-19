/**
 * The person using the editor: a name, which the journal records as the
 * author of every command, and an optional ORCID iD, which names them in the
 * provenance of what they state. The user belongs to whoever views the
 * workspace, never to the workspace: no setting and no command holds it.
 */

import { DEFAULT_AUTHOR } from "./store.ts";

/** A user: a name and, optionally, the bare ORCID iD (`0000-0002-1825-0097`). */
export interface User {
  readonly name: string;
  readonly orcid: string | null;
}

/** The user before anyone gives a name: the journal's default author, without an iD. */
export const DEFAULT_USER: User = { name: DEFAULT_AUTHOR, orcid: null };

/** The IRI stating what the editor itself proposes, as `stated_by` of a provenance entry. */
export const TILIE_AGENT = "https://github.com/TimeToAlign/TimeLineEditor";

/** The beginning of the tag IRI naming a user without an ORCID iD, followed by the encoded name. */
export const USER_TAG = "tag:timetoalign.github.io,2026:tilie:user:";

const ORCID_PREFIXES = ["https://orcid.org/", "http://orcid.org/", "orcid.org/"];
const ORCID = /^(\d{4})-(\d{4})-(\d{4})-(\d{3}[\dX])$/u;

/** The ISO 7064 MOD 11-2 check character of the fifteen digits `digits`. */
function checkCharacter(digits: string): string {
  let total = 0;
  for (const digit of digits) total = (total + Number(digit)) * 2;
  const result = (12 - (total % 11)) % 11;
  return result === 10 ? "X" : String(result);
}

/**
 * The bare ORCID iD `text` gives: the iD itself (`0000-0002-1825-0097`) or
 * its address (`https://orcid.org/…`, `http://orcid.org/…`, `orcid.org/…`),
 * white space around it trimmed, its check character verified; `null` for
 * any other text.
 */
export function readOrcid(text: string): string | null {
  let rest = text.trim();
  const prefix = ORCID_PREFIXES.find((item) => rest.startsWith(item));
  if (prefix !== undefined) rest = rest.slice(prefix.length);
  const match = ORCID.exec(rest);
  if (match === null) return null;
  const digits = match.slice(1).join("");
  return checkCharacter(digits.slice(0, 15)) === digits.slice(15) ? rest : null;
}

/**
 * The IRI naming `user` as `stated_by` of what they state: their ORCID iD's
 * address, else a tag IRI holding their name (a name is no IRI).
 */
export function statedBy(user: User): string {
  return user.orcid === null
    ? USER_TAG + encodeURIComponent(user.name)
    : `https://orcid.org/${user.orcid}`;
}
