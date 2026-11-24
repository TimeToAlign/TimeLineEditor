"""The user's files below the server's root folder: list, read and write.

``GET /api/folders`` lists one folder, ``GET /api/files`` reads a file and
``PUT /api/files`` writes one (``decisions/0033-server-file-access.md``).
A path is the query parameter ``path``, POSIX and relative to the root,
``""`` the root itself. Every path is resolved, each symbolic link followed,
and refused when it does not lie in the root or names a hidden place below
it (a segment starting with ``.``). Only the files TimeLineEditor opens are
read and listed, workspace, manifest and table files, and only the one it
saves through the server is written, the workspace file.
"""

from __future__ import annotations

import errno
import os
import secrets
import stat
from pathlib import Path, PurePosixPath, PureWindowsPath

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response

from tilie_server.manifests import PostedBody
from tilie_server.settings import API_PREFIX

router = APIRouter()

READ_KINDS = (".tle.json", ".yaml", ".yml", ".json", ".parquet")
"""The ends of the names TimeLineEditor lists and reads, matched in any case."""

WRITTEN_KINDS = (".tle.json",)
"""The ends of the names TimeLineEditor writes, matched in any case: workspace files."""

OUTSIDE = (400, "path outside the root")
NO_NAME = (400, "a file's path does not end in /")
LOOP = (400, "the links at the path form a loop")
HIDDEN = (403, "hidden files are not served")
DENIED = (403, "permission denied")
NOT_READ = (403, "TimeLineEditor reads only workspace, manifest and table files")
NOT_WRITTEN = (403, "TimeLineEditor writes only workspace files")
NO_FILE = (404, "no such file")
NO_FOLDER = (404, "no such folder")
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


def is_kind(name: str, kinds: tuple[str, ...]) -> bool:
    """Whether a file named ``name`` ends in one of ``kinds``, in any case."""
    return name.lower().endswith(kinds)


def is_hidden(parts: tuple[str, ...]) -> bool:
    """Whether one of the segments ``parts`` starts with ``.`` and is not ``..``."""
    return any(part.startswith(".") and part != ".." for part in parts)


def resolve(path: Path) -> Path:
    """The absolute path ``path`` names, every link followed but one in a loop.

    A link in a loop is left in the path unresolved, with the segments after
    it, on every Python version: ``Path.resolve`` does so from Python 3.13 on
    but raises ``RuntimeError`` up to 3.12, so this calls the function it
    builds on, ``os.path.realpath``, which leaves the loop in place everywhere.
    ``status_of`` then finds the link, or nothing behind it.
    """
    return Path(os.path.realpath(path))


def inside(root: Path, path: str) -> Path:
    """The absolute path ``path`` names below ``root``, every link followed.

    Args:
        root: The resolved root folder.
        path: A POSIX path relative to the root.

    Raises:
        Refused: ``path`` is absolute, holds a NUL character, or resolves to a
            place that does not lie in the root (through ``..`` or a symbolic
            link leading out); it has a hidden segment, or resolves to a place
            with one below the root; or its links form a loop.
    """
    if (
        "\0" in path
        or PurePosixPath(path).is_absolute()
        or PureWindowsPath(path).anchor
    ):
        raise Refused(OUTSIDE)
    resolved = resolve(root / PurePosixPath(path))
    if not resolved.is_relative_to(root):
        raise Refused(OUTSIDE)
    if is_hidden(PurePosixPath(path).parts) or is_hidden(
        resolved.relative_to(root).parts
    ):
        raise Refused(HIDDEN)
    if status_of(resolved, follow=False) == "link":
        raise Refused(LOOP)
    return resolved


def status_of(path: Path, follow: bool = True) -> str | None:
    """What lies at ``path``, ``None`` for nothing (or links in a loop).

    ``"folder"``, ``"file"``, ``"other"``, or ``"link"`` when ``follow`` is
    false and the path names a symbolic link itself.

    Raises:
        Refused: The user may not look at the path (``permission denied``).
    """
    try:
        mode = path.stat().st_mode if follow else path.lstat().st_mode
    except PermissionError as error:
        raise Refused(DENIED) from error
    except OSError as error:
        if error.errno in (errno.ENOENT, errno.ENOTDIR, errno.ELOOP):
            return None
        raise
    if stat.S_ISDIR(mode):
        return "folder"
    if stat.S_ISREG(mode):
        return "file"
    return "link" if stat.S_ISLNK(mode) else "other"


def file_path(
    root: Path, path: str, kinds: tuple[str, ...], refusal: tuple[int, str]
) -> Path:
    """The file ``path`` names below ``root``, its name and its target's of ``kinds``.

    Raises:
        Refused: As ``inside`` refuses; the path ends in ``/``; or the name
            asked for, or the name of the file a link leads to, is not of
            ``kinds`` (``refusal``).
    """
    target = inside(root, path)
    if path.endswith("/"):
        raise Refused(NO_NAME)
    if not (is_kind(PurePosixPath(path).name, kinds) and is_kind(target.name, kinds)):
        raise Refused(refusal)
    return target


def listing(root: Path, path: str) -> dict[str, object]:
    """The folders, then the files of a kind TimeLineEditor reads, in ``path``.

    Hidden names are left out, and so is a symbolic link leading out of the
    root, into a hidden place, to nothing, or to a file of another kind; a
    link inside the root is listed as what it leads to. Each group is sorted
    by code point.
    """
    folder = inside(root, path)
    if status_of(folder) != "folder":
        raise Refused(NO_FOLDER)
    folders: list[str] = []
    files: list[str] = []
    try:
        with os.scandir(folder) as entries:
            for entry in entries:
                if entry.name.startswith("."):
                    continue
                target = resolve(Path(entry.path))
                if not target.is_relative_to(root) or is_hidden(
                    target.relative_to(root).parts
                ):
                    continue
                try:
                    kind = status_of(target)
                except Refused:
                    continue
                if kind == "folder":
                    folders.append(entry.name)
                elif (
                    kind == "file"
                    and is_kind(entry.name, READ_KINDS)
                    and is_kind(target.name, READ_KINDS)
                ):
                    files.append(entry.name)
    except PermissionError as error:
        raise Refused(DENIED) from error
    return {
        "path": path,
        "entries": [{"name": name, "kind": "folder"} for name in sorted(folders)]
        + [{"name": name, "kind": "file"} for name in sorted(files)],
    }


def read(root: Path, path: str) -> bytes:
    """The bytes of the file ``path`` names."""
    file = file_path(root, path, READ_KINDS, NOT_READ)
    if status_of(file) != "file":
        raise Refused(NO_FILE)
    try:
        return file.read_bytes()
    except PermissionError as error:
        raise Refused(DENIED) from error


def write(root: Path, path: str, body: bytes) -> dict[str, object]:
    """Write ``body`` into the workspace file ``path`` names, replacing it whole.

    The bytes go to a new file beside it, which then takes the file's place
    (``os.replace``), so the file is never seen half written. A file replaced
    keeps its mode; a new one is created as ``open`` creates it, under the
    process's umask.

    Raises:
        Refused: The path is refused as ``inside`` refuses, ends in ``/``,
            names (or leads through a link to) a file that is no workspace
            file, lies in no existing folder, names a folder, or names a
            file or lies in a folder the user may not write.
    """
    target = file_path(root, path, WRITTEN_KINDS, NOT_WRITTEN)
    if status_of(target.parent) != "folder":
        raise Refused(NO_FOLDER)
    present = status_of(target)
    if present == "folder":
        raise Refused(A_FOLDER)
    if present is not None and not os.access(target, os.W_OK):
        raise Refused(DENIED)
    kept = stat.S_IMODE(target.stat().st_mode) if present == "file" else None
    temporary = target.with_name(f".{target.name}.{secrets.token_hex(8)}.tmp")
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o666)
    except PermissionError as error:
        raise Refused(DENIED) from error
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
def put_file(request: Request, body: PostedBody, path: str = "") -> Response:
    """Write the request's body into the file ``path``."""
    try:
        written = write(root_of(request), path, body)
    except Refused as refusal:
        return refusal.response()
    return JSONResponse(written)
