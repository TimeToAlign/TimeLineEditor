"""What the route tests share to assert a refusal worded by a library."""

from __future__ import annotations

from typing import Any


def assert_refused_in_timetoshares_words(
    response: Any,
    path: list[Any],
    contains: list[str],
    problems: list[dict[str, Any]] | None = None,
) -> None:
    """A 422 whose message is TimeToShare's, or timetoalign's where it reports a
    library's own refusal: the status, the path and the problems' codes, rows and
    columns are exact; the words belong to the library to rephrase, so only the
    substrings that name what is refused are asserted. A problem's message is the
    answer's message."""
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["path"] == path
    for text in contains:
        assert text in detail["message"]
    if problems is None:
        assert set(detail) == {"path", "message"}
        return
    assert set(detail) == {"path", "message", "problems"}
    assert [
        {key: value for key, value in problem.items() if key != "message"}
        for problem in detail["problems"]
    ] == problems
    assert [problem["message"] for problem in detail["problems"]] == [
        detail["message"]
    ] * len(problems)
