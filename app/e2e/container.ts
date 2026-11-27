/**
 * The `podman run` arguments of `run.ts`, a pure function of its inputs so
 * that every mount case is tested without starting a container.
 */

import path from "node:path";

export interface ContainerOptions {
  /** The absolute path of `app/`, mounted read-write at its own path. */
  readonly appRoot: string;
  /** The real directory of the installed `@timetoalign/timetoshare`. */
  readonly schemaPackage: string;
  /**
   * The path the packages' symbolic link to it names, resolved lexically
   * from the link's directory, or `null` when the package is no link.
   */
  readonly linkedPackage: string | null;
  /** The Playwright image. */
  readonly image: string;
  /**
   * A directory of data some specs read that lies outside `app/` (the musical themes dataset,
   * `MUSICAL_THEMES_DATASET`), mounted read-only at its own path; `null` for none.
   */
  readonly dataset?: string | null;
  /** The names of the host variables passed into the container, with their host values. */
  readonly env: readonly string[];
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
 * the host network and IPC namespace, each variable of `env` by its name
 * alone (podman copies the host's value), and the same `node e2e/run.ts`
 * inside the image. A schema package linked from a sibling checkout lies
 * outside `app/` and so is invisible in the container; its real directory
 * is added as a read-only volume at its own absolute path and, when the
 * sibling checkout is reached through a symbolic link, again at the path the
 * links in `node_modules` name, which the container resolves lexically; each
 * is relabelled (`z`) as the app's volume is, for hosts that enforce SELinux.
 * A data directory outside `app/` is mounted read-only at its own path after
 * them, so a spec reading it finds it where the host's variable names it.
 */
export function podmanArguments(options: ContainerOptions): string[] {
  const { appRoot, schemaPackage, linkedPackage, image, env, args, dataset = null } = options;
  const targets = new Set([schemaPackage, linkedPackage ?? schemaPackage]);
  return [
    "run",
    "--rm",
    "--init",
    "--network=host",
    "--ipc=host",
    `--volume=${appRoot}:${appRoot}:z`,
    ...[...targets]
      .filter((target) => !isInside(appRoot, target))
      .map((target) => `--volume=${schemaPackage}:${target}:ro,z`),
    ...(dataset === null || isInside(appRoot, dataset)
      ? []
      : [`--volume=${dataset}:${dataset}:ro,z`]),
    `--workdir=${appRoot}`,
    ...env.map((name) => `--env=${name}`),
    image,
    "node",
    "e2e/run.ts",
    ...args,
  ];
}
