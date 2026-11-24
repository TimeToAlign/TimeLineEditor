<script lang="ts">
/**
 * The message bar over the canvas, the one place the editor shows its
 * messages: one card per message, oldest first, one under another, so no
 * card covers another. Each names its level in words, takes its level's
 * colours (information blue, a warning amber, an error red) and has a
 * Dismiss button. Nothing here takes the focus.
 *
 * Screen readers hear the messages through two regions present from the
 * first drawing on, visually hidden: a `status` region for information and
 * an `alert` region for warnings and errors, each holding a line per
 * message of its levels. A live region is announced reliably only when it
 * was in the document before its content changed, so a posted message adds
 * its line to a region that already exists; the cards carry no live role,
 * so nothing is announced twice.
 */
import ProblemList from "./inspector/ProblemList.svelte";
import type { Message, MessageLevel } from "./messages.svelte.ts";

interface Props {
  messages: readonly Message[];
  ondismiss: (id: number) => void;
}

let { messages, ondismiss }: Props = $props();

/** The word naming each level, before the message's text. */
const LEVEL_WORDS: Readonly<Record<MessageLevel, string>> = {
  info: "Info",
  warning: "Warning",
  error: "Error",
};

/** The information shown, announced politely. */
const passing = $derived(messages.filter((message) => message.level === "info"));
/** The warnings and errors shown, announced at once. */
const staying = $derived(messages.filter((message) => message.level !== "info"));
</script>

{#snippet announced(shown: readonly Message[])}
  {#each shown as message (message.id)}
    <p>{LEVEL_WORDS[message.level]}: {message.text}</p>
  {/each}
{/snippet}

<!-- Non-modal: editing goes on while messages are shown. -->
<section class="messages" aria-label="Messages">
  <div class="announcer" role="status" aria-atomic="false" data-testid="messages-status">
    {@render announced(passing)}
  </div>
  <div class="announcer" role="alert" aria-atomic="false" data-testid="messages-alert">
    {@render announced(staying)}
  </div>
  {#each messages as message (message.id)}
    <div class="message" data-testid="message" data-level={message.level}>
      <div class="line">
        <span class="level">{LEVEL_WORDS[message.level]}</span>
        <p>{message.text}</p>
      </div>
      {#if message.problems.length > 0}
        <div class="problems"><ProblemList problems={message.problems} /></div>
      {/if}
      <button type="button" aria-label="Dismiss" title="Dismiss" onclick={() => ondismiss(message.id)}
        >×</button
      >
    </div>
  {/each}
</section>

<style>
  .messages {
    position: absolute;
    top: 0.5rem;
    left: 50%;
    z-index: 20;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    width: min(36rem, calc(100% - 4rem));
    transform: translateX(-50%);
    pointer-events: none;
  }

  /* Heard, never seen: kept in the accessibility tree, collapsed to nothing on the screen. */
  .announcer {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .message {
    position: relative;
    padding: 0.5rem 2rem 0.5rem 0.75rem;
    border: 1px solid #c9a227;
    border-left-width: 4px;
    border-radius: 4px;
    background: #fff8e1;
    font-size: 0.85rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    pointer-events: auto;
  }

  .message[data-level="info"] {
    border-color: #7aa7d9;
    background: #eef5fd;
  }

  .message[data-level="error"] {
    border-color: #c0392b;
    background: #fdecea;
  }

  .line {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
  }

  .level {
    flex: none;
    font-weight: 600;
  }

  p {
    margin: 0;
  }

  .problems {
    margin: 0.3rem 0 0;
    max-height: 12rem;
    overflow: auto;
  }

  button {
    position: absolute;
    top: 0.25rem;
    right: 0.25rem;
    padding: 0 0.4rem;
    border: none;
    background: none;
    font: inherit;
    font-size: 1rem;
    color: inherit;
    cursor: pointer;
  }

  button:focus-visible {
    outline: 2px solid #0a84ff;
  }
</style>
