import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const appRoot = path.resolve(import.meta.dirname, "..");

type Violation = { rule: { name: string; severity: string }; from: string; to: string };
type CruiseResult = { summary: { violations: Violation[]; error: number } };

/** The `depcruise` entry point of the installed dependency-cruiser, as its manifest declares it. */
function depcruiseBin(): string {
  const packageDir = path.join(appRoot, "node_modules", "dependency-cruiser");
  const manifest = JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8")) as {
    bin: Record<string, string>;
  };
  return path.join(packageDir, manifest.bin.depcruise ?? "");
}

/** Runs the real configuration on a scratch workspace and returns the violations and exit code. */
function cruise(scratch: string): { violations: Violation[]; status: number | null } {
  const run = spawnSync(
    process.execPath,
    [depcruiseBin(), "--config", ".dependency-cruiser.cjs", "--output-type", "json", "packages"],
    { cwd: scratch, encoding: "utf8" },
  );
  const result = JSON.parse(run.stdout) as CruiseResult;
  expect(run.status, run.stderr).toBe(0);
  // The JSON reporter returns data without a failing exit status. The default
  // reporter is what lint and standalone enforcement commands actually use.
  const validation = spawnSync(
    process.execPath,
    [depcruiseBin(), "--config", ".dependency-cruiser.cjs", "packages"],
    { cwd: scratch, encoding: "utf8" },
  );
  return {
    violations: result.summary.violations.map(({ rule, from, to }) => ({ rule, from, to })),
    status: validation.status,
  };
}

function writePackage(scratch: string, name: string, extraSource = ""): void {
  const dir = path.join(scratch, "packages", name, "src");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "index.ts"),
    `export const name = "@timetoalign/tilie-${name}" as const;\n${extraSource}`,
  );
}

describe("the package ladder", () => {
  let scratch = "";

  beforeEach(() => {
    scratch = mkdtempSync(path.join(tmpdir(), "tilie-ladder-"));
    for (const file of [".dependency-cruiser.cjs", "tsconfig.base.json"]) {
      cpSync(path.join(appRoot, file), path.join(scratch, file));
    }
    writePackage(scratch, "core");
    writePackage(scratch, "layout");
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it("accepts a tree that respects the ladder", () => {
    expect(cruise(scratch)).toEqual({ violations: [], status: 0 });
  });

  it("rejects core importing another workspace package", () => {
    writePackage(scratch, "core", 'import "@timetoalign/tilie-layout";\n');
    const { violations, status } = cruise(scratch);
    expect(violations).toEqual([
      {
        rule: { name: "core-imports-no-workspace-package", severity: "error" },
        from: "packages/core/src/index.ts",
        to: "@timetoalign/tilie-layout",
      },
    ]);
    expect(status).toBe(1);
  });

  it("rejects svelte below the arranger", () => {
    writePackage(scratch, "core", 'import "svelte";\n');
    const { violations, status } = cruise(scratch);
    expect(violations).toEqual([
      {
        rule: { name: "no-svelte-outside-arranger-and-editor", severity: "error" },
        from: "packages/core/src/index.ts",
        to: "svelte",
      },
    ]);
    expect(status).toBe(1);
  });

  it.each(["index.ts", "missing.ts"])("rejects a relative workspace import to %s", (file) => {
    writePackage(scratch, "core", `import "../../layout/src/${file}";\n`);
    const { violations, status } = cruise(scratch);
    expect(violations.map((v) => v.rule.name)).toEqual(["core-imports-no-workspace-package"]);
    expect(status).toBe(1);
  });

  it("rejects resolved Svelte and unresolved Svelte subpaths", () => {
    mkdirSync(path.join(scratch, "node_modules"));
    symlinkSync(
      path.join(appRoot, "packages/editor/node_modules/svelte"),
      path.join(scratch, "node_modules/svelte"),
      "dir",
    );
    writePackage(scratch, "core", 'import "svelte";\nimport "svelte/not-a-real-export";\n');
    const { violations, status } = cruise(scratch);
    expect(violations.map((v) => v.rule.name)).toEqual([
      "no-svelte-outside-arranger-and-editor",
      "no-svelte-outside-arranger-and-editor",
    ]);
    expect(violations.filter((v) => v.to.includes("node_modules/svelte/")).length).toBe(1);
    expect(status).toBe(2);
  });

  it("enforces every workspace edge and the Svelte boundary", () => {
    const allowed: Record<string, string[]> = {
      core: [],
      layout: ["core"],
      writers: ["core", "layout"],
      arranger: ["core", "layout"],
      client: ["core"],
      editor: ["core", "layout", "writers", "arranger", "client"],
    };
    const rules: Record<string, string> = {
      core: "core-imports-no-workspace-package",
      layout: "layout-imports-core-only",
      writers: "writers-imports-layout-and-core-only",
      arranger: "arranger-imports-layout-and-core-only",
      client: "client-imports-core-only",
    };
    const expected: string[] = [];
    for (const [source, targets] of Object.entries(allowed)) {
      const imports = Object.keys(allowed).filter((target) => target !== source);
      writePackage(
        scratch,
        source,
        [
          ...imports.map((target) => `import "@timetoalign/tilie-${target}";`),
          'import "svelte/store";',
        ].join("\n"),
      );
      for (const target of imports) {
        if (!targets.includes(target))
          expected.push(`${source}: ${rules[source]}: @timetoalign/tilie-${target}`);
      }
      if (!["arranger", "editor"].includes(source))
        expected.push(`${source}: no-svelte-outside-arranger-and-editor: svelte/store`);
    }
    const { violations, status } = cruise(scratch);
    expect(
      violations.map((v) => `${v.from.split("/")[1]}: ${v.rule.name}: ${v.to}`).sort(),
    ).toEqual(expected.sort());
    expect(status).toBe(23);
  });

  it("rejects DOM-only modules in core", () => {
    writePackage(scratch, "core", 'import "react-dom/client";\n');
    const { violations, status } = cruise(scratch);
    expect(violations.map((v) => v.rule.name)).toEqual(["core-no-dom-modules"]);
    expect(status).toBe(1);
  });

  it("rejects circular imports within a package", () => {
    writePackage(scratch, "core", 'import "./other.ts";\n');
    writeFileSync(path.join(scratch, "packages/core/src/other.ts"), 'import "./index.ts";\n');
    const { violations, status } = cruise(scratch);
    expect(violations.map((v) => v.rule.name)).toEqual(["no-circular"]);
    expect(status).toBe(1);
  });
});
