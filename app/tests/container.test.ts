import { describe, expect, it } from "vitest";
import { podmanArguments } from "../e2e/container.ts";

const common = { appRoot: "/w/app", image: "img", env: [], args: ["--project=chromium"] };

const BEFORE = [
  "run",
  "--rm",
  "--init",
  "--network=host",
  "--ipc=host",
  "--volume=/w/app:/w/app:z",
  "--workdir=/w/app",
  "img",
  "node",
  "e2e/run.ts",
  "--project=chromium",
];

describe("podmanArguments", () => {
  it("adds nothing for a schema package inside the app directory", () => {
    const schemaPackage = "/w/app/node_modules/.pnpm/x/node_modules/y";
    expect(podmanArguments({ ...common, schemaPackage })).toEqual(BEFORE);
  });

  it("passes each named variable by its name alone, after the working directory, in order", () => {
    const schemaPackage = "/w/app/node_modules/.pnpm/x/node_modules/y";
    expect(podmanArguments({ ...common, schemaPackage, env: ["CI", "TILIE_E2E_WORKERS"] })).toEqual(
      [...BEFORE.slice(0, 7), "--env=CI", "--env=TILIE_E2E_WORKERS", ...BEFORE.slice(7)],
    );
    expect(podmanArguments({ ...common, schemaPackage, env: ["TILIE_E2E_WORKERS"] })).toEqual([
      ...BEFORE.slice(0, 7),
      "--env=TILIE_E2E_WORKERS",
      ...BEFORE.slice(7),
    ]);
  });

  it("mounts a schema package outside the app directory read-only and relabelled at its own path", () => {
    expect(podmanArguments({ ...common, schemaPackage: "/w/TimeToShare/js" })).toEqual([
      ...BEFORE.slice(0, 6),
      "--volume=/w/TimeToShare/js:/w/TimeToShare/js:ro,z",
      ...BEFORE.slice(6),
    ]);
  });

  it("treats a sibling whose name extends the app directory's as outside", () => {
    expect(podmanArguments({ ...common, schemaPackage: "/w/app-schema" })).toEqual([
      ...BEFORE.slice(0, 6),
      "--volume=/w/app-schema:/w/app-schema:ro,z",
      ...BEFORE.slice(6),
    ]);
  });
});
