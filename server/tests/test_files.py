"""The file routes; the cases are derived in ``README.md``, "Files"."""

from __future__ import annotations

import os
import stat
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

OUTSIDE = {"detail": {"path": ["path"], "message": "path outside the root"}}
NO_FILE = {"detail": {"path": ["path"], "message": "no such file"}}
NO_FOLDER = {"detail": {"path": ["path"], "message": "no such folder"}}
FOREIGN_KIND = {
    "detail": {
        "path": ["path"],
        "message": "TimeLineEditor writes only workspace, manifest and table files",
    }
}
A_FOLDER = {"detail": {"path": ["path"], "message": "a folder lies at the path"}}


def client_of(root: Path) -> TestClient:
    app = create_app(ServerSettings(HOST, PORT, TOKEN, root=root))
    return TestClient(app, base_url=f"http://{HOST}:{PORT}")


@pytest.fixture
def root(tmp_path: Path) -> Path:
    """The README's root: files, a hidden file, two folders, a link out."""
    (tmp_path / "a.yaml").write_bytes(b"x: 1\n")
    (tmp_path / "sub").mkdir()
    (tmp_path / "sub" / "b.tle.json").write_bytes(b"{}")
    (tmp_path / "sub" / "c.txt").write_bytes(b"plain text\n")
    (tmp_path / ".hidden.yaml").write_bytes(b"hidden: true\n")
    (tmp_path / "d").mkdir()
    (tmp_path / "out").symlink_to(tmp_path.parent, target_is_directory=True)
    return tmp_path


@pytest.fixture
def client(root: Path) -> TestClient:
    return client_of(root)


def folder(client: TestClient, path: str) -> tuple[int, object]:
    response = client.get("/api/folders", params={"path": path}, headers=AUTH)
    return response.status_code, response.json()


def put(client: TestClient, path: str, body: bytes) -> tuple[int, object]:
    response = client.put(
        "/api/files", params={"path": path}, content=body, headers=AUTH
    )
    return response.status_code, response.json()


# Listing


def test_the_root_lists_its_folders_then_its_files(client: TestClient) -> None:
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


def test_a_folder_lists_only_the_files_of_the_editors_kinds(client: TestClient) -> None:
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
    (sort / "gone.yaml").symlink_to(root / "nothing.yaml")
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


@pytest.mark.parametrize(
    ("path", "content"),
    [(".hidden.yaml", b"hidden: true\n"), ("sub/c.txt", b"plain text\n")],
)
def test_any_file_below_the_root_is_read(
    client: TestClient, path: str, content: bytes
) -> None:
    response = client.get("/api/files", params={"path": path}, headers=AUTH)
    assert (response.status_code, response.content) == (200, content)


@pytest.mark.parametrize("path", ["sub", "nope.yaml"])
def test_a_path_naming_no_file_is_not_read(client: TestClient, path: str) -> None:
    response = client.get("/api/files", params={"path": path}, headers=AUTH)
    assert (response.status_code, response.json()) == (404, NO_FILE)


# Writing


def test_a_new_file_is_written_with_no_temporary_file_left(
    root: Path, client: TestClient
) -> None:
    assert put(client, "sub/new.yaml", b"y: 2\n") == (
        200,
        {"path": "sub/new.yaml", "size": 5},
    )
    assert (root / "sub" / "new.yaml").read_bytes() == b"y: 2\n"
    assert sorted(os.listdir(root / "sub")) == ["b.tle.json", "c.txt", "new.yaml"]


def test_a_replaced_file_keeps_its_mode(root: Path, client: TestClient) -> None:
    (root / "a.yaml").chmod(0o640)
    assert put(client, "a.yaml", b"z: 3\n") == (200, {"path": "a.yaml", "size": 5})
    assert (root / "a.yaml").read_bytes() == b"z: 3\n"
    assert stat.S_IMODE((root / "a.yaml").stat().st_mode) == 0o640


def test_the_kinds_are_matched_in_any_case(root: Path, client: TestClient) -> None:
    assert put(client, "sub/X.TLE.JSON", b"{}") == (
        200,
        {"path": "sub/X.TLE.JSON", "size": 2},
    )
    assert (root / "sub" / "X.TLE.JSON").read_bytes() == b"{}"


@pytest.mark.parametrize("path", ["sub/c.txt", "a.yaml.txt"])
def test_a_file_of_another_kind_is_never_written(
    root: Path, client: TestClient, path: str
) -> None:
    assert put(client, path, b"y: 2\n") == (403, FOREIGN_KIND)
    assert (root / "sub" / "c.txt").read_bytes() == b"plain text\n"
    assert not (root / "a.yaml.txt").exists()


def test_a_link_to_a_file_of_another_kind_is_never_written(
    root: Path, client: TestClient
) -> None:
    (root / "sub" / "alias.yaml").symlink_to(root / "sub" / "c.txt")
    assert put(client, "sub/alias.yaml", b"y: 2\n") == (403, FOREIGN_KIND)
    assert (root / "sub" / "c.txt").read_bytes() == b"plain text\n"


def test_a_file_in_no_existing_folder_is_not_written(
    root: Path, client: TestClient
) -> None:
    assert put(client, "nope/x.yaml", b"y: 2\n") == (404, NO_FOLDER)
    assert not (root / "nope").exists()


def test_a_folder_is_never_replaced_by_a_file(root: Path, client: TestClient) -> None:
    (root / "d.json").mkdir()
    assert put(client, "d.json", b"{}") == (409, A_FOLDER)
    assert (root / "d.json").is_dir()
    assert os.listdir(root / "d.json") == []


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


@pytest.mark.parametrize("path", ["../x.yaml", "out/x.yaml", "../x.txt"])
def test_a_write_outside_the_root_creates_nothing(
    root: Path, client: TestClient, path: str
) -> None:
    assert put(client, path, b"y: 2\n") == (400, OUTSIDE)
    assert not (root.parent / "x.yaml").exists()
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
        method, route, params={"path": "sub/new.yaml"}, content=b"y"
    )
    assert (response.status_code, response.json()) == (
        401,
        {"detail": "missing or invalid token"},
    )
    assert not (root / "sub" / "new.yaml").exists()


def test_a_write_from_a_foreign_origin_is_refused(
    root: Path, client: TestClient
) -> None:
    response = client.put(
        "/api/files",
        params={"path": "sub/new.yaml"},
        content=b"y: 2\n",
        headers={**AUTH, "Origin": "http://example.org"},
    )
    assert (response.status_code, response.json()) == (
        403,
        {"detail": "forbidden origin"},
    )
    assert not (root / "sub" / "new.yaml").exists()


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
