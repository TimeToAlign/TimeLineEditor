"""A client of the MusicBrainz web service, within its rules of use.

MusicBrainz asks every client of ``https://musicbrainz.org/ws/2/`` for at
most one request per second and a ``User-Agent`` naming the application
and where to learn about it. This client keeps both for the whole server:
one :class:`MusicBrainz` per application sends its requests one after the
other, each at least :attr:`MusicBrainz.MIN_INTERVAL` seconds after the
previous one, and answers a URL it has fetched before from its cache
without asking again. The User-Agent names the server and its repository,
never a person.

The fetch, the clock and the sleep are injected, so the rules can be
proved without the network and without waiting.
"""

from __future__ import annotations

import asyncio
import json
import time
import urllib.error
import urllib.request
from collections import OrderedDict
from collections.abc import Awaitable, Callable, Mapping
from typing import Any, ClassVar
from urllib.parse import urlencode

from tilie_server import __version__

__all__ = [
    "BASE_URL",
    "ENTITY_TYPES",
    "TIMEOUT",
    "USER_AGENT",
    "Fetch",
    "MusicBrainz",
    "UpstreamError",
    "lookup_url",
    "lucene_escaped",
    "search_url",
    "urllib_fetch",
]

Fetch = Callable[[str, Mapping[str, str]], tuple[int, bytes]]
"""Fetch a URL with the given headers; answer the status and the body.

A fetch that gets no answer raises :class:`OSError` (``urllib``'s
``URLError`` and ``TimeoutError`` are both).
"""

BASE_URL = "https://musicbrainz.org/ws/2/"
"""The MusicBrainz web service."""

USER_AGENT = (
    f"tilie-server/{__version__} ( https://github.com/TimeToAlign/TimeLineEditor )"
)
"""The application and where to learn about it; no personal contact data."""

TIMEOUT = 10.0
"""Seconds a request may wait for an answer."""

ENTITY_TYPES: Mapping[str, str] = {
    "work": "works",
    "artist": "artists",
    "recording": "recordings",
    "release-group": "release-groups",
}
"""The entity types searched, each with the member listing its search results."""

LUCENE_SPECIAL = frozenset('+-&|!(){}[]^"~*?:\\/')
"""The characters the search syntax gives a meaning, each escaped with ``\\``."""


class UpstreamError(Exception):
    """MusicBrainz could not answer a request; the message says why."""


def lucene_escaped(text: str) -> str:
    """Escape every character the search syntax gives a meaning.

    The text is then searched for as written, never read as a query.
    """
    return "".join(f"\\{c}" if c in LUCENE_SPECIAL else c for c in text)


def search_url(entity_type: str, text: str, limit: int, offset: int) -> str:
    """The URL that searches ``entity_type`` for ``text``."""
    query = urlencode(
        [
            ("query", lucene_escaped(text)),
            ("limit", limit),
            ("offset", offset),
            ("fmt", "json"),
        ]
    )
    return f"{BASE_URL}{entity_type}?{query}"


def lookup_url(entity_type: str, mbid: str) -> str:
    """The URL of one entity with its URL relationships."""
    return f"{BASE_URL}{entity_type}/{mbid}?inc=url-rels&fmt=json"


def urllib_fetch(url: str, headers: Mapping[str, str]) -> tuple[int, bytes]:
    """Fetch ``url`` with ``urllib``, waiting at most :data:`TIMEOUT` seconds.

    An answer of any status is returned; no answer raises :class:`OSError`.
    """
    request = urllib.request.Request(url, headers=dict(headers))
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        with error:
            return error.code, error.read()


class MusicBrainz:
    """The server's one way to MusicBrainz: paced, identified and cached.

    Attributes:
        MIN_INTERVAL: Seconds between the starts of two upstream requests.
        CACHE_SIZE: Answers kept for the run; the least recently used goes
            first.
    """

    MIN_INTERVAL: ClassVar[float] = 1.0
    CACHE_SIZE: ClassVar[int] = 1024

    def __init__(
        self,
        fetch: Fetch = urllib_fetch,
        *,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        user_agent: str = USER_AGENT,
    ) -> None:
        self._fetch = fetch
        self._clock = clock
        self._sleep = sleep
        self._headers = {"User-Agent": user_agent, "Accept": "application/json"}
        self._lock = asyncio.Lock()
        self._last: float | None = None
        self._cache: OrderedDict[str, Any] = OrderedDict()

    async def get(self, url: str) -> Any:
        """Answer the JSON at ``url``, from the cache or from MusicBrainz.

        Raises:
            UpstreamError: If MusicBrainz answers another status than 200,
                answers no JSON, or cannot be reached. Failures are not
                cached.
        """
        if url in self._cache:
            return self._cached(url)
        async with self._lock:
            if url in self._cache:
                return self._cached(url)
            if self._last is not None:
                wait = self._last + self.MIN_INTERVAL - self._clock()
                if wait > 0:
                    await self._sleep(wait)
            self._last = self._clock()
            try:
                status, body = await asyncio.to_thread(self._fetch, url, self._headers)
            except OSError as error:
                raise UpstreamError("MusicBrainz could not be reached") from error
            if status != 200:
                raise UpstreamError(f"MusicBrainz answered {status}")
            try:
                answer = json.loads(body)
            except ValueError as error:
                raise UpstreamError("MusicBrainz answered no JSON") from error
            self._cache[url] = answer
            while len(self._cache) > self.CACHE_SIZE:
                self._cache.popitem(last=False)
            return answer

    def _cached(self, url: str) -> Any:
        self._cache.move_to_end(url)
        return self._cache[url]
