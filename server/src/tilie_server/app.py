"""Compose the server's routes, static editor, and security middleware."""

from __future__ import annotations

from fastapi import FastAPI

from tilie_server import __version__
from tilie_server.routers.health import router as health_router
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


def create_app(settings: ServerSettings) -> FastAPI:
    """Build the application for one local origin and bearer token."""
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
    mount_static(app, static_dir)
    app.add_middleware(
        LocalOriginGuard,
        token=settings.token,
        hosts=settings.allowed_hosts(),
    )
    # Added last, so it is the outermost layer and covers the guard's rejections.
    app.add_middleware(NoReferrer)
    return app
