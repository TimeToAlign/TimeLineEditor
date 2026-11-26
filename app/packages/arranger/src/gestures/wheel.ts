/**
 * The canvas's wheel: Svelte Flow's pan, the Shift wheel it gets wrong
 * outside macOS, and overlays that take the plain wheel themselves.
 */

import type { Attachment } from "svelte/attachments";

/** Canvas pixels panned per pixel of wheel travel, Svelte Flow's default. */
export const PAN_SPEED = 0.5;
/** Firefox reports wheel travel in lines (`deltaMode` 1); Svelte Flow counts a line as 20 px. */
const LINE = 20;
const MAC = typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");

/**
 * The class of an overlay of the canvas that takes the plain wheel itself
 * (`ownWheel`), so the canvas neither pans under it nor sees it; a zooming
 * wheel still zooms the canvas there.
 */
export const OWN_WHEEL = "tilie-own-wheel";

/**
 * The wheel listener of an overlay of class `OWN_WHEEL`: a wheel with Ctrl
 * or Cmd held (a touchpad pinch included) goes on to the canvas, which
 * zooms as anywhere else; any other wheel stays with the overlay, which
 * scrolls as the browser scrolls it.
 */
export function ownWheel(event: WheelEvent): void {
  if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
}

/**
 * Shift+wheel pans horizontally. Svelte Flow, outside macOS, turns a Shift
 * wheel's vertical travel into horizontal travel, but Chromium and Firefox
 * on Linux and Windows already report it as horizontal travel, which Svelte
 * Flow would then discard; such an event is panned here instead, by
 * `pan(dx)` screen pixels, before Svelte Flow and actively (Svelte's own
 * wheel listeners are passive).
 */
export function shiftWheel(pan: (dx: number) => void): Attachment<HTMLElement> {
  return (element) => {
    function onwheel(event: WheelEvent): void {
      if (MAC || !event.shiftKey || event.ctrlKey || event.metaKey) return;
      if (event.deltaY !== 0 || event.deltaX === 0) return;
      if (
        event.target instanceof Element &&
        event.target.closest(`.nowheel, .${OWN_WHEEL}`) !== null
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      pan(-event.deltaX * (event.deltaMode === 1 ? LINE : 1) * PAN_SPEED);
    }
    element.addEventListener("wheel", onwheel, { capture: true, passive: false });
    return () => element.removeEventListener("wheel", onwheel, { capture: true });
  };
}
