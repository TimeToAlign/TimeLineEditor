"""The user's files below the server's root folder: list, read and write.

``GET /api/folders`` lists one folder, ``GET /api/files`` reads a file and
``PUT /api/files`` writes one (``decisions/0033-server-file-access.md``).
A path is the query parameter ``path``, POSIX and relative to the root,
``""`` the root itself. Every path is resolved, each symbolic link followed,
and refused when it does not lie in the root; only TimeLineEditor's own file
kinds are written, and listed.
"""

from __future__ import annotations

import os
import secrets
import stat
from pathlib import Path, PurePosixPath, PureWindowsPath

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool

from tilie_server.settings import API_PREFIX

router = APIRouter()

FILE_KINDS = (".tle.json", ".yaml", ".yml", ".json", ".parquet")
"""The ends of the names TimeLineEditor lists and writes, matched in any case."""

OUTSIDE = (400, "path outside the root")
NO_FILE = (404, "no such file")
NO_FOLDER = (404, "no such folder")
FOREIGN_KIND = (403, "TimeLineEditor writes only workspace, manifest and table files")
A_FOLDER = (409, "a folder lies at the path")


class Refused(Exception):
    """A request for a path the routes do not serve, with its status and message."""

    def __init__(self, refusal: tuple[int, str]) -> None:
        super().__init__(refusal[1])
        self.status, self.message = refusal

    def response(self) -> JSONResponse:
        """The answer: the status and ``{"detail": {"path": ["path"], "message"}}``."""
        return JSONResponse(
            {"detail": {"path": ["path"], "message": self.message}},
            status_code=self.status,
        )


def is_file_kind(name: str) -> bool:
    """Whether a file named ``name`` is one TimeLineEditor lists and writes."""
    return name.lower().endswith(FILE_KINDS)


def inside(root: Path, path: str) -> Path:
    """The absolute path ``path`` names below ``root``, every link followed.

    Args:
        root: The resolved root folder.
        path: A POSIX path relative to the root.

    Raises:
        Refused: ``path`` is absolute, holds a NUL character, or resolves to a
            place that does not lie in the root (through ``..`` or a symbolic
            link leading out).
    """
    if (
        "\0" in path
        or PurePosixPath(path).is_absolute()
        or PureWindowsPath(path).anchor
    ):
        raise Refused(OUTSIDE)
    resolved = (root / PurePosixPath(path)).resolve()
    if not resolved.is_relative_to(root):
        raise Refused(OUTSIDE)
    return resolved


def listing(root: Path, path: str) -> dict[str, object]:
    """The folders, then the files of one kind TimeLineEditor opens, in ``path``.

    Names starting with ``.`` are left out, and so is a symbolic link leading
    out of the root or to nothing; a link inside the root is listed as what it
    leads to. Each group is sorted by code point.
    """
    folder = inside(root, path)
    if not folder.is_dir():
        raise Refused(NO_FOLDER)
    folders: list[str] = []
    files: list[str] = []
    with os.scandir(folder) as entries:
        for entry in entries:
            if entry.name.startswith("."):
                continue
            target = Path(entry.path).resolve()
            if not target.is_relative_to(root):
                continue
            if target.is_dir():
                folders.append(entry.name)
            elif target.is_file() and is_file_kind(entry.name):
                files.append(entry.name)
    return {
        "path": path,
        "entries": [{"name": name, "kind": "folder"} for name in sorted(folders)]
        + [{"name": name, "kind": "file"} for name in sorted(files)],
    }


def read(root: Path, path: str) -> bytes:
    """The bytes of the file ``path`` names."""
    file = inside(root, path)
    if not file.is_file():
        raise Refused(NO_FILE)
    return file.read_bytes()


def write(root: Path, path: str, body: bytes) -> dict[str, object]:
    """Write ``body`` into the file ``path`` names, replacing it whole.

    The bytes go to a new file beside it, which then takes the file's place
    (``os.replace``), so the file is never seen half written. A file replaced
    keeps its mode; a new one is created as ``open`` creates it, under the
    process's umask.

    Raises:
        Refused: The path lies outside the root, names (or leads through a
            link to) a file of another kind, lies in no existing folder, or
            names a folder.
    """
    target = inside(root, path)
    if not (is_file_kind(PurePosixPath(path).name) and is_file_kind(target.name)):
        raise Refused(FOREIGN_KIND)
    if not target.parent.is_dir():
        raise Refused(NO_FOLDER)
    if target.is_dir():
        raise Refused(A_FOLDER)
    kept = stat.S_IMODE(target.stat().st_mode) if target.is_file() else None
    temporary = target.with_name(f".{target.name}.{secrets.token_hex(8)}.tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o666)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(body)
            stream.flush()
            os.fsync(stream.fileno())
        if kept is not None:
            os.chmod(temporary, kept)
        os.replace(temporary, target)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise
    return {"path": path, "size": len(body)}


def root_of(request: Request) -> Path:
    """The run's resolved root folder."""
    root: Path = request.app.state.root
    return root


@router.get(f"{API_PREFIX}folders")
def get_folder(request: Request, path: str = "") -> Response:
    """List the folder ``path``."""
    try:
        return JSONResponse(listing(root_of(request), path))
    except Refused as refusal:
        return refusal.response()


@router.get(f"{API_PREFIX}files")
def get_file(request: Request, path: str = "") -> Response:
    """Answer the bytes of the file ``path``."""
    try:
        return Response(
            read(root_of(request), path), media_type="application/octet-stream"
        )
    except Refused as refusal:
        return refusal.response()


@router.put(f"{API_PREFIX}files")
async def put_file(request: Request, path: str = "") -> Response:
    """Write the request's body into the file ``path``."""
    body = await request.body()
    try:
        written = await run_in_threadpool(write, root_of(request), path, body)
    except Refused as refusal:
        return refusal.response()
    return JSONResponse(written)
