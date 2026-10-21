/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `"1"` in builds for the end-to-end tests: installs `window.__tilie` outside development. */
  readonly VITE_TILIE_TEST_HOOK?: string;
}

/** The editor's version, from the workspace's `package.json` at build time. */
declare const __TILIE_VERSION__: string;
/** The version of the bundled `@timetoalign/timetoshare`, at build time. */
declare const __TIMETOSHARE_VERSION__: string;
