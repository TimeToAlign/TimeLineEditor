/**
 * The words the editor names things with: the levels of the canvas, the
 * kinds of bands and listed elements, the name an editor's target goes by,
 * the level panel's title, and the subject the inspector names beside its
 * heading. Presentation only: what an
 * address names is core's resolver's to decide; this module only words it.
 */

import type { Level } from "@timetoalign/tilie-arranger";
import type {
  Address,
  BandKind,
  EntryKind,
  Manifest,
  OpenEditor,
  ResolvedAddress,
  View,
} from "@timetoalign/tilie-core";
import { isCommandError, resolveAddress } from "@timetoalign/tilie-core";

/** The word of each level of the canvas, on the level tab and its title line. */
const LEVEL_WORDS: { readonly [level in Level]: string } = {
  arranger: "Arranger",
  bundle: "Bundle",
  group: "Group",
  timeline: "Timeline",
};

/** The word of a level, capitalised: `Arranger`, `Bundle`, `Group`, `Timeline`. */
export function levelWord(level: Level): string {
  return LEVEL_WORDS[level];
}

/** The word of each kind of band, in its heading and its rows. */
const BAND_WORDS: { readonly [kind in BandKind]: string } = {
  markers: "Markers",
  conversion_maps: "Conversion maps",
  children: "Children",
  regions: "Regions",
  flow_control: "Flow control",
};

/** The word of a band's kind, capitalised: `Markers`, `Conversion maps`, … */
export function bandWord(kind: BandKind): string {
  return BAND_WORDS[kind];
}

/** The word of each kind of element a timeline holds in a list. */
const ENTRY_WORDS: { readonly [kind in EntryKind]: string } = {
  map: "conversion map",
  region: "region",
  break: "break",
  jump: "jump",
  marker: "marker",
};

/** What a bundle is called that has neither a `name` nor an `id`. */
const ANONYMOUS_BUNDLE_NAME = "Anonymous bundle";

/**
 * The name an editor's target goes by: a bundle's manifest `name`, else its
 * `id`, else "Anonymous bundle"; a group's or timeline's `name`, else its
 * id. A target the view does not hold goes by its address.
 */
export function editorName(view: View, target: Address): string {
  const resolved = resolveAddress(view, target);
  if (isCommandError(resolved)) return target;
  switch (resolved.kind) {
    case "block": {
      const { manifest } = resolved.block;
      return manifest.name ?? manifest.id ?? ANONYMOUS_BUNDLE_NAME;
    }
    case "frame":
      return resolved.group.name ?? resolved.group.id;
    case "timeline":
      return resolved.at.timeline.name ?? resolved.at.timeline.id;
    default:
      return target;
  }
}

/** The level panel's title line: the level's word and the name of what the level shows. */
interface LevelTitle {
  /** `Arranger`, `Bundle`, `Group` or `Timeline`. */
  readonly word: string;
  readonly name: string;
}

/**
 * The title of the level whose innermost open editor is `innermost`: at
 * the top level (`undefined`) "Arranger" and the workspace's name, in an
 * editor its kind's word and the name its target goes by (`editorName`).
 */
export function levelTitle(view: View, innermost: OpenEditor | undefined): LevelTitle {
  return innermost === undefined
    ? { word: levelWord("arranger"), name: view.name }
    : { word: levelWord(innermost.kind), name: editorName(view, innermost.target) };
}

/**
 * What the inspector names beside its heading: the words for the kind of
 * element (and the part of it) the selection names, then the element's
 * name, or its id when it has no name. An anonymous bundle and several
 * selected elements have neither.
 */
interface InspectedSubject {
  /** `Bundle`, `Card of timeline`, `Anonymous bundle`, `2 selected`, … */
  readonly words: string;
  /** The element's name; `null` when it has none. */
  readonly name: string | null;
  /** The element's id when it has no name; else `null`. */
  readonly id: string | null;
}

/**
 * What an address names, worded: the parts it appends, innermost first
 * (`label`, `end`, `card`, `regions band`), the kind of the element they
 * belong to, its name and id, and whether its part `name` reads `title`
 * (a bundle's or a group's).
 */
interface Described {
  readonly parts: readonly string[];
  readonly kind: string;
  readonly name: string | null;
  readonly id: string | null;
  readonly titled: boolean;
}

function bundle(manifest: Manifest): Described {
  return { parts: [], kind: "bundle", name: manifest.name, id: manifest.id ?? null, titled: true };
}

function describe(resolved: ResolvedAddress): Described | null {
  switch (resolved.kind) {
    case "workspace":
      return null;
    case "block":
      return bundle(resolved.block.manifest);
    case "title":
      return { ...bundle(resolved.block.manifest), parts: ["title"] };
    case "frame": {
      const { name, id } = resolved.group;
      return { parts: [], kind: "group", name, id, titled: true };
    }
    case "timeline":
    case "card":
    case "band": {
      const { name, id } = resolved.at.timeline;
      const parts =
        resolved.kind === "timeline"
          ? []
          : resolved.kind === "card"
            ? ["card"]
            : [`${bandWord(resolved.band).toLowerCase()} band`];
      return { parts, kind: "timeline", name, id, titled: false };
    }
    case "entry": {
      const { element } = resolved;
      const name = "name" in element ? element.name : null;
      return { parts: [], kind: ENTRY_WORDS[resolved.entry], name, id: element.id, titled: false };
    }
    case "part": {
      const owner = describe(resolved.owner);
      if (owner === null) return null;
      const word = resolved.word === "name" && owner.titled ? "title" : resolved.word;
      return { ...owner, parts: [word, ...owner.parts] };
    }
  }
}

/**
 * The subject the selection names: for one address, what core resolves it
 * to (the bundle, a group, a timeline, a conversion map, region, break,
 * jump or marker), each part the address appends prefixed (`Card of
 * timeline`, `Label of end of timeline`, `Regions band of timeline`); for
 * several addresses their count; `null` for no selection or an address
 * naming nothing.
 */
export function inspectedSubject(view: View, selection: Iterable<string>): InspectedSubject | null {
  const addresses = [...selection];
  const [address] = addresses;
  if (address === undefined) return null;
  if (addresses.length > 1) return { words: `${addresses.length} selected`, name: null, id: null };
  const resolved = resolveAddress(view, address);
  const found = isCommandError(resolved) ? null : describe(resolved);
  if (found === null) return null;
  const owner = found.name === null && found.id === null ? `anonymous ${found.kind}` : found.kind;
  const words = [...found.parts, owner].join(" of ");
  return {
    words: words.charAt(0).toUpperCase() + words.slice(1),
    name: found.name,
    id: found.name === null ? found.id : null,
  };
}
