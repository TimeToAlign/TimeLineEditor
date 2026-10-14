import { describe, expect, it } from "vitest";
import { podmanArguments } from "../e2e/container.ts";

const common = { appRoot: "/w/app", image: "img", ci: false, args: ["--project=chromium"] };

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
    expect(podmanArguments({ ...common, schemaPackage, ci: true })).toEqual([
      ...BEFORE.slice(0, 7),
      "--env=CI",
      ...BEFORE.slice(7),
    ]);
  });

  it("mounts a schema package outside the app directory read-only and relabelled at its own path", () => {
    expect(podmanArguments({ ...common, schemaPackage: "/w/timeskeleton/js" })).toEqual([
      ...BEFORE.slice(0, 6),
      "--volume=/w/timeskeleton/js:/w/timeskeleton/js:ro,z",
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
