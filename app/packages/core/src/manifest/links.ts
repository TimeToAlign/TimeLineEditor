/**
 * The elements of a manifest that hold links (TimeToShare's description
 * layer): the manifest itself, every timeline at any depth and every
 * region, walked once in one order, each with the path of its `links` list
 * from the manifest. This is the one walk every reader and writer of links
 * goes through. It is typed over the members it reads, so it serves core's
 * manifests and the schema package's complete form alike.
 */

import type { Json, JsonObject, PathSegment } from "../json.ts";
import { isJsonObject } from "../json.ts";

/** The kinds of element that hold links. */
export type LinkOwner = "manifest" | "timeline" | "region";

/** A region as the walk reads it. */
export interface LinkedRegion<L> {
  readonly id: string;
  readonly name: string | null;
  readonly links: readonly L[];
}

/** A timeline as the walk reads it: its links, its regions and its children. */
export interface LinkedTimeline<L> {
  readonly id: string;
  readonly name: string | null;
  readonly links: readonly L[];
  readonly regions: readonly LinkedRegion<L>[];
  readonly children: readonly LinkedTimeline<L>[];
}

/** A manifest as the walk reads it: its own links and its root timelines. */
export interface LinkedManifest<L> {
  readonly links: readonly L[];
  readonly timelines: readonly LinkedTimeline<L>[];
}

/** One element holding links. */
export interface LinkHolder<L> {
  readonly kind: LinkOwner;
  /** The element's ID; `null` for the manifest. */
  readonly id: string | null;
  /** The element's `name`; `null` where it states none, and for the manifest. */
  readonly name: string | null;
  readonly links: readonly L[];
  /** The path of the element's `links` list from the manifest. */
  readonly path: readonly PathSegment[];
}

/**
 * Every element of `manifest` holding links, in document order: the
 * manifest, then each root's tree, a timeline before its regions and its
 * regions before its children.
 */
export function* linkHolders<L>(manifest: LinkedManifest<L>): Generator<LinkHolder<L>> {
  yield { kind: "manifest", id: null, name: null, links: manifest.links, path: ["links"] };
  function* visit(
    timeline: LinkedTimeline<L>,
    path: readonly PathSegment[],
  ): Generator<LinkHolder<L>> {
    const { id, name, links } = timeline;
    yield { kind: "timeline", id, name, links, path: [...path, "links"] };
    for (const [index, region] of timeline.regions.entries()) {
      const at = [...path, "regions", index, "links"];
      yield { kind: "region", id: region.id, name: region.name, links: region.links, path: at };
    }
    for (const [index, child] of timeline.children.entries()) {
      yield* visit(child, [...path, "children", index]);
    }
  }
  for (const [index, root] of manifest.timelines.entries()) {
    yield* visit(root, ["timelines", index]);
  }
}

/**
 * The element of `manifest` holding links with the ID `id` (`null`: the
 * manifest itself); `undefined` where no timeline or region carries it.
 */
export function linkHolder<L>(
  manifest: LinkedManifest<L>,
  id: string | null,
): LinkHolder<L> | undefined {
  for (const holder of linkHolders(manifest)) if (holder.id === id) return holder;
  return undefined;
}

/**
 * A value given to a command (a timeline with what it holds, or a region)
 * with the `links` of every element in it left out: what is read alone,
 * before its links are read where they will lie, in the whole manifest,
 * since a part slot may name any timeline or region of the manifest. Each
 * list left out is put into `found` by the ID of its element; one whose
 * element carries no string ID is dropped with it, the schema refusing the
 * element. Every other member is kept as given.
 */
export function unlinked(value: JsonObject, found: Map<string, Json>): JsonObject {
  const { links, ...rest } = value;
  if (links !== undefined && typeof rest.id === "string") found.set(rest.id, links);
  const result: { [key: string]: Json } = { ...rest };
  for (const member of ["regions", "children"]) {
    const list = rest[member];
    if (Array.isArray(list)) {
      result[member] = list.map((item) => (isJsonObject(item) ? unlinked(item, found) : item));
    }
  }
  return result;
}
