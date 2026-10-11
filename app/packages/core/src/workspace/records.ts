/** Record shapes. Only blocks have commands in this version; the other kinds are stable extension points. */

import type { Colour, LinePattern, StyleRules } from "@timetoalign/timeskeleton";
import type { Manifest } from "../manifest/types.ts";
import type { CoordinateDict } from "../number/coordinate.ts";

export type RecordId = string;
export type Address = string;
export type RecordKind = "block" | "text" | "connector" | "lock" | "group" | "shape" | "image";

export interface RecordBase {
  readonly id: RecordId;
  readonly kind: RecordKind;
  readonly parent: RecordId | null;
  readonly index: string;
}

export interface Margins {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface NameColumn {
  readonly visible: boolean;
  readonly width: readonly [number, number];
}

export interface BlockRecord extends RecordBase {
  readonly kind: "block";
  readonly blockKind: "timeline";
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly zoom: number;
  readonly margins: Margins;
  readonly background: Colour | null;
  readonly nameColumn: NameColumn;
  readonly overrides: StyleRules;
  readonly manifest: Manifest;
}

export interface CanvasStyle {
  readonly colour?: Colour;
  readonly fill?: Colour | null;
  readonly thickness?: number;
  readonly opacity?: number;
  readonly line_pattern?: LinePattern;
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
