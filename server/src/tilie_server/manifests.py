"""Reading what a request posts, the manifest in it, and refusing a request.

The editor posts a manifest file's text, in any serialization timetoshare
reads, with every ID written ``#id``. timetoshare's reader is imported when
a request needs it, so a server whose installed timetoshare lacks it still
starts and answers every other route; a route needing it then answers 501.
timetoshare is no direct requirement of the server: timetoalign requires it.

The routes that compute their answer from a posted body are plain functions,
which the framework runs on its thread pool, so that a long computation
leaves the event loop free for every other request; they take the body as a
:data:`PostedBody`, which reads it on the event loop. A server may limit how
many such computations run at once: a computation beyond the limit waits on
the event loop, holding no worker thread, until one ends.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Callable
from importlib.metadata import PackageNotFoundError, version
from typing import Annotated, Any

from fastapi import Depends, Request
from fastapi.responses import JSONResponse


class Refusal(Exception):
    """A request a route cannot answer, with the path of what it refuses and,
    for a refused table, every problem found in it."""

    def __init__(
        self,
        path: list[str | int],
        message: str,
        status_code: int = 422,
        problems: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(message)
        self.path = path
        self.message = message
        self.status_code = status_code
        self.problems = problems

    def response(self) -> JSONResponse:
        """The answer ``{"detail": {"path", "message"}}``, with ``problems``
        besides where they are given."""
        detail: dict[str, Any] = {"path": self.path, "message": self.message}
        if self.problems is not None:
            detail["problems"] = self.problems
        return JSONResponse({"detail": detail}, status_code=self.status_code)


async def posted_body(request: Request) -> AsyncIterator[bytes]:
    """The request's body, exactly as sent, while the computation on it may run.

    Where the server limits its computations (``app.state.computations``, a
    semaphore), the request first waits for its turn, and keeps it until
    the route function has returned.
    """
    computations: asyncio.Semaphore | None = request.app.state.computations
    if computations is None:
        yield await request.body()
        return
    async with computations:
        yield await request.body()


PostedBody = Annotated[bytes, Depends(posted_body, scope="function")]
"""A route's parameter taking the posted body, the one way a computing route
takes it. The turn ends when the route function returns, before the answer
is sent, so a client that reads slowly holds no computation's place."""


def manifest_reader() -> tuple[Callable[[str], Any], Callable[[Any], Any]]:
    """Return timetoshare's ``loads`` and ``with_bare_ids``.

    Raises:
        Refusal: 501, if timetoshare is missing or lacks them.
    """
    try:
        from timetoshare import loads, with_bare_ids
    except ImportError as error:
        try:
            installed = version("timetoshare")
        except PackageNotFoundError:
            message = "timetoshare is not installed, so manifest files cannot be read"
        else:
            message = (
                f"the installed timetoshare {installed} cannot read manifest files"
            )
        raise Refusal([], message, status_code=501) from error
    return loads, with_bare_ids


def read_manifest(body: bytes, what: str = "the body") -> tuple[Any, Any]:
    """Read a posted manifest file in any serialization.

    Args:
        body: The manifest file's bytes.
        what: What the messages call the bytes.

    Returns:
        The manifest as its file writes it (IDs ``#id``), and the same
        manifest with every ID made bare.

    Raises:
        Refusal: 501 as :func:`manifest_reader`; 422 if the bytes are no UTF-8
            text, neither serialization reads it, it is no object, or an ID
            is not written in the file form (at timetoshare's path).
    """
    loads, with_bare_ids = manifest_reader()
    try:
        text = body.decode("utf-8")
    except UnicodeDecodeError as error:
        raise Refusal([], f"{what} is not UTF-8 text") from error
    try:
        manifest = loads(text)
    except ValueError as error:
        raise Refusal([], f"{what} is neither JSON nor YAML: {error}") from error
    if not isinstance(manifest, dict):
        raise Refusal([], f"{what} is not an object")
    try:
        return manifest, with_bare_ids(manifest)
    except ValueError as error:
        raise Refusal(list(getattr(error, "path", ())), str(error)) from error
