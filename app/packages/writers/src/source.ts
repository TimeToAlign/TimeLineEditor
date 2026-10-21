/** The drawing element a descriptor was written from. */

import type { ElementAddress } from "@timetoalign/tilie-core";
import type { DrawnElement } from "@timetoalign/tilie-layout";

/**
 * The element of `Drawing.elements` a descriptor was written from, and its
 * role there: `shadow` for a card's shadow, `primary` for everything else.
 * The writers never serialise it.
 */
export interface DescriptorSource {
  /** The element's index in `Drawing.elements`. */
  readonly element: number;
  readonly type: DrawnElement["type"];
  /** The element's address; `{}` for the block's background, the bundle's. */
  readonly address: ElementAddress;
  readonly role: "primary" | "shadow";
}
