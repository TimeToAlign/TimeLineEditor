/** The framework-free options and handle of an embedded TimeLineEditor. */

import type { ConnectOptions } from "@timetoalign/tilie-client";
import type { LoadError } from "@timetoalign/tilie-core";

/** The `tilie-server` an editor asks, and how it authenticates: the client's options. */
export type { ConnectOptions as ServerOptions };

/** The names under which an editor keeps the viewer's state in the browser. */
export interface StorageOptions {
  /** The autosave slot (in IndexedDB); its Web Lock is `tilie-autosave/<slot>`. */
  readonly slot: string;
  /** The `localStorage` key remembering whether the inspector drawer is open. */
  readonly inspectorKey: string;
}

/** What the open workspace's file is, reported after every change and every load. */
export interface Status {
  /** The file the workspace was opened from or last saved to; `untitled.tle.json` for a new one. */
  readonly fileName: string;
  /** Whether the workspace holds changes its file does not. */
  readonly dirty: boolean;
}

/** Options for one editor instance; every one may be left out. */
export interface TimeLineEditorOptions {
  /** The workspace file text to open; the empty workspace by default. */
  readonly workspace?: string;
  /** The server to ask; by default none: no request is made and About says "no server". */
  readonly server?: ConnectOptions | null;
  /** Where the autosave and the drawer's state are kept; by default nowhere: no autosave. */
  readonly storage?: StorageOptions | null;
  /** Where the file and undo shortcuts are taken: inside the editor (the default) or anywhere in the window. */
  readonly shortcuts?: "editor" | "window";
  /** Whether the canvas takes the focus at mount; `false` by default. */
  readonly autofocus?: boolean;
  /** The URL of the licence texts the About pane links to. */
  readonly noticesUrl?: string;
  /** Called with the file status after every change of the workspace and every load; the text is `text()`. */
  readonly onchange?: (status: Status) => void;
  /** Called with the selected addresses whenever the selection changes. */
  readonly onselect?: (selection: readonly string[]) => void;
}

/** The handle a host holds on an editor it mounted. */
export interface TimeLineEditor {
  /** The open workspace as Save writes it. */
  text(): string;
  /** Open the workspace file `text` without asking; the reader's refusal, or `null` when it opened. */
  load(text: string, name?: string): LoadError | null;
  /** The selected addresses. */
  selection(): string[];
  /** Select `addresses`. */
  select(addresses: readonly string[]): void;
  /** Move the focus to the canvas. */
  focus(): void;
  /** Write the pending autosave, then remove the editor from its element. */
  destroy(): Promise<void>;
}
