/**
 * The framework-free entry of the embeddable editor: `mount` puts one
 * TimeLineEditor into an element the host owns and returns its handle. The
 * embed build (`pnpm build:embed`) writes this module as `tilie.js`, beside
 * `tilie.css`, which the host page loads too.
 */

import { mount as mountComponent, unmount } from "svelte";
import { NOTICES_FILE } from "./attributions.ts";
import Editor from "./Editor.svelte";
import type { TimeLineEditor, TimeLineEditorOptions } from "./options.ts";

export type {
  ServerOptions,
  Status,
  StorageOptions,
  TimeLineEditor,
  TimeLineEditorOptions,
} from "./options.ts";

/** The attribute marking an element that holds an editor. */
const MARK = "data-tilie";

/**
 * Mount an editor into `element`, which must be empty and give the editor a
 * definite height. Throws when `element` has children or already holds an
 * editor. The licence texts are linked beside this module unless
 * `options.noticesUrl` names them elsewhere.
 */
export function mount(element: HTMLElement, options: TimeLineEditorOptions = {}): TimeLineEditor {
  if (element.hasAttribute(MARK)) {
    throw new Error("the element already holds a TimeLineEditor");
  }
  if (element.hasChildNodes()) {
    throw new Error("the element for a TimeLineEditor must be empty");
  }
  element.setAttribute(MARK, "");
  const editor = mountComponent(Editor, {
    target: element,
    props: {
      ...options,
      noticesUrl: options.noticesUrl ?? new URL(NOTICES_FILE, import.meta.url).href,
      testHook: false,
    },
  });
  let destroyed: Promise<void> | null = null;
  return {
    text: () => editor.text(),
    load: (text, name) => editor.load(text, name),
    selection: () => editor.selection(),
    select: (addresses) => editor.select(addresses),
    focus: () => editor.focus(),
    destroy() {
      destroyed ??= (async () => {
        await editor.flush();
        await unmount(editor);
        element.removeAttribute(MARK);
      })();
      return destroyed;
    },
  };
}
