"""Bundle the built editor into the wheel.

The front end lives in ``../app`` and is built by ``pnpm build`` into
``app/packages/editor/dist``. This hook copies that directory into
``src/tilie_server/static`` (ignored by git, declared as a build artifact in
``pyproject.toml``) so that the wheel ships the app and ``tilie`` can serve it
without Node.js on the user's machine.

Building from a source distribution works as well: the sdist carries the copy
made at sdist time, so a wheel built from it finds the app in place. A wheel
build without a built app fails with a clear message; an sdist may omit it.
"""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from hatchling.builders.hooks.plugin.interface import BuildHookInterface

STATIC_DIR = Path("src/tilie_server/static")
EDITOR_DIST = Path("../app/packages/editor/dist")


class BundleEditorHook(BuildHookInterface):
    """Copy the built editor into the package before the wheel is assembled."""

    PLUGIN_NAME = "custom"

    def initialize(self, version: str, build_data: dict[str, Any]) -> None:
        if version == "editable":
            return
        root = Path(self.root)
        static = root / STATIC_DIR
        dist = (root / EDITOR_DIST).resolve()
        if (dist / "index.html").is_file():
            shutil.rmtree(static, ignore_errors=True)
            shutil.copytree(dist, static)
        elif (root / "../app/package.json").is_file():
            # A source checkout must never reuse an older copied bundle.
            shutil.rmtree(static, ignore_errors=True)
        if self.target_name == "wheel" and not (static / "index.html").is_file():
            raise RuntimeError(
                "The editor has not been built: "
                f"{dist / 'index.html'} is missing. Run `pnpm install` and "
                "`pnpm build` in the `app` directory before building the wheel."
            )
