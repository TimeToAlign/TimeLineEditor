"""Record the match-claims answer the client package's tests decode.

Run from ``server/`` with ``uv run python scripts/record_match_claims.py``.
It builds the request the editor sends for TimeToShare's table fixture
(``fixtures/tables/<version>/``: its ``manifest.yaml`` and
``match_claims.parquet``) and writes the route's answer, byte for byte, to
``app/packages/client/tests/data/match-claims.answer.bin``, or to the file
given as the one argument.

The script is not part of the package; nothing runs it but a person
refreshing the recording after the answer's layout or the fixture changed.
"""

from __future__ import annotations

import sys
from pathlib import Path

from timetoshare.tables import fixture_path

from tilie_server.routers.match_claims import PREFIX, match_claims_answer

RECORDING = (
    Path(__file__).parent.parent.parent
    / "app"
    / "packages"
    / "client"
    / "tests"
    / "data"
    / "match-claims.answer.bin"
)
"""Where the client package's tests read the recording."""


def fixture_request() -> bytes:
    """The request for TimeToShare's table fixture, as the editor builds it."""
    manifest = fixture_path("manifest.yaml").read_bytes()
    table = fixture_path("match_claims.parquet").read_bytes()
    return PREFIX.pack(len(manifest)) + manifest + table


def main(argv: list[str]) -> None:
    target = Path(argv[0]) if argv else RECORDING
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(match_claims_answer(fixture_request()))
    print(f"wrote {target}")


if __name__ == "__main__":
    main(sys.argv[1:])
