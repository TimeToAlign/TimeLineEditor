/**
 * The canvas's wheel: Svelte Flow's pan, and the Shift wheel, which it gets
 * wrong in one way outside macOS and in another on it. Over the canvas's
 * overlays (the flow editor's pane among them) the wheel pans and zooms the
 * canvas as anywhere else on it; only an element of class `nowheel` keeps it.
 */

import type { Attachment } from "svelte/attachments";

/** Canvas pixels panned per pixel of wheel travel, Svelte Flow's default. */
export const PAN_SPEED = 0.5;
/** Firefox reports wheel travel in lines (`deltaMode` 1); Svelte Flow counts a line as 20 px. */
const LINE = 20;

/**
 * Shift+wheel pans horizontally, by its travel along the one axis it
 * reports, on every platform. Svelte Flow decides by the user agent: outside
 * macOS it turns a Shift wheel's vertical travel into horizontal travel and
 * discards horizontal travel, which Chromium and Firefox on Linux and
 * Windows report for it; on macOS it pans a Shift wheel's vertical travel
 * (a trackpad's, which the system leaves vertical) vertically. Every Shift
 * wheel travelling along one axis is therefore panned here, by `pan(dx)`
 * screen pixels, before Svelte Flow and actively (Svelte's own wheel
 * listeners are passive); one travelling along both is left to Svelte Flow.
 */
export function shiftWheel(pan: (dx: number) => void): Attachment<HTMLElement> {
  return (element) => {
    function onwheel(event: WheelEvent): void {
      if (!event.shiftKey || event.ctrlKey || event.metaKey) return;
      if ((event.deltaX === 0) === (event.deltaY === 0)) return;
      if (event.target instanceof Element && event.target.closest(".nowheel") !== null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const travel = event.deltaX === 0 ? event.deltaY : event.deltaX;
      pan(-travel * (event.deltaMode === 1 ? LINE : 1) * PAN_SPEED);
    }
    element.addEventListener("wheel", onwheel, { capture: true, passive: false });
    return () => element.removeEventListener("wheel", onwheel, { capture: true });
  };
}
