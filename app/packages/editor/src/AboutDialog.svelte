<script lang="ts">
import { name as arranger } from "@timetoalign/tilie-arranger";
import type { Health } from "@timetoalign/tilie-client";
import { name as client } from "@timetoalign/tilie-client";
import { name as core } from "@timetoalign/tilie-core";
import { name as layout } from "@timetoalign/tilie-layout";
import { name as writers } from "@timetoalign/tilie-writers";
import { SCHEMA_VERSION } from "@timetoalign/timeskeleton";
import { ATTRIBUTIONS, NOTICES_FILE } from "./attributions.ts";

interface Props {
  /** Whether the editor has a server to ask; without one the pane says "no server". */
  connected: boolean;
  /** The server's health response; `null` until it answers or when it failed. */
  health: Health | null;
  /** Why the health check failed; empty while it has not failed. */
  offline: string;
  /** Where the full licence texts are. */
  noticesUrl: string;
}

let { connected, health, offline, noticesUrl }: Props = $props();

const id = $props.id();

const PACKAGES = [core, layout, writers, arranger, client];

let dialog: HTMLDialogElement | undefined = $state();
let closeButton: HTMLButtonElement | undefined = $state();

const server = $derived(
  !connected
    ? "no server"
    : health !== null
      ? `${health.name} ${health.version} (timetoalign ${health.timetoalign})`
      : offline !== ""
        ? `offline: ${offline}`
        : "waiting for the server",
);

/** Show the pane as a modal dialog. */
export function open(): void {
  dialog?.showModal();
  closeButton?.focus();
}
</script>

<dialog bind:this={dialog} aria-labelledby="{id}-heading" class="about">
  <h2 id="{id}-heading">About TimeLineEditor</h2>
  <dl>
    <dt>Editor</dt>
    <dd data-testid="about-editor">TimeLineEditor {__TILIE_VERSION__}</dd>
    <dt>Server</dt>
    <dd data-testid="about-server">{server}</dd>
    <dt>Schema</dt>
    <dd data-testid="about-schema">
      timeskeleton {__TIMESKELETON_VERSION__}, schema version {SCHEMA_VERSION}
    </dd>
    <dt>Packages</dt>
    <dd>
      <ul class="packages" data-testid="about-packages">
        {#each PACKAGES as name (name)}<li>{name}</li>{/each}
      </ul>
    </dd>
  </dl>
  <h3>Third-party software</h3>
  <p class="notices">
    The full licence texts are in
    <a href={noticesUrl} target="_blank" rel="noopener">{NOTICES_FILE}</a>.
  </p>
  <ul class="attributions" data-testid="about-attributions">
    {#each ATTRIBUTIONS as item (item.name)}
      <li>
        <span class="name">{item.name}</span>, {item.licence}
        {#each item.copyright as line (line)}<br /><span class="copyright">{line}</span>{/each}
      </li>
    {/each}
  </ul>
  <div class="close">
    <button type="button" bind:this={closeButton} onclick={() => dialog?.close()}>Close</button>
  </div>
</dialog>

<style>
  dialog {
    width: min(36rem, calc(100% - 2rem));
    max-height: calc(100% - 4rem);
    padding: 1rem 1.25rem;
    border: 1px solid #bdbdbd;
    border-radius: 6px;
    font-size: 0.85rem;
  }

  dialog::backdrop {
    background: rgba(0, 0, 0, 0.25);
  }

  h2 {
    margin: 0 0 0.75rem;
    font-size: 1rem;
  }

  h3 {
    margin: 1rem 0 0.4rem;
    font-size: 0.9rem;
  }

  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.3rem 1rem;
    margin: 0;
  }

  dt {
    font-weight: 600;
  }

  dd {
    margin: 0;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .notices {
    margin: 0 0 0.4rem;
  }

  a {
    color: #0b57d0;
  }

  .attributions li {
    padding: 0.2rem 0;
  }

  .name {
    font-weight: 600;
  }

  .copyright {
    color: #595959;
  }

  .close {
    display: flex;
    justify-content: flex-end;
    margin-top: 1rem;
  }

  button {
    padding: 0.3rem 0.8rem;
    border: 1px solid #bdbdbd;
    border-radius: 4px;
    background: #fafafa;
    font: inherit;
    color: inherit;
    cursor: pointer;
  }

  button:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }
</style>
