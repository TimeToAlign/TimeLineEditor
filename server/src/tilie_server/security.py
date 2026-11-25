"""The origin, body-limit and referrer-policy ASGI middleware."""

from __future__ import annotations

import secrets

from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from tilie_server.settings import API_PREFIX, size_named


class OriginGuard:
    """Reject requests that do not come from the server's own origin.

    Three checks run on every HTTP request and WebSocket handshake, before any
    route is reached:

    * the ``Host`` header must be one of the server's hosts, which defeats
      DNS rebinding (403 otherwise);
    * an ``Origin`` header, when present, must be one of the server's
      origins, which defeats cross-site requests from other pages (403
      otherwise);
    * when the server has a token, every path under ``/api/`` must carry
      ``Authorization: Bearer <token>`` with that token (401 otherwise).

    A rejected WebSocket handshake is closed before it is accepted.
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        token: str | None,
        hosts: frozenset[str],
        origins: frozenset[str],
    ) -> None:
        self._app = app
        self._token = None if token is None else token.encode()
        self._hosts = hosts
        self._origins = origins

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
        if self._token is not None and path.startswith(API_PREFIX):
            expected = b"Bearer " + self._token
            given = headers.get("authorization", "").encode("latin-1")
            if not secrets.compare_digest(given, expected):
                return 401, "missing or invalid token"
        return None


def body_limit_message(limit: int) -> str:
    """The refusal of a body longer than ``limit`` bytes, the limit named by
    :func:`tilie_server.settings.size_named`."""
    return f"body larger than {size_named(limit)}"


class BodyLimit:
    """Refuse a request body longer than ``limit`` bytes with 413.

    A ``Content-Length`` over the limit is refused at once, without reading
    the body. A body sent without one (chunked) is read here, chunk by chunk,
    and refused as soon as the bytes received pass the limit; a body within
    it is handed to the application as it came, so the route runs only with
    a whole body inside the limit.
    """

    def __init__(self, app: ASGIApp, *, limit: int) -> None:
        self._app = app
        self._limit = limit

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return
        declared = dict(scope["headers"]).get(b"content-length")
        if declared is not None and declared.isdigit():
            if int(declared) > self._limit:
                await self._refuse(scope, receive, send)
                return
        chunks: list[Message] = []
        received = 0
        while True:
            message = await receive()
            chunks.append(message)
            if message["type"] != "http.request":
                break
            received += len(message.get("body", b""))
            if received > self._limit:
                await self._refuse(scope, receive, send)
                return
            if not message.get("more_body", False):
                break

        async def replay() -> Message:
            """The messages already received, in order, then the next ones."""
            return chunks.pop(0) if chunks else await receive()

        await self._app(scope, replay, send)

    async def _refuse(self, scope: Scope, receive: Receive, send: Send) -> None:
        refusal = JSONResponse({"detail": body_limit_message(self._limit)}, 413)
        await refusal(scope, receive, send)


class NoReferrer:
    """Send ``Referrer-Policy: no-referrer`` with every HTTP response.

    With this policy the browser sends none of the server's URLs as a
    ``Referer``, so no other site learns them, whatever a URL may carry.
    Rejections by :class:`OriginGuard` and :class:`BodyLimit` carry the
    header as well.
    """

    HEADER = (b"referrer-policy", b"no-referrer")

    def __init__(self, app: ASGIApp) -> None:
        self._app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return

        async def send_with_policy(message: Message) -> None:
            """Send a message, adding the header to the start of a response."""
            if message["type"] == "http.response.start":
                message["headers"] = [*message.get("headers", []), self.HEADER]
            await send(message)

        await self._app(scope, receive, send_with_policy)
