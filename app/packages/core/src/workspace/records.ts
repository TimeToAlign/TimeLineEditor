/** Record shapes. Only blocks have commands in this version; the other kinds are stable extension points. */

import type { Graphical } from "@timetoalign/timeskeleton";
import type { Manifest } from "../manifest/types.ts";
import type { CoordinateDict } from "../number/coordinate.ts";

/** A colour as `#RRGGBB` with upper-case hexadecimal digits. */
export type Colour = string;
export type RecordId = string;
export type Address = string;
export type RecordKind = "block" | "text" | "connector" | "lock" | "group" | "shape" | "image";

export interface RecordBase {
  readonly id: RecordId;
  readonly kind: RecordKind;
  readonly parent: RecordId | null;
  readonly index: string;
}

/** A group of bands, laid outwards from the root in a block's `order`. */
export type BandGroup = "children" | "regions" | "flow";
export const BAND_GROUPS: readonly BandGroup[] = ["children", "regions", "flow"];

/** The inputs of a block's drawing besides its manifest and its style layers. */
export interface BlockPlacement {
  /** The uniform scale of the drawing on the canvas, positive. */
  readonly scale: number;
  /** The graphical length of the root, positive. */
  readonly length: number;
  /** The vertical stretch, positive. */
  readonly spacing: number;
  /** The requested box size, positive, or null for the content's own size. */
  readonly width: number | null;
  readonly height: number | null;
  /** The band order, a permutation of the three groups. */
  readonly order: readonly [BandGroup, BandGroup, BandGroup];
}

export interface BlockRecord extends RecordBase, BlockPlacement {
  readonly kind: "block";
  readonly blockKind: "timeline";
  readonly x: number;
  readonly y: number;
  /** The style layer of whoever places the block, above the manifest's own. */
  readonly overrides: Graphical;
  readonly manifest: Manifest;
}

export interface CanvasStyle {
  readonly colour?: Colour;
  readonly fill?: Colour | null;
  readonly thickness?: number;
  readonly opacity?: number;
  readonly line_pattern?: "solid" | "dotted" | "dashed";
}

export type ConnectorEnd =
  | { readonly address: Address; readonly anchor: "left" | "right" | "top" | "bottom" | null }
  | { readonly x: number; readonly y: number };

export interface TextRecord extends RecordBase {
  readonly kind: "text";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly text: string;
  readonly style: CanvasStyle;
}

export interface ConnectorRecord extends RecordBase {
  readonly kind: "connector";
  readonly from: ConnectorEnd;
  readonly to: ConnectorEnd;
  readonly waypoints: readonly { readonly x: number; readonly y: number }[];
  readonly label: string | null;
  readonly style: CanvasStyle;
}

export interface LockEnd {
  readonly block: RecordId;
  readonly at: CoordinateDict;
}

export interface LockRecord extends RecordBase {
  readonly kind: "lock";
  readonly a: LockEnd;
  readonly b: LockEnd;
}

export interface GroupRecord extends RecordBase {
  readonly kind: "group";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ShapeRecord extends RecordBase {
  readonly kind: "shape";
  readonly shape: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly style: CanvasStyle;
}

export interface ImageRecord extends RecordBase {
  readonly kind: "image";
  readonly asset: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type WorkspaceRecord =
  | BlockRecord
  | TextRecord
  | ConnectorRecord
  | LockRecord
  | GroupRecord
  | ShapeRecord
  | ImageRecord;
