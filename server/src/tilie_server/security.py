"""The local-origin and referrer-policy ASGI middleware."""

from __future__ import annotations

import secrets

from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from tilie_server.settings import API_PREFIX


class LocalOriginGuard:
    """Reject requests that do not come from the server's own origin.

    Three checks run on every HTTP request and WebSocket handshake, before any
    route is reached:

    * the ``Host`` header must name the server itself, which defeats DNS
      rebinding (403 otherwise);
    * an ``Origin`` header, when present, must be the server's own origin,
      which defeats cross-site requests from other pages (403 otherwise);
    * every path under ``/api/`` must carry ``Authorization: Bearer <token>``
      with the token generated for this run (401 otherwise).

    A rejected WebSocket handshake is closed before it is accepted.
    """

    def __init__(self, app: ASGIApp, *, token: str, hosts: frozenset[str]) -> None:
        self._app = app
        self._token = token.encode()
        self._hosts = hosts
        self._origins = frozenset(f"http://{host}" for host in hosts)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self._app(scope, receive, send)
            return
        headers = {
            key.decode("latin-1").lower(): value.decode("latin-1")
            for key, value in scope["headers"]
        }
        rejection = self._rejection(scope["path"], headers)
        if rejection is None:
            await self._app(scope, receive, send)
        elif scope["type"] == "websocket":
            await send({"type": "websocket.close", "code": 1008})
        else:
            status, detail = rejection
            await JSONResponse({"detail": detail}, status_code=status)(
                scope, receive, send
            )

    def _rejection(self, path: str, headers: dict[str, str]) -> tuple[int, str] | None:
        if headers.get("host") not in self._hosts:
            return 403, "forbidden host"
        origin = headers.get("origin")
        if origin is not None and origin not in self._origins:
            return 403, "forbidden origin"
        if path.startswith(API_PREFIX):
            expected = b"Bearer " + self._token
            given = headers.get("authorization", "").encode("latin-1")
            if not secrets.compare_digest(given, expected):
                return 401, "missing or invalid token"
        return None


class NoReferrer:
    """Send ``Referrer-Policy: no-referrer`` with every HTTP response.

    With this policy the browser sends none of the server's URLs as a
    ``Referer``, so no other site learns them, whatever a URL may carry.
    Rejections by :class:`LocalOriginGuard` carry the header as well.
    """

    HEADER = (b"referrer-policy", b"no-referrer")

    def __init__(self, app: ASGIApp) -> None:
        self._app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return

        async def send_with_policy(message: Message) -> None:
            if message["type"] == "http.response.start":
                message["headers"] = [*message.get("headers", []), self.HEADER]
            await send(message)

        await self._app(scope, receive, send_with_policy)
