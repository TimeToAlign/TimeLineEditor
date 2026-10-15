/// <reference types="node" />
/** A failed import of a codec is shown in the drawer; derived in `README.md` ("The inspector"). */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createStore, createView, isLoadError, loadManifest } from "@timetoalign/tilie-core";
import { SCHEMA_VERSION } from "@timetoalign/timeskeleton";
import { flushSync, mount, tick, unmount } from "svelte";
import { expect, it, vi } from "vitest";
import { loadCodec } from "../src/inspector/formats.ts";
import Inspector from "../src/inspector/Inspector.svelte";

vi.mock("../src/inspector/toml.ts", () => {
  throw new Error("network down");
});

it("shows a failed codec import as an alert and keeps JSON working", async () => {
  const manifest = loadManifest(
    readFileSync(
      path.join(
        path.dirname(
          createRequire(import.meta.url).resolve("@timetoalign/timeskeleton/package.json"),
        ),
        "fixtures",
        SCHEMA_VERSION,
        "bare.json",
      ),
      "utf8",
    ),
  );
  if (isLoadError(manifest)) throw new Error("bare refused");
  const store = createStore({ view: createView(), journal: [] });
  const id = "0000000000";
  const error = store.dispatch({
    type: "add",
    into: "workspace",
    block: { id, x: 0, y: 0, manifest },
  });
  expect(error).toBe(null);
  const app = mount(Inspector, {
    target: document.body,
    props: { store, selection: new Set([id]) },
  });
  flushSync();
  (document.getElementById("inspector-tab-manifest") as HTMLElement).click();
  flushSync();
  (document.querySelector('input[value="toml"]') as HTMLInputElement).click();
  flushSync();
  const failure = await loadCodec("toml").then(
    () => null,
    (reason: unknown) => (reason as Error).message,
  );
  expect(failure).not.toBe(null);
  await tick();
  flushSync();
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    `TOML could not be loaded (${failure}).`,
  );
  expect(document.querySelector("textarea")).toBe(null);
  (document.querySelector('input[value="json"]') as HTMLInputElement).click();
  flushSync();
  expect(document.querySelector('[role="alert"]')).toBe(null);
  expect(document.querySelector("textarea")?.value.startsWith("{\n")).toBe(true);
  unmount(app);
  document.body.innerHTML = "";
});
