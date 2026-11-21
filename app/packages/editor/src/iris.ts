/**
 * How the editor shows an IRI: as a slug, `prefix:local`, like every other
 * ID, wherever it knows the identifier system or the namespace; the full
 * IRI goes on hover and into copies. The systems are the catalogue's (its
 * things, recognised by their URL patterns) and the namespaces those the
 * catalogue and the manifest's `@context` declare. An IRI neither knows is
 * shown as written.
 */

import type { Catalogue } from "@timetoalign/timetoshare";
import { compactIri, expandIri, isJsonObject, recognize } from "@timetoalign/timetoshare";

/**
 * The slug word of a system whose things have no prefix of their own: an
 * MBID names every MusicBrainz entity. A system not listed here, without a
 * thing prefix, is written by its catalogue ID (`youtube:`, `doi:`).
 */
export const SLUG_WORDS: Readonly<Record<string, string>> = { musicbrainz: "mbid" };

/** What `shownIri` reads an IRI with: the catalogue, a manifest's `@context`, and the namespaces of both. */
export interface IriNames {
  readonly catalogue: Catalogue;
  /** The manifest's `@context`, under which a compact IRI as written is expanded. */
  readonly context: unknown;
  /** The catalogue's prefixes overlaid with those `context` declares (`prefixesOf`). */
  readonly prefixes: Readonly<Record<string, string>>;
}

/** An IRI as shown: its text, and the full IRI where the text is not it (hover and copy); `null` else. */
export interface ShownIri {
  readonly text: string;
  readonly iri: string | null;
}

/** The prefixes of the catalogue and those `context` declares (namespaces ending in `/` or `#`). */
export function prefixesOf(
  catalogue: Catalogue,
  context: unknown,
): Readonly<Record<string, string>> {
  const own: Record<string, string> = {};
  if (isJsonObject(context)) {
    for (const [prefix, namespace] of Object.entries(context)) {
      if (typeof namespace === "string" && /[/#]$/u.test(namespace) && !prefix.startsWith("@")) {
        own[prefix] = namespace;
      }
    }
  }
  return { ...catalogue.prefixes, ...own };
}

/** The names IRIs are shown with under `catalogue` and a manifest's `context`. */
export function iriNames(catalogue: Catalogue, context: unknown): IriNames {
  return { catalogue, context, prefixes: prefixesOf(catalogue, context) };
}

/** The slug of an absolute IRI, or the IRI itself: a recognised thing's, else a namespace's. */
function slugOf(names: IriNames, iri: string): string {
  const recognition = recognize(names.catalogue, iri);
  if (recognition !== null) {
    const system = names.catalogue.systems.find((item) => item.id === recognition.system);
    const thing = system?.things.find((item) => item.id === recognition.thing);
    const word = thing?.prefix ?? SLUG_WORDS[recognition.system] ?? recognition.system;
    return `${word}:${recognition.value}`;
  }
  return compactIri(names.prefixes, iri, names.catalogue.aliases);
}

/**
 * `written`, an IRI or a compact IRI as a file writes it, as the editor
 * shows it: a compact IRI as written; an absolute IRI as `prefix:local`
 * where it is a thing of a catalogue system (the thing's prefix, else the
 * system's slug word, `SLUG_WORDS`, else the system's ID, before the value
 * the system recognises), else where a namespace of `names` holds it, else
 * as written. The full IRI comes along wherever the text is not it; any
 * other text (a name, a literal, `#id`) is shown as written, with none.
 */
export function shownIri(names: IriNames, written: string): ShownIri {
  const iri = expandIri(names.context, written) ?? expandIri(names.prefixes, written);
  if (iri === null) return { text: written, iri: null };
  const text = iri === written ? slugOf(names, iri) : written;
  return { text, iri: text === iri ? null : iri };
}
