<script lang="ts">
import { name as arranger } from "@timetoalign/tilie-arranger";
import { name as client } from "@timetoalign/tilie-client";
import { name as core } from "@timetoalign/tilie-core";
import { name as layout } from "@timetoalign/tilie-layout";
import { name as writers } from "@timetoalign/tilie-writers";
import { onMount } from "svelte";

/** The body of `GET /api/health`. */
type Health = { name: string; version: string; timetoalign: string };

const packages = [core, layout, writers, arranger, client];

let status = $state("connecting to the server");

/**
 * Take the run's token from the fragment `tilie` opens the editor with
 * (`/#token=…`) and remove it from the address bar and the history entry.
 * The fragment never reaches the server, so the token stays out of its logs.
 */
function takeToken(): string {
  const token = new URLSearchParams(location.hash.slice(1)).get("token");
  if (token === null) {
    return "";
  }
  history.replaceState(history.state, "", `${location.pathname}${location.search}`);
  return token;
}

onMount(async () => {
  const token = takeToken();
  try {
    const response = await fetch("/api/health", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      status = `HTTP ${response.status} ${response.statusText}`;
      return;
    }
    const health = (await response.json()) as Health;
    status = `${health.name} ${health.version} (timetoalign ${health.timetoalign})`;
  } catch (error) {
    status = `server unreachable: ${error instanceof Error ? error.message : String(error)}`;
  }
});
</script>

<header>
  <h1>TimeLineEditor</h1>
  <p class="status" aria-live="polite">{status}</p>
</header>

<main>
  <section class="pane arranger">
    <h2>Arranger</h2>
  </section>
  <section class="pane inspector">
    <h2>Inspector</h2>
  </section>
  <section class="pane diagnostics">
    <h2>Diagnostics</h2>
  </section>
</main>

<footer>packages: {packages.join(", ")}</footer>

<style>
  :global(html, body, #app) {
    margin: 0;
    height: 100%;
  }

  :global(#app) {
    display: grid;
    grid-template-rows: auto 1fr auto;
    font-family: system-ui, sans-serif;
    color: #1a1a1a;
    background: #fafafa;
  }

  header,
  footer {
    display: flex;
    align-items: baseline;
    gap: 1rem;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid #d0d0d0;
  }

  footer {
    border-bottom: none;
    border-top: 1px solid #d0d0d0;
    font-size: 0.8rem;
    color: #555;
  }

  h1 {
    margin: 0;
    font-size: 1.1rem;
  }

  .status {
    margin: 0;
    font-size: 0.9rem;
    color: #555;
  }

  main {
    display: grid;
    grid-template-columns: 3fr 1fr;
    grid-template-rows: 1fr 10rem;
    grid-template-areas:
      "arranger inspector"
      "diagnostics diagnostics";
    gap: 1px;
    background: #d0d0d0;
    min-height: 0;
  }

  .pane {
    background: #fff;
    padding: 0.5rem 1rem;
    overflow: auto;
  }

  .pane h2 {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #777;
  }

  .arranger {
    grid-area: arranger;
  }

  .inspector {
    grid-area: inspector;
  }

  .diagnostics {
    grid-area: diagnostics;
  }
</style>
