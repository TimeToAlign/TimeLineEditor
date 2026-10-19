"""Mount the built editor or expose the unbuilt response."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles


def mount_static(app: FastAPI, static_dir: Path) -> None:
    """Mount ``static_dir``, or make the root report that the app is absent."""
    if (static_dir / "index.html").is_file():
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
        return

    @app.get("/")
    def app_not_built() -> JSONResponse:
        return JSONResponse({"detail": "app not built"}, status_code=503)
