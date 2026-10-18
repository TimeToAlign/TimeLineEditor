/**
 * `draw(manifest, placement, layers, metrics)`: the drawing of one
 * TimeSkeleton manifest (`docs/drawing.md` in timeskeleton). Every manifest
 * is drawn as one box (section 8): each timeline drawn as a root lies in its
 * own card and is laid out by sections 3 to 6, and each item of the box, a
 * frame or an ungrouped root's card, applies the box's one horizontal layout
 * and is drawn at its own place and scale.
 */

import {
  BLOCK_KEY,
  elementKey,
  type Manifest,
  type MemberDrawing,
  memberDrawings,
  type Place,
  TITLE_ADDRESS,
  timelineAncestry,
  unownedKey,
} from "@timetoalign/tilie-core";
import type { FontMetrics, Graphical } from "@timetoalign/timeskeleton";
import { canonicalOrder } from "@timetoalign/timeskeleton";
import { placedAt } from "./canvas.ts";
import { Cascade } from "./cascade.ts";
import { F, G, K, P, Q, SHADOW_OFFSET, TITLE_GAP } from "./constants.ts";
import type {
  Drawing,
  DrawnCard,
  DrawnElement,
  DrawnItem,
  Placement,
  TextElement,
} from "./elements.ts";
import { layoutMember, type MemberLayout } from "./member.ts";
import { cleanText, TextMeasure } from "./metrics.ts";
import { cutText } from "./names.ts";
import { unscoped } from "./numbers.ts";
import { brace } from "./regions.ts";
import { bandOrderOf } from "./sides.ts";
import { type Holder, shown } from "./traversal.ts";

/** A member drawing laid out at the graphical length `L` of its item. */
interface Laid {
  readonly layout: MemberLayout;
  readonly L: number;
}

/**
 * The start `s0` of every member drawing of the box (section 8.2), in item
 * coordinates: past the name column starting at `n`, so that no centred
 * label crosses its left edge and no chevron crosses the gap after the names.
 */
function start(n: number, drawings: readonly Laid[]): number {
  const names = drawings.flatMap(({ layout }) => layout.names);
  const N = names.length === 0 ? 0 : Math.max(...names);
  const gap = names.length === 0 ? 0 : G;
  let s0 = n + N + gap;
  for (const { layout, L } of drawings) {
    for (const item of layout.centred) s0 = Math.max(s0, n + item.width / 2 - L * item.u);
  }
  for (const wa of drawings.flatMap(({ layout }) => layout.chevrons)) {
    s0 = Math.max(s0, n + N + gap + 8 * wa);
  }
  return s0;
}

/** The right edge of an element (section 6.7): geometric, no stroke width counted. */
function rightEdge(element: DrawnElement, measure: TextMeasure): number | undefined {
  switch (element.type) {
    case "block":
    case "group":
    case "card":
      return undefined;
    case "timeline":
    case "child":
    case "ancestor": {
      const w = element.style["stroke-width"];
      const end = {
        arrowhead: element.xe + 3 * w,
        open: element.xe + 3 * w,
        circle: element.xe + w,
        diamond: element.xe + 1.5 * w,
        unknown: element.xe + 5.5 * w,
        chevrons: element.xe + 4 * w,
      }[element.end];
      return element.start === "circle" ? Math.max(element.xs + w, end) : end;
    }
    case "map":
      return element.xe;
    case "region":
      return Math.max(
        ...brace(element.x1, element.x2, element.xm, element.yb, element.ya).flatMap((command) =>
          command.points.map(([x]) => x),
        ),
      );
    case "jump":
      return Math.max(
        ...[
          element.start,
          element.c1,
          element.c2,
          element.base,
          element.tip,
          ...element.corners,
        ].map(([x]) => x),
      );
    case "break":
    case "boundary":
      return element.x;
    case "wedge":
      return element.x + element.base / 2;
    case "name":
    case "label": {
      const width = measure.width(element.text, element.style["font-size"]);
      return element.anchor === "start" ? element.x + width : element.x + width / 2;
    }
  }
}

/** The largest right edge of some elements, or `undefined` when none has one. */
function largestRightEdge(
  elements: readonly DrawnElement[],
  measure: TextMeasure,
): number | undefined {
  const edges = elements
    .map((element) => rightEdge(element, measure))
    .filter((edge): edge is number => edge !== undefined);
  return edges.length === 0 ? undefined : Math.max(...edges);
}

/** What one item draws, in item coordinates: its elements and its right and bottom edges. */
interface Local {
  readonly elements: DrawnElement[];
  readonly rights: number[];
  readonly bottoms: number[];
}

/**
 * Draw one manifest as one box (section 8): its title, its groups as frames
 * and its ungrouped roots as cards, each item at its place (section 8.6).
 */
export function draw(
  manifest: Manifest,
  placement: Placement,
  layers: readonly (Graphical | undefined)[],
  metrics: FontMetrics,
): Drawing {
  const ordered = canonicalOrder(manifest as never) as unknown as Manifest;
  const measure = new TextMeasure(metrics);
  const cascade = new Cascade(layers, timelineAncestry(ordered));
  const block: Holder = { key: BLOCK_KEY, style: cascade.resolve(BLOCK_KEY, undefined) };
  const { frames, ungrouped } = memberDrawings(ordered);

  /** A title (section 8.1): a name element at `address` with its group's or manifest's name, or its id. */
  const title = (address: string, id: string, name: string | null, holder: Holder) => {
    const style = cascade.resolve(unownedKey("name", address, holder.key), holder.style);
    const size = style["font-size"];
    const source = style.content === "none" ? (name ?? unscoped(id)) : style.content;
    const text = cutText(measure, cleanText(source), size, style["max-width"]);
    return { address, style, size, text, drawn: shown(style) };
  };
  type Title = ReturnType<typeof title>;
  const titleElement = (item: Title, x: number, baseline: number): TextElement => ({
    type: "name",
    address: item.address,
    style: item.style,
    x,
    baseline,
    anchor: "start",
    text: item.text,
  });
  const card = (member: MemberDrawing, holder: Holder) => {
    const timeline = member.timeline;
    const key = elementKey("card", `${timeline.id}/card`, timeline, holder.key);
    return { address: key.address as string, style: cascade.resolve(key, holder.style) };
  };
  type Card = ReturnType<typeof card>;
  /**
   * A member drawing at its item's graphical length `L` and its vertical stretch `v`, in its
   * root's band order (section 6.4).
   */
  const layout = (
    member: MemberDrawing,
    holder: Holder,
    group: string | null,
    L: number,
    v: number,
  ) => {
    const order = bandOrderOf(placement, member.timeline.id, group);
    return layoutMember(
      { placement: { ...placement, length: L, spacing: v, order }, cascade, measure },
      member,
      holder,
    );
  };
  /** What `places` states under `key`, `{}` when it states nothing. */
  const statedOf = (key: string): Place =>
    Object.hasOwn(placement.places, key) ? (placement.places[key] as Place) : {};
  /** What `places` states for a member's card: its `width`, `height` and `spacing`, nothing else. */
  const requestOf = (key: string): Pick<Place, "width" | "height" | "spacing"> => {
    const { width, height, spacing } = statedOf(key);
    return {
      ...(width === undefined ? {} : { width }),
      ...(height === undefined ? {} : { height }),
      ...(spacing === undefined ? {} : { spacing }),
    };
  };

  // The manifest's title: its name, else its id; a manifest with neither has none.
  const heading =
    ordered.name === null && ordered.id === undefined
      ? undefined
      : title(TITLE_ADDRESS, ordered.id ?? "", ordered.name, block);
  const headingDrawn = heading?.drawn === true ? heading : undefined;
  // `Pt` (section 8.4): no item rises above F below the title's slot, and the first item's
  // default top lies there.
  const Pt = headingDrawn === undefined ? P : P + measure.lineHeight(headingDrawn.size) + F;

  // Each item's place (section 8.6), in place coordinates: what `places` states, else the
  // defaults, the first item at Pt and every further one F below the largest drawn bottom edge
  // of the items before it. Heights, in item coordinates, do not depend on the place.
  const itemBottoms: number[] = [];
  const nextTop = () => (itemBottoms.length === 0 ? Pt : Math.max(...itemBottoms) + F);
  /**
   * The place of the item `key`, its content laid out at the item's length `L` and its vertical
   * stretch `v`, the placement's `spacing` times the item's: its height the larger of the
   * content's and the requested one, its drawn bottom edge, after its scale, recorded for the
   * next default top.
   */
  const placeItem = <C extends { readonly height: number }>(
    key: string,
    content: (L: number, v: number) => C,
  ) => {
    const stated = statedOf(key);
    const L = stated.length ?? placement.length;
    const scale = stated.scale ?? 1;
    const spacing = stated.spacing ?? 1;
    const laid = content(L, placement.spacing * spacing);
    const height = stated.height === undefined ? laid.height : Math.max(laid.height, stated.height);
    const x = stated.x ?? P;
    const y = stated.y ?? nextTop();
    itemBottoms.push(y + scale * height);
    return { ...laid, key, stated, L, scale, spacing, x, y, height };
  };
  const framed = frames.map((frame) => {
    const id = frame.group.id;
    const key = unownedKey("group", id, BLOCK_KEY);
    const holder: Holder = { key, style: cascade.resolve(key, block.style) };
    return placeItem(id, (L, v) => {
      const frameTitle = title(`${id}/name`, id, frame.group.name, holder);
      // Vertical (section 8.4): the title's slot, then the cards F apart, each the larger of its
      // member drawing's height and the height its own request asks (section 8.6). Each member
      // drawing is stretched by the frame's `v` times its card's own `spacing`.
      let top = Q;
      if (frameTitle.drawn) top = top + measure.lineHeight(frameTitle.size) + TITLE_GAP;
      const members = frame.members.map((member, index) => {
        const stated = requestOf(member.timeline.id);
        const spacing = stated.spacing ?? 1;
        const memberLayout = layout(member, holder, id, L, v * spacing);
        const height =
          stated.height === undefined
            ? memberLayout.height
            : Math.max(memberLayout.height, stated.height);
        if (index > 0) top = top + F;
        const item = {
          member,
          card: card(member, holder),
          memberLayout,
          stated,
          spacing,
          top,
          height,
        };
        top = top + height;
        return item;
      });
      return { holder, members, frameTitle, height: top + Q };
    });
  });
  const loose = ungrouped.map((member) =>
    placeItem(member.timeline.id, (L, v) => {
      const memberLayout = layout(member, block, null, L, v);
      return { card: card(member, block), memberLayout, height: memberLayout.height };
    }),
  );

  // The box's one horizontal layout (section 8.2), in item coordinates: the name column `n`,
  // the start `s0` and the right margin `Mr`, found once over every member drawing of the box.
  const n = framed.length > 0 ? Q + K : K;
  const s0 = start(n, [
    ...framed.flatMap((frame) =>
      frame.members.map((item) => ({ layout: item.memberLayout, L: frame.L })),
    ),
    ...loose.map((item) => ({ layout: item.memberLayout, L: item.L })),
  ]);
  const framedDrawn = framed.map((frame) => ({
    ...frame,
    members: frame.members.map((item) => ({
      ...item,
      elements: item.memberLayout.elements(s0, n, item.top),
    })),
  }));
  const looseDrawn = loose.map((item) => ({
    ...item,
    elements: item.memberLayout.elements(s0, n, 0),
  }));
  const margins: number[] = [];
  const margin = (elements: readonly DrawnElement[], L: number) => {
    const e = largestRightEdge(elements, measure);
    if (e !== undefined) margins.push(e - (s0 + L));
  };
  for (const frame of framedDrawn) for (const item of frame.members) margin(item.elements, frame.L);
  for (const item of looseDrawn) margin(item.elements, item.L);
  const Mr = margins.length === 0 ? undefined : Math.max(...margins);
  /** An item's right edge `Ri` before its request: its content's, or past its group's title `t`. */
  const rightOf = (L: number, t: number | undefined) => {
    const content = Mr === undefined ? s0 : s0 + L + Mr;
    return t === undefined ? content : Math.max(content, t);
  };

  // The box grows left and up to hold every frame and card with the padding P, and above them
  // the title's slot (section 8.4): the place origin lies at (Ox, Oy) in the box.
  const positioned = [...framed, ...loose];
  const Xl =
    positioned.length === 0 ? 0 : Math.min(0, Math.min(...positioned.map((item) => item.x)) - P);
  const Yt =
    positioned.length === 0 ? 0 : Math.min(0, Math.min(...positioned.map((item) => item.y)) - Pt);
  const Ox = 0 - Xl;
  const Oy = 0 - Yt;

  // Every position below is in place coordinates; the place origin is added to each last.
  const elements: DrawnElement[] = [];
  const items: DrawnItem[] = [];
  const cards: DrawnCard[] = [];
  const rights: number[] = [];
  const bottoms: number[] = [];
  // The manifest's displayed title lies at the box's top left corner, its slot ending h(s) lower.
  if (headingDrawn !== undefined) {
    const size = headingDrawn.size;
    const left = Xl + P;
    const top = Yt + P;
    const headingTitle = titleElement(headingDrawn, left, top + measure.ascent(size));
    elements.push(headingTitle);
    rights.push(left + measure.width(headingTitle.text, size));
    bottoms.push(top + measure.lineHeight(size));
  }
  /**
   * A card spanning `left` to `right` and `top` to `top + height` in item coordinates, with its
   * member drawing. It takes room whether displayed or not; its shadow only when drawn.
   */
  const pushCard = (
    local: Local,
    item: Card,
    left: number,
    right: number,
    top: number,
    height: number,
    drawn: readonly DrawnElement[],
  ) => {
    const bottom = top + height;
    local.rights.push(right);
    local.bottoms.push(bottom);
    if (shown(item.style)) {
      if (item.style.shadow !== "none") {
        local.rights.push(right + SHADOW_OFFSET);
        local.bottoms.push(bottom + SHADOW_OFFSET);
      }
      local.elements.push({
        type: "card",
        address: item.address,
        style: item.style,
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
        shadowOffset: SHADOW_OFFSET,
      });
    }
    local.elements.push(...drawn);
  };
  /**
   * Draw an item at its place (section 8.6): each element and edge it draws in item
   * coordinates taken to its place at its scale.
   */
  const drawItem = (
    item: { readonly x: number; readonly y: number; readonly scale: number },
    local: Local,
  ) => {
    const { x, y, scale } = item;
    for (const element of local.elements) elements.push(placedAt(element, x, y, scale));
    for (const right of local.rights) rights.push(x + scale * right);
    for (const bottom of local.bottoms) bottoms.push(y + scale * bottom);
  };

  for (const frame of framedDrawn) {
    const { key: id, holder, stated, L, scale, spacing, x, y, members, frameTitle, height } = frame;
    const local: Local = { elements: [], rights: [], bottoms: [] };
    const titleText = frameTitle.drawn
      ? titleElement(frameTitle, Q, Q + measure.ascent(frameTitle.size))
      : undefined;
    let R = rightOf(L, titleText === undefined ? undefined : rightEdge(titleText, measure));
    if (stated.width !== undefined) R = Math.max(R, stated.width - K - Q);
    // Every card ends at R + K, unless its own request widens it; the frame holds them.
    const cardRights = members.map((item) =>
      item.stated.width === undefined ? R + K : Math.max(R + K, Q + item.stated.width),
    );
    const right = Math.max(R + K, ...cardRights) + Q;
    local.rights.push(right);
    local.bottoms.push(height);
    if (shown(holder.style)) {
      local.elements.push({
        type: "group",
        address: id,
        style: holder.style,
        x: 0,
        y: 0,
        width: right,
        height,
        shadowOffset: 0,
      });
    }
    if (titleText !== undefined) local.elements.push(titleText);
    members.forEach((item, index) => {
      const cardRight = cardRights[index] as number;
      pushCard(local, item.card, Q, cardRight, item.top, item.height, item.elements);
      cards.push({
        key: item.member.timeline.id,
        group: id,
        address: item.card.address,
        size: { width: cardRight - Q, height: item.height },
        spacing: item.spacing,
        stated: item.stated,
      });
    });
    items.push({
      key: id,
      kind: "group",
      address: id,
      place: { x, y, length: L, scale, spacing, width: right, height },
      stated,
    });
    drawItem(frame, local);
  }
  // An ungrouped root's card ends where the frames of its length end, Q further when the box
  // holds a frame.
  const inset = framed.length > 0 ? Q : 0;
  for (const item of looseDrawn) {
    const { key, stated, L, scale, spacing, x, y, height } = item;
    const local: Local = { elements: [], rights: [], bottoms: [] };
    let R = rightOf(L, undefined);
    if (stated.width !== undefined) R = Math.max(R, stated.width - K - inset);
    const right = R + K + inset;
    pushCard(local, item.card, 0, right, 0, height, item.elements);
    items.push({
      key,
      kind: "card",
      address: item.card.address,
      place: { x, y, length: L, scale, spacing, width: right, height },
      stated,
    });
    drawItem(item, local);
  }

  // The content runs from Xl to Xr and from Yt to Yb in place coordinates (section 8.4).
  const Xr = rights.length === 0 ? 2 * P + K : P + Math.max(...rights);
  const Yb = bottoms.length === 0 ? P : P + Math.max(...bottoms);
  const Wb = Xr - Xl;
  const Hb = Yb - Yt;
  const W = placement.width === null ? Wb : Math.max(Wb, placement.width);
  const H = placement.height === null ? Hb : Math.max(Hb, placement.height);
  const inBox = elements.map((item) => placedAt(item, Ox, Oy));
  inBox.unshift({ type: "block", address: null, style: block.style, width: W, height: H });
  return {
    width: W,
    height: H,
    origin: { x: Ox, y: Oy },
    items,
    cards,
    elements: inBox,
    unmapped: [...measure.unmapped].sort((left, right) => left - right),
  };
}
