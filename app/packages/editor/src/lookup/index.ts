/**
 * Looking values up: one `Lookup` over the services a statement's value
 * may come from. Wikidata, the GND (through lobid) and YouTube (oEmbed)
 * are asked from the browser; MusicBrainz only through `tilie-server`,
 * reached by its Reconciliation Service API endpoint.
 *
 * | System | Searches | Resolves |
 * | --- | --- | --- |
 * | `wikidata` | every kind | yes |
 * | `gnd` | work, agent | yes |
 * | `musicbrainz`, with a server | work, agent, recording, release | yes |
 * | `youtube` | nothing | yes |
 *
 * Every other system is neither searched nor resolved, and asking it sends
 * no request.
 */

import type { ConnectOptions } from "@timetoalign/tilie-client";
import { type Catalogue, defaultCatalogue } from "@timetoalign/timetoshare";
import { createContext } from "svelte";
import { resolveGnd, searchGnd } from "./gnd.ts";
import { type Candidate, GND_FILTERS, type LookupContext, type ValueKind } from "./kinds.ts";
import {
  musicbrainzClient,
  reconcileMusicBrainz,
  resolveMusicBrainz,
  searchMusicBrainz,
} from "./musicbrainz.ts";
import { resolveWikidata, searchWikidata } from "./wikidata.ts";
import { resolveYoutube } from "./youtube.ts";

export {
  type Candidate,
  type CrossReference,
  LookupError,
  type LookupErrorCode,
  VALUE_KINDS,
  type ValueKind,
} from "./kinds.ts";
export {
  type ExtendValue,
  type ReconciliationCandidate,
  ReconciliationClient,
  type ReconciliationOptions,
  type ReconciliationQuery,
  type ReconciliationType,
  type ServiceManifest,
  type ServicePath,
  type Suggestion,
} from "./reconciliation.ts";

/** The services a statement's value is looked up in. */
export interface Lookup {
  /** Whether `search` asks `system` for things of `kind`. */
  searchable(system: string, kind: ValueKind): boolean;
  /** Whether `resolve` asks `system`. */
  resolvable(system: string): boolean;
  /**
   * The things of `kind` that `system` finds for `text`, in the service's
   * order, without cross-references; `[]` without a request where the
   * system is not searchable for the kind or the text is blank.
   *
   * @throws LookupError When the service does not answer as asked; an
   *   aborted request rejects with the signal's reason instead.
   */
  search(
    system: string,
    kind: ValueKind,
    text: string,
    signal?: AbortSignal,
  ): Promise<readonly Candidate[]>;
  /**
   * The thing an IRI names in `system`, with its cross-references; `null`
   * without a request where the system is not resolvable or the IRI is
   * none of its things, and `null` for a video oEmbed does not describe.
   *
   * @throws LookupError As `search`.
   */
  resolve(system: string, iri: string, signal?: AbortSignal): Promise<Candidate | null>;
  /**
   * The best candidate for each text, `null` where none is found: one
   * request for all texts at MusicBrainz (with its `match`), one search per
   * text elsewhere (`match` false).
   *
   * @throws LookupError As `search`.
   */
  reconcile(
    system: string,
    kind: ValueKind,
    texts: readonly string[],
    signal?: AbortSignal,
  ): Promise<readonly (Candidate | null)[]>;
}

export interface LookupOptions {
  /** The fetch to send requests with; the global one by default. */
  readonly fetch?: typeof fetch;
  /** The server MusicBrainz is reached through; `null` leaves MusicBrainz out. */
  readonly server: ConnectOptions | null;
  /** The language of labels and descriptions; `"en"` by default. */
  readonly language?: string;
  /** The catalogue that recognises IRIs; the default catalogue by default. */
  readonly catalogue?: Catalogue;
}

/** The kinds a system searches. */
function searchesKind(system: string, kind: ValueKind, server: boolean): boolean {
  switch (system) {
    case "wikidata":
      return true;
    case "gnd":
      return GND_FILTERS[kind] !== undefined;
    case "musicbrainz":
      return server && kind !== "class" && kind !== "any";
    default:
      return false;
  }
}

/** The lookup of the services `options` reach. */
export function createLookup(options: LookupOptions): Lookup {
  const context: LookupContext = {
    fetch: options.fetch ?? ((input, init) => globalThis.fetch(input, init)),
    language: options.language ?? "en",
    catalogue: options.catalogue ?? defaultCatalogue(),
  };
  const musicbrainz =
    options.server === null ? null : musicbrainzClient(options.server, context.fetch);

  const lookup: Lookup = {
    searchable: (system, kind) => searchesKind(system, kind, musicbrainz !== null),
    resolvable: (system) =>
      system === "wikidata" ||
      system === "gnd" ||
      system === "youtube" ||
      (system === "musicbrainz" && musicbrainz !== null),
    async search(system, kind, text, signal) {
      if (!lookup.searchable(system, kind)) return [];
      if (system === "wikidata") return searchWikidata(context, kind, text, signal);
      if (system === "gnd") return searchGnd(context, kind, text, signal);
      if (musicbrainz !== null) return searchMusicBrainz(musicbrainz, kind, text, signal);
      return [];
    },
    async resolve(system, iri, signal) {
      if (system === "wikidata") return resolveWikidata(context, iri, signal);
      if (system === "gnd") return resolveGnd(context, iri, signal);
      if (system === "youtube") return resolveYoutube(context, iri, signal);
      if (system === "musicbrainz" && musicbrainz !== null) {
        return resolveMusicBrainz(context, musicbrainz, iri, signal);
      }
      return null;
    },
    async reconcile(system, kind, texts, signal) {
      if (!lookup.searchable(system, kind)) return texts.map(() => null);
      if (system === "musicbrainz" && musicbrainz !== null) {
        return reconcileMusicBrainz(musicbrainz, kind, texts, signal);
      }
      const best: (Candidate | null)[] = [];
      for (const text of texts) {
        best.push((await lookup.search(system, kind, text, signal))[0] ?? null);
      }
      return best;
    },
  };
  return lookup;
}

/** The lookup of an editor that looks nothing up: nothing searchable or resolvable, no request. */
export const NO_LOOKUP: Lookup = {
  searchable: () => false,
  resolvable: () => false,
  search: async () => [],
  resolve: async () => null,
  reconcile: async (_system, _kind, texts) => texts.map(() => null),
};

/** The lookup a component reads from its context, and the call that provides it. */
export const [lookupOf, provideLookup] = createContext<Lookup>();
