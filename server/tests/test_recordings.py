"""The recorded answers the client package's tests replay (README, "Recorded
answers")."""

from __future__ import annotations

import importlib
import importlib.util
import json
import pkgutil
from pathlib import Path
from types import ModuleType

import pytest
from fastapi.routing import APIRoute

import tilie_server.routers

SCRIPT = Path(__file__).parent.parent / "scripts" / "record_answers.py"

LOOKUP = "/api/reconcile/"
"""The MusicBrainz routes, the editor's lookup, which no recording covers."""


@pytest.fixture(scope="module")
def script() -> ModuleType:
    """The recording script, loaded as a module."""
    spec = importlib.util.spec_from_file_location("record_answers", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_every_recording_is_the_routes_answer(
    script: ModuleType, tmp_path: Path
) -> None:
    script.main([str(tmp_path)])
    committed: Path = script.RECORDINGS_FOLDER
    names = sorted(path.name for path in committed.glob("*.answer.bin"))
    assert sorted(path.name for path in tmp_path.iterdir()) == names
    assert names == sorted(f"{name}.answer.bin" for name in script.RECORDINGS)
    for name in names:
        recorded = (committed / name).read_bytes()
        answered = (tmp_path / name).read_bytes()
        if name == "health.answer.bin":
            # The values are the installed versions; the form is what is recorded.
            shapes = [
                {key: type(value).__name__ for key, value in json.loads(text).items()}
                for text in (recorded, answered)
            ]
            assert shapes[0] == shapes[1]
            assert set(shapes[0].values()) == {"str"}
        else:
            assert recorded == answered, f"{name} is not the route's answer"


def test_every_route_the_client_calls_is_recorded(script: ModuleType) -> None:
    modules = [
        importlib.import_module(f"tilie_server.routers.{found.name}")
        for found in pkgutil.iter_modules(tilie_server.routers.__path__)
    ]
    routes = {
        (method, route.path)
        for module in modules
        for route in module.router.routes
        if isinstance(route, APIRoute) and not route.path.startswith(LOOKUP)
        for method in route.methods
    }
    recorded = {(method, path) for method, path, _ in script.RECORDINGS.values()}
    assert recorded == routes
