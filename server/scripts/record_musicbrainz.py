"""Record the MusicBrainz answers the server's lookup tests replay.

Run from ``server/`` with ``uv run python scripts/record_musicbrainz.py``.
It asks MusicBrainz for exactly the URLs the tests use, built by the
server's own URL functions and sent with the server's User-Agent, one
request at least every :attr:`MusicBrainz.MIN_INTERVAL` seconds. An answer
503 (MusicBrainz is busy) is asked again after a longer wait, a few times.
Each answer is written to ``tests/data/musicbrainz/<name>.json`` as
indented JSON, and ``index.json`` there maps each URL to its file.

The script is not part of the package; nothing runs it but a person
refreshing the recordings.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from tilie_server.musicbrainz import (
    USER_AGENT,
    MusicBrainz,
    lookup_url,
    search_url,
    urllib_fetch,
)

DATA = Path(__file__).parent.parent / "tests" / "data" / "musicbrainz"

RECORDINGS = {
    "work-clair-de-lune": search_url("work", "Clair de lune", 5, 0),
    "artist-maria-joao-pires": search_url("artist", "Maria João Pires", 5, 0),
    "artist-pires-suggest": search_url("artist", "Pires", 10, 0),
    "work-8d331505": lookup_url("work", "8d331505-4d88-39ae-81c7-bec5da77af96"),
}
"""The file name of each recorded URL."""

BUSY_WAIT = 5.0
"""Seconds to wait before asking again after an answer 503."""

ATTEMPTS = 4
"""How often a URL is asked before the script gives up."""


def record(url: str) -> object:
    """Fetch ``url`` until it answers 200, waiting between attempts."""
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    for attempt in range(ATTEMPTS):
        time.sleep(MusicBrainz.MIN_INTERVAL if attempt == 0 else BUSY_WAIT)
        status, body = urllib_fetch(url, headers)
        if status == 200:
            return json.loads(body)
        print(f"{url} answered {status}", file=sys.stderr)
        if status != 503:
            break
    raise SystemExit(f"could not record {url}")


def main() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    index = {}
    for name, url in RECORDINGS.items():
        answer = record(url)
        text = json.dumps(answer, ensure_ascii=False, indent=2) + "\n"
        (DATA / f"{name}.json").write_text(text, encoding="utf-8")
        index[url] = f"{name}.json"
        print(f"recorded {url}")
    text = json.dumps(index, ensure_ascii=False, indent=2) + "\n"
    (DATA / "index.json").write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
