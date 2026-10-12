import { vi } from "vitest";

/**
 * Stub what jsdom lacks and the canvas needs: `matchMedia` (Svelte Flow
 * follows the preferred colour scheme; no query matches) and
 * `ResizeObserver` (Svelte Flow watches its pane's size; jsdom lays nothing
 * out, so it never reports). Undone by `vi.unstubAllGlobals()`.
 */
export function stubLayout(): void {
  vi.stubGlobal("matchMedia", (media: string): MediaQueryList => {
    const list = {
      matches: false,
      media,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    };
    return list as MediaQueryList;
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
}
