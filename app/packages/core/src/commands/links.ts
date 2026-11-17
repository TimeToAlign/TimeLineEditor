/**
 * The links of a manifest, of a timeline and of a region (TimeToShare's
 * description layer), set whole. A link has no ID and no address: it is a
 * member of the element holding it, so a `set` of `links` on that element
 * (the block for the manifest's own links, a timeline, a region) adds,
 * changes or removes links in one command. The list given is read with
 * the manifest it will lie in, since an identifier may name a scheme of
 * the manifest and a part slot names timelines and regions of it.
 */

import { completeManifest } from "@timetoalign/timetoshare";
import type { CommandError } from "../errors.ts";
import { ErrorCode, isCommandError, problem } from "../errors.ts";
import type { Json, PathSegment } from "../json.ts";
import { schemaChecked } from "../manifest/io.ts";
import type { Link, Manifest, TimelineManifest } from "../manifest/types.ts";
import { toJson } from "../values.ts";
import type { Block } from "../workspace/blocks.ts";

/** What holds links: a manifest's own list and its tree of timelines, each holding regions. */
interface Holding {
  readonly links: readonly Link[];
  readonly timelines: readonly TimelineManifest[];
}

/**
 * The links of the element `owner` names in `manifest`: the manifest's own
 * for `null`, else those of the timeline (at any depth) or region with that
 * ID; `undefined` for an ID naming neither.
 */
export function linksOf(manifest: Holding, owner: string | null): readonly Link[] | undefined {
  if (owner === null) return manifest.links;
  const visit = (timeline: TimelineManifest): readonly Link[] | undefined => {
    if (timeline.id === owner) return timeline.links;
    const region = timeline.regions.find((item) => item.id === owner);
    if (region !== undefined) return region.links;
    for (const child of timeline.children) {
      const found = visit(child);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  for (const root of manifest.timelines) {
    const found = visit(root);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** `manifest` as a value with `value` in place of the links of the element `owner` names. */
function withLinksValue(manifest: Manifest, owner: string | null, value: Json): unknown {
  if (owner === null) return { ...manifest, links: value };
  const visit = (timeline: TimelineManifest): unknown => {
    if (timeline.id === owner) return { ...timeline, links: value };
    return {
      ...timeline,
      regions: timeline.regions.map((region) =>
        region.id === owner ? { ...region, links: value } : region,
      ),
      children: timeline.children.map(visit),
    };
  };
  return { ...manifest, timelines: manifest.timelines.map(visit) };
}

/**
 * The links `value` gives the element `owner` names in `block`'s manifest
 * (`null`: the manifest itself, else a timeline's or a region's ID), read
 * through the schema boundary: the manifest with the list in place is
 * checked by the schema, so a link's shape, its identifiers' schemes and
 * its part slots' `represented_by` are checked where they will lie, and the
 * list is returned in its complete form, in its order. A value that is no
 * list is `invalid_value` at `path`; a schema problem lies below the
 * block's manifest, `[<block id>, "manifest", …]`.
 */
export function readLinks(
  block: Block,
  owner: string | null,
  value: unknown,
  path: readonly PathSegment[],
): readonly Link[] | CommandError {
  const json = toJson(value, path);
  if (isCommandError(json)) return json;
  if (!Array.isArray(json))
    return problem(ErrorCode.invalidValue, "links is a list of links", path);
  const checked = schemaChecked(withLinksValue(block.manifest, owner, json));
  if ("code" in checked) return { ...checked, path: [block.id, "manifest", ...checked.path] };
  const links = linksOf(completeManifest(checked), owner);
  if (links === undefined) throw new Error(`'${String(owner)}' names an element holding links`);
  return links;
}
