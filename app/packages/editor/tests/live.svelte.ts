/** A reactive holder for the inspector's `live` prop, so a test can change it after mounting. */

import type { LivePlacement } from "@timetoalign/tilie-arranger";

export function liveHolder(): { value: LivePlacement | null } {
  let value: LivePlacement | null = $state.raw(null);
  return {
    get value() {
      return value;
    },
    set value(next) {
      value = next;
    },
  };
}
