/**
 * The `podman run` arguments of `run.ts`, a pure function of its inputs so
 * that both mount cases are tested without starting a container.
 */

import path from "node:path";

export interface ContainerOptions {
  /** The absolute path of `app/`, mounted read-write at its own path. */
  readonly appRoot: string;
  /** The real directory of the installed `@timetoalign/timeskeleton`. */
  readonly schemaPackage: string;
  /** The Playwright image. */
  readonly image: string;
  /** Whether the run is a CI run (`CI` is passed into the container). */
  readonly ci: boolean;
  /** The `playwright test` arguments. */
  readonly args: readonly string[];
}

/** Whether `directory` lies inside `root` or is `root` itself. */
function isInside(root: string, directory: string): boolean {
  const relative = path.relative(root, directory);
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

/**
 * The arguments of `podman run`: the app directory mounted at its own path,
 * the host network and IPC namespace, and the same `node e2e/run.ts` inside
 * the image. A schema package linked from a sibling checkout lies outside
 * `app/` and so is invisible in the container; it is added as one read-only
 * volume at its own absolute path, where the links in `node_modules` find it,
 * relabelled (`z`) as the app's volume is, for hosts that enforce SELinux.
 */
export function podmanArguments(options: ContainerOptions): string[] {
  const { appRoot, schemaPackage, image, ci, args } = options;
  return [
    "run",
    "--rm",
    "--init",
    "--network=host",
    "--ipc=host",
    `--volume=${appRoot}:${appRoot}:z`,
    ...(isInside(appRoot, schemaPackage)
      ? []
      : [`--volume=${schemaPackage}:${schemaPackage}:ro,z`]),
    `--workdir=${appRoot}`,
    ...(ci ? ["--env=CI"] : []),
    image,
    "node",
    "e2e/run.ts",
    ...args,
  ];
}
