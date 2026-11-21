"""Compose the server's routes, static editor, and security middleware."""

from __future__ import annotations

from fastapi import FastAPI

from tilie_server import __version__
from tilie_server.musicbrainz import MusicBrainz
from tilie_server.routers.claim_events import router as claim_events_router
from tilie_server.routers.claim_provenance import router as claim_provenance_router
from tilie_server.routers.health import router as health_router
from tilie_server.routers.lookup import router as lookup_router
from tilie_server.routers.match_claims import router as match_claims_router
from tilie_server.routers.measure_maps import router as measure_maps_router
from tilie_server.security import LocalOriginGuard, NoReferrer
from tilie_server.settings import (
    API_PREFIX,
    DEFAULT_STATIC_DIR,
    PACKAGE_NAME,
    ServerSettings,
)
from tilie_server.static import mount_static

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
    """Build the application for one local origin and bearer token.

    Args:
        settings: The run's origin, token and editor files.
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
    app.state.musicbrainz = MusicBrainz() if musicbrainz is None else musicbrainz
    mount_static(app, static_dir)
    app.add_middleware(
        LocalOriginGuard,
        token=settings.token,
        hosts=settings.allowed_hosts(),
    )
    # Added last, so it is the outermost layer and covers the guard's rejections.
    app.add_middleware(NoReferrer)
    return app
