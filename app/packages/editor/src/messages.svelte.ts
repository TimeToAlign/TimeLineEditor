/**
 * The editor's one message system: every message the editor shows, at one
 * of three levels, listed by the message bar; the one way a component
 * below the editor posts one (`post`, from the component context); and the
 * text of a failure in a message.
 */

import type { Problem } from "@timetoalign/tilie-core";
import { getContext, setContext } from "svelte";

/**
 * How much a message weighs: information passes by itself, a warning says
 * what the user must know although nothing failed, an error reports an
 * operation that failed. Warnings and errors stay until dismissed.
 */
export type MessageLevel = "info" | "warning" | "error";

/** One message: its level, its text, and the reader's problems when there are any. */
export interface Message {
  readonly id: number;
  readonly level: MessageLevel;
  readonly text: string;
  readonly problems: readonly Problem[];
}

/** How long a message of level `info` is shown. */
export const INFO_DURATION_MS = 3000;

/** Post one message at `level`, with the problems that explain it. */
export type Post = (level: MessageLevel, text: string, problems?: readonly Problem[]) => void;

/** The messages shown, in the order posted. */
export class Messages {
  /** The messages shown, oldest first. */
  shown: readonly Message[] = $state.raw([]);
  #count = 0;
  /** The pending self-dismissals of the information shown. */
  readonly #timers = new Map<number, ReturnType<typeof setTimeout>>();

  /**
   * Show a message. Information is dismissed after `INFO_DURATION_MS`, and
   * replaces information of the same text still shown (posted again, it
   * shows once, timed from now); a warning or an error stays until
   * dismissed. Editing goes on either way.
   */
  post(level: MessageLevel, text: string, problems: readonly Problem[] = []): void {
    if (level === "info") {
      const same = this.shown.find((shown) => shown.level === "info" && shown.text === text);
      if (same !== undefined) this.dismiss(same.id);
    }
    this.#count += 1;
    const id = this.#count;
    this.shown = [...this.shown, { id, level, text, problems }];
    if (level === "info") {
      this.#timers.set(
        id,
        setTimeout(() => this.dismiss(id), INFO_DURATION_MS),
      );
    }
  }

  /** Dismiss the message `id`. */
  dismiss(id: number): void {
    clearTimeout(this.#timers.get(id));
    this.#timers.delete(id);
    this.shown = this.shown.filter((message) => message.id !== id);
  }

  /** Cancel every pending self-dismissal; the messages are not used afterwards. */
  dispose(): void {
    for (const timer of this.#timers.values()) clearTimeout(timer);
    this.#timers.clear();
  }
}

const POST = Symbol("post");

/** Give the components below the calling one `post`; called while the component is made. */
export function providePost(post: Post): void {
  setContext(POST, post);
}

/**
 * The `post` a component above the calling one provides; called while the
 * component is made.
 *
 * @throws {Error} if none provides one.
 */
export function postOf(): Post {
  const post = getContext<Post | undefined>(POST);
  if (post === undefined) throw new Error("no component above this one provides post");
  return post;
}

/** The component context that provides `post`, for a component mounted on its own (`mount`'s `context`). */
export function postContext(post: Post): Map<symbol, Post> {
  return new Map([[POST, post]]);
}

/** The text of a failure to show the viewer: an error's message, else the value as text. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
