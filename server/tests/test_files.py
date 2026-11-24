"""The file routes; the cases are derived in ``README.md``, "Files"."""

from __future__ import annotations

import os
import stat
import sys
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tilie_server.app import create_app
from tilie_server.cli import parse_args
from tilie_server.settings import ServerSettings

TOKEN = "test-token-0123456789"
HOST = "127.0.0.1"
PORT = 8765
AUTH = {"Authorization": f"Bearer {TOKEN}"}


def refused(message: str) -> dict[str, object]:
    return {"detail": {"path": ["path"], "message": message}}


OUTSIDE = refused("path outside the root")
NO_NAME = refused("a file's path does not end in /")
LOOP = refused("the links at the path form a loop")
HIDDEN = refused("hidden files are not served")
DENIED = refused("permission denied")
NOT_READ = refused("TimeLineEditor reads only workspace, manifest and table files")
NOT_WRITTEN = refused("TimeLineEditor writes only workspace files")
NO_FILE = refused("no such file")
NO_FOLDER = refused("no such folder")
A_FOLDER = refused("a folder lies at the path")


def client_of(root: Path) -> TestClient:
    app = create_app(ServerSettings(HOST, PORT, TOKEN, root=root))
    return TestClient(app, base_url=f"http://{HOST}:{PORT}")


@pytest.fixture
def root(tmp_path: Path) -> Path:
    """The README's root: files, hidden places, links into them, a link out."""
    (tmp_path / "a.yaml").write_bytes(b"x: 1\n")
    (tmp_path / "notes.txt").write_bytes(b"notes\n")
    (tmp_path / "sub").mkdir()
    (tmp_path / "sub" / "b.tle.json").write_bytes(b"{}")
    (tmp_path / "sub" / "c.txt").write_bytes(b"plain text\n")
    (tmp_path / ".hidden.yaml").write_bytes(b"hidden: true\n")
    for folder in (".ssh", ".claude", ".config", "sub/.hidden"):
        (tmp_path / folder).mkdir()
    (tmp_path / ".ssh" / "id_rsa").write_bytes(b"private key\n")
    (tmp_path / ".claude.json").write_bytes(b'{"mcpServers": {}}')
    (tmp_path / ".claude" / "settings.json").write_bytes(b'{"hooks": {}}')
    (tmp_path / ".config" / "x.yaml").write_bytes(b"run: true\n")
    (tmp_path / "sub" / ".hidden" / "a.yaml").write_bytes(b"h: 1\n")
    (tmp_path / "sub" / "key.yaml").symlink_to(tmp_path / ".config" / "x.yaml")
    (tmp_path / "sub" / "conf").symlink_to(
        tmp_path / ".config", target_is_directory=True
    )
    (tmp_path / "sub" / "hid.tle.json").symlink_to(
        tmp_path / ".config" / "hid.tle.json"
    )
    (tmp_path / "d").mkdir()
    (tmp_path / "out").symlink_to(tmp_path.parent, target_is_directory=True)
    return tmp_path


@pytest.fixture
def client(root: Path) -> TestClient:
    return client_of(root)


def tree(root: Path) -> dict[str, object]:
    """Everything below ``root``, no link followed.

    Folders with their modes, files with their modes and bytes, links with
    their targets.
    """
    found: dict[str, object] = {}
    for folder, folders, files in os.walk(root, followlinks=False):
        for name in folders + files:
            path = Path(folder) / name
            key = path.relative_to(root).as_posix()
            if path.is_symlink():
                found[key] = ("link", os.readlink(path))
            elif path.is_dir():
                found[key] = ("folder", stat.S_IMODE(path.stat().st_mode))
            else:
                found[key] = (
                    "file",
                    stat.S_IMODE(path.stat().st_mode),
                    path.read_bytes(),
                )
    return found


@pytest.fixture
def unchanged(root: Path) -> Iterator[None]:
    """Assert, after the test, that the tree below the root is as it was before it."""
    before = tree(root)
    yield
    assert tree(root) == before


def folder(client: TestClient, path: str) -> tuple[int, object]:
    response = client.get("/api/folders", params={"path": path}, headers=AUTH)
    return response.status_code, response.json()


def get(client: TestClient, path: str) -> tuple[int, object]:
    """The status and the JSON refusal of a read expected to be refused."""
    response = client.get("/api/files", params={"path": path}, headers=AUTH)
    return response.status_code, response.json()


def put(client: TestClient, path: str, body: bytes) -> tuple[int, object]:
    response = client.put(
        "/api/files", params={"path": path}, content=body, headers=AUTH
    )
    return response.status_code, response.json()


# Listing


def test_the_root_lists_its_folders_then_its_files(
    client: TestClient, unchanged: None
) -> None:
    assert folder(client, "") == (
        200,
        {
            "path": "",
            "entries": [
                {"name": "d", "kind": "folder"},
                {"name": "sub", "kind": "folder"},
                {"name": "a.yaml", "kind": "file"},
            ],
        },
    )


def test_a_folder_lists_only_the_files_read_and_nothing_hidden(
    client: TestClient,
) -> None:
    assert folder(client, "sub") == (
        200,
        {"path": "sub", "entries": [{"name": "b.tle.json", "kind": "file"}]},
    )


def test_an_empty_folder_lists_nothing(client: TestClient) -> None:
    assert folder(client, "d") == (200, {"path": "d", "entries": []})


def test_entries_sort_by_code_point_and_links_list_as_what_they_lead_to(
    root: Path, client: TestClient
) -> None:
    sort = root / "sort"
    sort.mkdir()
    (sort / "y").mkdir()
    (sort / "Z").mkdir()
    for name in ("b.yaml", "B.json", "a.PARQUET", "n.txt"):
        (sort / name).write_bytes(b"")
    (sort / "inner").symlink_to(root / "sub", target_is_directory=True)
    (sort / "alias.yaml").symlink_to(root / "a.yaml")
    (sort / "text.yaml").symlink_to(root / "notes.txt")
    (sort / "gone.yaml").symlink_to(root / "nothing.yaml")
    (sort / "loop.yaml").symlink_to(sort / "loop.yaml")
    assert folder(client, "sort") == (
        200,
        {
            "path": "sort",
            "entries": [
                {"name": "Z", "kind": "folder"},
                {"name": "inner", "kind": "folder"},
                {"name": "y", "kind": "folder"},
                {"name": "B.json", "kind": "file"},
                {"name": "a.PARQUET", "kind": "file"},
                {"name": "alias.yaml", "kind": "file"},
                {"name": "b.yaml", "kind": "file"},
            ],
        },
    )


@pytest.mark.parametrize("path", ["a.yaml", "nope"])
def test_a_path_naming_no_folder_is_not_listed(client: TestClient, path: str) -> None:
    assert folder(client, path) == (404, NO_FOLDER)


# Reading


@pytest.mark.parametrize("path", ["a.yaml", "sub/../a.yaml"])
def test_a_file_is_answered_byte_for_byte(client: TestClient, path: str) -> None:
    response = client.get("/api/files", params={"path": path}, headers=AUTH)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/octet-stream"
    assert response.content == b"x: 1\n"


def test_a_workspace_file_is_read(client: TestClient) -> None:
    response = client.get("/api/files", params={"path": "sub/b.tle.json"}, headers=AUTH)
    assert (response.status_code, response.content) == (200, b"{}")


def test_a_path_naming_no_file_is_not_read(client: TestClient) -> None:
    assert get(client, "nope.yaml") == (404, NO_FILE)


@pytest.mark.parametrize("path", ["notes.txt", "sub/c.txt", "sub"])
def test_a_file_of_another_kind_is_never_read(
    client: TestClient, unchanged: None, path: str
) -> None:
    assert get(client, path) == (403, NOT_READ)


def test_a_link_to_a_file_of_another_kind_is_never_read(
    root: Path, client: TestClient
) -> None:
    (root / "sub" / "text.yaml").symlink_to(root / "notes.txt")
    before = tree(root)
    assert get(client, "sub/text.yaml") == (403, NOT_READ)
    assert tree(root) == before


# Writing


def test_a_new_workspace_file_is_written_with_no_temporary_file_left(
    root: Path, client: TestClient
) -> None:
    held = sorted(os.listdir(root / "sub"))
    assert put(client, "sub/new.tle.json", b'{"a": 1}') == (
        200,
        {"path": "sub/new.tle.json", "size": 8},
    )
    assert (root / "sub" / "new.tle.json").read_bytes() == b'{"a": 1}'
    assert sorted(os.listdir(root / "sub")) == sorted([*held, "new.tle.json"])


def test_a_replaced_file_keeps_its_mode(root: Path, client: TestClient) -> None:
    workspace = root / "sub" / "b.tle.json"
    workspace.chmod(0o640)
    assert put(client, "sub/b.tle.json", b'{"b": 2}') == (
        200,
        {"path": "sub/b.tle.json", "size": 8},
    )
    assert workspace.read_bytes() == b'{"b": 2}'
    assert stat.S_IMODE(workspace.stat().st_mode) == 0o640


def test_the_kind_is_matched_in_any_case(root: Path, client: TestClient) -> None:
    assert put(client, "sub/X.TLE.JSON", b"{}") == (
        200,
        {"path": "sub/X.TLE.JSON", "size": 2},
    )
    assert (root / "sub" / "X.TLE.JSON").read_bytes() == b"{}"


@pytest.mark.parametrize(
    "path",
    ["a.yaml", "x.yaml", "package.json", "m.parquet", "sub/c.txt", "a.yaml.txt"],
)
def test_no_file_but_a_workspace_file_is_written(
    client: TestClient, unchanged: None, path: str
) -> None:
    assert put(client, path, b"y: 2\n") == (403, NOT_WRITTEN)


@pytest.mark.parametrize(
    ("name", "target"), [("alias.tle.json", "sub/c.txt"), ("m.tle.json", "a.yaml")]
)
def test_a_link_to_a_file_of_another_kind_is_never_written(
    root: Path, client: TestClient, name: str, target: str
) -> None:
    (root / "sub" / name).symlink_to(root / target)
    before = tree(root)
    assert put(client, f"sub/{name}", b"{}") == (403, NOT_WRITTEN)
    assert tree(root) == before


def test_a_file_in_no_existing_folder_is_not_written(
    client: TestClient, unchanged: None
) -> None:
    assert put(client, "nope/x.tle.json", b"{}") == (404, NO_FOLDER)


def test_a_folder_is_never_replaced_by_a_file(root: Path, client: TestClient) -> None:
    (root / "d.tle.json").mkdir()
    before = tree(root)
    assert put(client, "d.tle.json", b"{}") == (409, A_FOLDER)
    assert tree(root) == before


def test_a_files_path_ending_in_a_slash_is_refused(
    client: TestClient, unchanged: None
) -> None:
    assert get(client, "a.yaml/") == (400, NO_NAME)
    assert put(client, "w.tle.json/", b"{}") == (400, NO_NAME)


# Links in a loop


@pytest.fixture
def loops(root: Path) -> Path:
    """The root with a link to itself and two links leading to each other."""
    (root / "loop.tle.json").symlink_to(root / "loop.tle.json")
    (root / "ring.tle.json").symlink_to(root / "ring2")
    (root / "ring2").symlink_to(root / "ring.tle.json")
    return root


@pytest.mark.parametrize("path", ["loop.tle.json", "ring.tle.json"])
def test_a_file_path_ending_in_a_link_in_a_loop_is_refused(
    loops: Path, client: TestClient, unchanged: None, path: str
) -> None:
    assert put(client, path, b"{}") == (400, LOOP)
    assert get(client, path) == (400, LOOP)


@pytest.mark.parametrize("path", ["loop.tle.json", "ring2"])
def test_a_folder_path_ending_in_a_link_in_a_loop_is_refused(
    loops: Path, client: TestClient, unchanged: None, path: str
) -> None:
    assert folder(client, path) == (400, LOOP)


def test_a_path_leading_through_a_loop_names_nothing(
    loops: Path, client: TestClient, unchanged: None
) -> None:
    assert get(client, "ring2/x.yaml") == (404, NO_FILE)
    assert put(client, "ring2/x.tle.json", b"{}") == (404, NO_FOLDER)
    assert folder(client, "ring2/d") == (404, NO_FOLDER)


# Hidden files

HIDDEN_READS = [
    ".ssh/id_rsa",
    ".claude.json",
    ".claude/settings.json",
    ".config/x.yaml",
    ".hidden.yaml",
    "sub/.hidden/a.yaml",
    ".ssh/../a.yaml",
    "sub/key.yaml",
]
HIDDEN_WRITES = [
    ".claude.json",
    ".claude/settings.json",
    ".config/x.yaml",
    "sub/.hidden/a.yaml",
    ".ssh/w.tle.json",
    ".w.tle.json",
    "sub/key.yaml",
    "sub/hid.tle.json",
]
HIDDEN_FOLDERS = [".ssh", ".claude", "sub/.hidden", "sub/conf"]


@pytest.mark.parametrize("path", HIDDEN_READS)
def test_no_hidden_file_is_read(client: TestClient, unchanged: None, path: str) -> None:
    assert get(client, path) == (403, HIDDEN)


@pytest.mark.parametrize("path", HIDDEN_WRITES)
def test_no_hidden_file_is_written(
    client: TestClient, unchanged: None, path: str
) -> None:
    assert put(client, path, b"{}") == (403, HIDDEN)


@pytest.mark.parametrize("path", HIDDEN_FOLDERS)
def test_no_hidden_folder_is_listed(
    client: TestClient, unchanged: None, path: str
) -> None:
    assert folder(client, path) == (403, HIDDEN)


def test_a_root_inside_a_hidden_folder_serves_its_files(root: Path) -> None:
    response = client_of(root / ".config").get(
        "/api/files", params={"path": "x.yaml"}, headers=AUTH
    )
    assert (response.status_code, response.content) == (200, b"run: true\n")


# Permissions

needs_modes = pytest.mark.skipif(
    sys.platform == "win32" or os.geteuid() == 0,
    reason="no POSIX modes, or the superuser, whom no mode stops",
)


LOCKED = {"locked.yaml": 0o000, "locked.tle.json": 0o000, "shut": 0o000, "ro": 0o555}
"""The README's locked files and folders, by their modes."""


@pytest.fixture
def locked(root: Path) -> Iterator[Path]:
    """The root with the locked files and folders, their modes given back afterwards."""
    (root / "locked.yaml").write_bytes(b"l: 1\n")
    (root / "locked.tle.json").write_bytes(b"{}")
    (root / "shut").mkdir()
    (root / "shut" / "in.yaml").write_bytes(b"i: 1\n")
    (root / "ro").mkdir()
    for name, mode in LOCKED.items():
        (root / name).chmod(mode)
    try:
        yield root
    finally:
        for name in LOCKED:
            (root / name).chmod(0o755)


def opened_tree(root: Path) -> dict[str, object]:
    """The tree below ``root``, read with the locked modes opened for the reading."""
    for name in LOCKED:
        (root / name).chmod(0o755)
    try:
        return tree(root)
    finally:
        for name, mode in LOCKED.items():
            (root / name).chmod(mode)


def modes(root: Path) -> dict[str, int]:
    return {name: stat.S_IMODE((root / name).stat().st_mode) for name in LOCKED}


@needs_modes
@pytest.mark.parametrize(
    ("route", "path"),
    [
        ("files", "locked.yaml"),
        ("files", "shut/in.yaml"),
        ("folders", "shut"),
        ("folders", "shut/x"),
    ],
)
def test_what_the_user_may_not_read_is_refused(
    locked: Path, client: TestClient, route: str, path: str
) -> None:
    before = opened_tree(locked)
    response = client.get(f"/api/{route}", params={"path": path}, headers=AUTH)
    assert (response.status_code, response.json()) == (403, DENIED)
    assert (modes(locked), opened_tree(locked)) == (LOCKED, before)


@needs_modes
@pytest.mark.parametrize(
    "path", ["shut/new.tle.json", "ro/new.tle.json", "locked.tle.json"]
)
def test_what_the_user_may_not_write_is_refused(
    locked: Path, client: TestClient, path: str
) -> None:
    before = opened_tree(locked)
    assert put(client, path, b'{"w": 1}') == (403, DENIED)
    assert (modes(locked), opened_tree(locked)) == (LOCKED, before)


# Outside the root

OUTSIDE_PATHS = [
    "../x.yaml",
    "/etc/passwd",
    "out/anything.yaml",
    "out",
    "sub/../../x.yaml",
    "a\u0000.yaml",
]


@pytest.mark.parametrize("path", OUTSIDE_PATHS)
def test_no_folder_outside_the_root_is_listed(client: TestClient, path: str) -> None:
    assert folder(client, path) == (400, OUTSIDE)


@pytest.mark.parametrize("path", OUTSIDE_PATHS)
def test_no_file_outside_the_root_is_read(client: TestClient, path: str) -> None:
    response = client.get("/api/files", params={"path": path}, headers=AUTH)
    assert (response.status_code, response.json()) == (400, OUTSIDE)


@pytest.mark.parametrize("path", OUTSIDE_PATHS)
def test_no_file_outside_the_root_is_written(client: TestClient, path: str) -> None:
    assert put(client, path, b"y: 2\n") == (400, OUTSIDE)


@pytest.mark.parametrize("path", ["../x.tle.json", "out/x.tle.json", "../x.txt"])
def test_a_write_outside_the_root_creates_nothing(
    root: Path, client: TestClient, path: str
) -> None:
    assert put(client, path, b"{}") == (400, OUTSIDE)
    assert not (root.parent / "x.tle.json").exists()
    assert not (root.parent / "x.txt").exists()


def test_a_root_given_through_a_link_holds_its_files(
    root: Path, tmp_path_factory: pytest.TempPathFactory
) -> None:
    link = tmp_path_factory.mktemp("links") / "root"
    link.symlink_to(root, target_is_directory=True)
    response = client_of(link).get(
        "/api/files", params={"path": "a.yaml"}, headers=AUTH
    )
    assert (response.status_code, response.content) == (200, b"x: 1\n")


# The guard


@pytest.mark.parametrize(
    ("method", "route"),
    [("GET", "/api/folders"), ("GET", "/api/files"), ("PUT", "/api/files")],
)
def test_every_file_route_needs_the_token(
    root: Path, client: TestClient, method: str, route: str
) -> None:
    response = client.request(
        method, route, params={"path": "sub/new.tle.json"}, content=b"y"
    )
    assert (response.status_code, response.json()) == (
        401,
        {"detail": "missing or invalid token"},
    )
    assert not (root / "sub" / "new.tle.json").exists()


def test_a_write_from_a_foreign_origin_is_refused(
    root: Path, client: TestClient
) -> None:
    response = client.put(
        "/api/files",
        params={"path": "sub/new.tle.json"},
        content=b"y: 2\n",
        headers={**AUTH, "Origin": "http://example.org"},
    )
    assert (response.status_code, response.json()) == (
        403,
        {"detail": "forbidden origin"},
    )
    assert not (root / "sub" / "new.tle.json").exists()


# The root


def test_the_settings_root_is_the_home_folder_unless_given() -> None:
    assert ServerSettings(HOST, PORT, TOKEN).root == Path.home()


def test_the_command_takes_the_home_folder_unless_given(tmp_path: Path) -> None:
    assert parse_args([]).root == Path.home()
    assert parse_args(["--root", str(tmp_path)]).root == tmp_path


@pytest.mark.parametrize("name", ["missing", "a.yaml"])
def test_the_command_refuses_a_root_that_is_no_folder(
    root: Path, name: str, capsys: pytest.CaptureFixture[str]
) -> None:
    given = str(root / name)
    with pytest.raises(SystemExit) as exit:
        parse_args(["--root", given])
    assert exit.value.code == 2
    error = capsys.readouterr().err
    assert error.startswith("usage: tilie ")
    assert error.endswith(
        f"tilie: error: argument --root: {given!r} is no existing folder\n"
    )
