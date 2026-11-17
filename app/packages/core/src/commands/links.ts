/**
 * The links of a manifest, of a timeline and of a region (TimeToShare's
 * description layer), set whole. A link has no ID and no address: it is a
 * member of the element holding it, so a `set` of `links` on that element
 * (the block for the manifest's own links, a timeline, a region) adds,
 * changes or removes links in one command. The list given is read with
 * the manifest it will lie in, since an identifier may name a scheme of
 * the manifest and a part slot names timelines and regions of it.
 */

import type { CommandError } from "../errors.ts";
import { ErrorCode, isCommandError, problem } from "../errors.ts";
import type { PathSegment } from "../json.ts";
import { withValueAt } from "../json.ts";
import { readInPlace } from "../manifest/io.ts";
import { linkHolder } from "../manifest/links.ts";
import type { Link } from "../manifest/types.ts";
import { toJson } from "../values.ts";
import type { Block } from "../workspace/blocks.ts";

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
  const held = linkHolder(block.manifest, owner);
  if (held === undefined) throw new Error(`'${String(owner)}' names an element holding links`);
  const read = readInPlace(withValueAt(block.manifest, held.path, json));
  if ("code" in read) return { ...read, path: [block.id, "manifest", ...read.path] };
  const links = linkHolder(read, owner)?.links;
  if (links === undefined) throw new Error(`'${String(owner)}' names an element holding links`);
  return links;
}
