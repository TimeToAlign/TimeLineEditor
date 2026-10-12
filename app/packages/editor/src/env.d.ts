/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `"1"` in builds for the end-to-end tests: installs `window.__tilie` outside development. */
  readonly VITE_TILIE_TEST_HOOK?: string;
}
