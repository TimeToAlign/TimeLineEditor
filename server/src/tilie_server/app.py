"""Compose the server's routes, static editor, and security middleware."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException

from tilie_server import __version__
from tilie_server.musicbrainz import MusicBrainz
from tilie_server.routers.claim_events import router as claim_events_router
from tilie_server.routers.claim_provenance import router as claim_provenance_router
from tilie_server.routers.files import router as files_router
from tilie_server.routers.health import router as health_router
from tilie_server.routers.lookup import router as lookup_router
from tilie_server.routers.match_claims import TableBounds
from tilie_server.routers.match_claims import router as match_claims_router
from tilie_server.routers.measure_maps import router as measure_maps_router
from tilie_server.security import BodyLimit, NoReferrer, OriginGuard
from tilie_server.settings import (
    API_PREFIX,
    DEFAULT_STATIC_DIR,
    PACKAGE_NAME,
    ServerSettings,
)
from tilie_server.static import mount_static

API_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
"""The methods for which a public server answers an unserved ``/api/`` path 404."""

__all__ = [
    "API_PREFIX",
    "DEFAULT_STATIC_DIR",
    "PACKAGE_NAME",
    "ServerSettings",
    "create_app",
]


def create_app(
    settings: ServerSettings, *, musicbrainz: MusicBrainz | None = None
) -> FastAPI:
    """Build the application for one run, local or public.

    A local run answers to its loopback origin with the run's bearer token
    and serves the file routes. A public run answers as its public hosts,
    checks no token, serves no file routes and bounds every request body
    and every posted table;
    every ``/api/`` path no route serves then answers 404, whatever the
    method, so no request to the API reaches the editor's files.

    Args:
        settings: The run's hosts, token, editor files, root folder, file
            access, body limit and table bounds.
        musicbrainz: The one client of MusicBrainz for the run's lookups; a
            new :class:`MusicBrainz` when not given.
    """
    static_dir = (
        DEFAULT_STATIC_DIR if settings.static_dir is None else settings.static_dir
    )
    app = FastAPI(
        title=PACKAGE_NAME,
        version=__version__,
        openapi_url=None,
        docs_url=None,
        redoc_url=None,
    )
    app.include_router(health_router)
    app.include_router(measure_maps_router)
    app.include_router(match_claims_router)
    app.include_router(claim_provenance_router)
    app.include_router(claim_events_router)
    app.include_router(lookup_router)
    if settings.files:
        app.include_router(files_router)
    else:
        # Without it a PUT to a file route would reach the editor's mount at
        # "/", which answers 405 to every method but GET and HEAD.
        @app.api_route(f"{API_PREFIX}{{path:path}}", methods=API_METHODS)
        def not_served(path: str) -> None:
            raise HTTPException(status_code=404)

    app.state.musicbrainz = MusicBrainz() if musicbrainz is None else musicbrainz
    app.state.files = settings.files
    app.state.table_bounds = TableBounds(settings.table_rows, settings.table_bytes)
    # Resolved once, so a root given through a symbolic link holds its files.
    app.state.root = settings.root.resolve()
    mount_static(app, static_dir)
    if settings.body_limit is not None:
        # Added before the guard, so it runs inside it: a foreign request is
        # refused for its origin before its body is looked at.
        app.add_middleware(BodyLimit, limit=settings.body_limit)
    app.add_middleware(
        OriginGuard,
        token=settings.token,
        hosts=settings.allowed_hosts(),
        origins=settings.allowed_origins(),
    )
    # Added last, so it is the outermost layer and covers the guard's rejections.
    app.add_middleware(NoReferrer)
    return app
