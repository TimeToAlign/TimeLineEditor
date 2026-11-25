"""Sphinx configuration of the TimeLineEditor documentation site.

The site is built from this folder with one command (see ``README.md`` here).
Three kinds of pages are produced while the build starts, none of them tracked:

- ``api-ts/``: the TypeScript API, Markdown written by TypeDoc and
  typedoc-plugin-markdown from ``typedoc.json``;
- ``api-py/``: the Python API, pages written by autosummary;
- ``decisions/``: one page per record in the repository's ``decisions/``
  folder, each of which includes that record.

Markdown outside this folder (the README, CONTRIBUTING, the changelog and the
decision records) is included, never copied. Its links point into the
repository; they are rewritten while it is read so that each one leads to the
page that shows the linked file on this site, or to the file on GitHub.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from importlib.metadata import metadata
from pathlib import Path, PurePosixPath

from docutils.nodes import Element
from sphinx.addnodes import pending_xref
from sphinx.application import Sphinx
from sphinx.environment import BuildEnvironment
from sphinx.ext import intersphinx, napoleon

DOCS = Path(__file__).resolve().parent
REPO = DOCS.parent
APP = REPO / "app"

_metadata = metadata("tilie-server")
_urls = dict(entry.split(", ", 1) for entry in _metadata.get_all("Project-URL") or [])
REPOSITORY = _urls["Repository"]

# -- Project -------------------------------------------------------------------

project = "TimeLineEditor"
author = _metadata["Author"]
copyright = author
release = _metadata["Version"]
version = release

# -- General -------------------------------------------------------------------

extensions = [
    "myst_parser",
    "sphinx.ext.autodoc",
    "sphinx.ext.autosummary",
    "sphinx.ext.intersphinx",
    "sphinx.ext.napoleon",
    "sphinx.ext.viewcode",
]

source_suffix = {".md": "markdown", ".rst": "restructuredtext"}
root_doc = "index"
exclude_patterns = ["_build", "api-ts/index.md"]
templates_path = ["_templates"]

myst_heading_anchors = 6
myst_enable_extensions = ["colon_fence", "deflist"]

# -- Python API ----------------------------------------------------------------

autosummary_generate = True
autodoc_default_options = {
    "members": True,
    "undoc-members": True,
    "show-inheritance": True,
    # Each module's page shows what the module defines; a name it re-exports
    # through ``__all__`` is documented where it is defined.
    "ignore-module-all": True,
}
autodoc_member_order = "bysource"
autodoc_typehints = "description"
napoleon_google_docstring = True
napoleon_numpy_docstring = False
napoleon_use_ivar = True
# A constant holding an instance of a built-in class (a ``struct.Struct``, a
# ``list[...]`` alias) is shown in its module's source, not in the class's.
viewcode_follow_imported_members = False

intersphinx_mapping = {
    "python": ("https://docs.python.org/3", None),
    "numpy": ("https://numpy.org/doc/stable", None),
    "pyarrow": ("https://arrow.apache.org/docs", None),
}

# FastAPI, Starlette, Pydantic, uvicorn, timetoalign and timetoshare publish no
# Sphinx inventory, so their types in signatures cannot be linked. A FastAPI
# dependency is a parameter type ``Annotated[T, Depends(...)]``, whose keyword
# arguments autodoc shows among the types.
nitpick_ignore_regex = [
    (r"py:.*", r"(fastapi|starlette|pydantic|uvicorn|timetoalign|timetoshare)(\..*)?"),
    (r"py:class", r"ASGIApp"),
    (r"py:class", r"\w+=.*"),
]

# -- HTML ----------------------------------------------------------------------

html_theme = "pydata_sphinx_theme"
html_title = f"{project} {release}"
html_theme_options = {
    "icon_links": [
        {"name": "GitHub", "url": REPOSITORY, "icon": "fa-brands fa-github"},
    ],
    "navigation_with_keys": False,
    "show_toc_level": 2,
}
html_show_sourcelink = False

# -- Generated pages -----------------------------------------------------------

#: Repository files that are pages of this site, by their page name.
SITE_PAGES = {
    "README.md": "index",
    "CONTRIBUTING.md": "contributing",
    "CHANGELOG.md": "changelog",
    "decisions": "decisions",
}

_LINK = re.compile(r"\]\((?P<target>[^)\s]+)(?P<title>\s+\"[^\"]*\")?\)")
_SCHEME = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*:")
_FRONT_MATTER = re.compile(r"\A---\n(?P<fields>.*?)\n---\n", re.DOTALL)


def _page_of(path: PurePosixPath) -> str | None:
    """The page of this site that shows the repository file ``path``, if any."""
    if str(path) in SITE_PAGES:
        return SITE_PAGES[str(path)]
    if path.suffix == ".md" and len(path.parts) == 2:
        folder = path.parts[0]
        if folder == "docs":
            return path.stem
        if folder == "decisions":
            return f"decisions/{path.stem}"
    return None


def _rewrite_links(text: str, source: Path, page_folder: PurePosixPath) -> str:
    """Point the relative links of ``text`` at this site's pages or at GitHub.

    Args:
        text: Markdown read from the repository file ``source``.
        source: The file the links are relative to.
        page_folder: The folder, relative to this one, of the page the text is
            shown on; links to pages are written relative to it.
    """

    def replace(match: re.Match[str]) -> str:
        target = match["target"]
        path, hash_, anchor = target.partition("#")
        if not path or _SCHEME.match(path):
            return match[0]
        absolute = Path(os.path.normpath(source.parent / path))
        relative = PurePosixPath(absolute.relative_to(REPO).as_posix())
        page = _page_of(relative)
        if page is not None:
            new = Path(os.path.relpath(f"{page}.md", page_folder)).as_posix()
        else:
            kind = "tree" if absolute.is_dir() else "blob"
            new = f"{REPOSITORY}/{kind}/main/{relative}"
        return f"]({new}{hash_}{anchor}{match['title'] or ''})"

    return _LINK.sub(replace, text)


def _front_matter_as_line(text: str) -> str:
    """Show a decision record's front matter as one line under its title."""
    match = _FRONT_MATTER.match(text)
    if match is None:
        return text
    fields = dict(
        line.split(":", 1) for line in match["fields"].splitlines() if ":" in line
    )
    body = text[match.end() :]
    line = " · ".join(
        f"{key.strip().capitalize()}: {value.strip()}" for key, value in fields.items()
    )
    title, newline, rest = body.lstrip("\n").partition("\n")
    return f"{title}{newline}\n*{line}*\n{rest}"


def _write_decision_pages() -> None:
    """One page per decision record, each including the record itself."""
    folder = DOCS / "decisions"
    shutil.rmtree(folder, ignore_errors=True)
    folder.mkdir()
    for record in sorted((REPO / "decisions").glob("*.md")):
        (folder / record.name).write_text(
            f"```{{include}} ../../decisions/{record.name}\n```\n", encoding="utf-8"
        )


def _write_typescript_api() -> None:
    """Write the TypeScript API as Markdown into ``api-ts/`` with TypeDoc."""
    pnpm = shutil.which("pnpm")
    if pnpm is None:
        raise RuntimeError("pnpm is needed to build the TypeScript API pages")
    subprocess.run(
        [pnpm, "exec", "typedoc", "--options", str(DOCS / "typedoc.json")],
        cwd=APP,
        check=True,
    )
    _align_anchors(DOCS / "api-ts")


_CUSTOM_ANCHOR = re.compile(r"\s*\{#(?P<anchor>[^}]+)\}\s*$")
_ANCHORED_LINK = re.compile(r"\]\((?P<page>[^)\s#]*)#(?P<anchor>[^)\s]+)\)")


def _align_anchors(folder: Path) -> None:
    """Make the links between TypeDoc's pages use MyST's heading anchors.

    typedoc-plugin-markdown numbers repeated headings differently from MyST, so
    its anchors are written after each heading (``{#anchor}``), read here, and
    replaced: every link to an anchor is pointed at the anchor MyST gives that
    heading (``myst_parser``'s slug of its text, numbered on repetition), and
    the written anchors are removed.
    """
    from markdown_it import MarkdownIt
    from myst_parser.mdit_to_docutils.base import default_slugify

    parser = MarkdownIt("commonmark")
    anchors: dict[Path, dict[str, str]] = {}
    texts: dict[Path, list[str]] = {}
    for page in sorted(folder.rglob("*.md")):
        lines = page.read_text(encoding="utf-8").splitlines(keepends=True)
        tokens = parser.parse("".join(lines))
        slugs: set[str] = set()
        mapping: dict[str, str] = {}
        for opening, inline in zip(tokens, tokens[1:], strict=False):
            if opening.type != "heading_open" or opening.map is None:
                continue
            title = "".join(
                child.content
                for child in inline.children or []
                if child.type in ("text", "code_inline")
            )
            custom = _CUSTOM_ANCHOR.search(title)
            if custom is not None:
                title = title[: custom.start()]
                line = opening.map[0]
                lines[line] = _CUSTOM_ANCHOR.sub("", lines[line].rstrip("\n")) + "\n"
            slug = default_slugify(title.strip())
            number = 1
            while slug in slugs:
                slug = f"{slug}-{number}"
                number += 1
            slugs.add(slug)
            if custom is not None:
                mapping[custom["anchor"]] = slug
        anchors[page] = mapping
        texts[page] = lines

    for page, lines in texts.items():

        def replace(match: re.Match[str], page: Path = page) -> str:
            target = page
            if match["page"]:
                target = Path(os.path.normpath(page.parent / match["page"]))
            anchor = anchors.get(target, {}).get(match["anchor"], match["anchor"])
            return f"]({match['page']}#{anchor})"

        page.write_text(_ANCHORED_LINK.sub(replace, "".join(lines)), encoding="utf-8")


def _generate(app: Sphinx) -> None:
    _write_decision_pages()
    _write_typescript_api()


_PACKAGE_INDEX = re.compile(r"^api-ts/@timetoalign/[^/]+/index$")


def _read_page(app: Sphinx, docname: str, content: list[str]) -> None:
    """Adjust a page of this folder as it is read.

    Each TypeScript package page gets a table of contents over its modules, and
    the links of the pages written in this folder are pointed at the site.
    """
    if _PACKAGE_INDEX.match(docname):
        content[0] += "\n```{toctree}\n:hidden:\n:glob:\n\n**\n```\n"
    elif not docname.startswith(("api-ts/", "api-py/")):
        source = DOCS / f"{docname}.md"
        if source.exists():
            folder = PurePosixPath(docname).parent
            content[0] = _rewrite_links(content[0], source, folder)


def _read_included(
    app: Sphinx, relative_path: Path, parent_docname: str, content: list[str]
) -> None:
    """Point the links of an included repository file at the site."""
    source = Path(os.path.normpath(DOCS / relative_path))
    relative = PurePosixPath(source.relative_to(REPO).as_posix())
    folder = (
        PurePosixPath(relative.parts[0]) if relative.parts[0] == "decisions" else None
    )
    text = content[0]
    if folder is not None:
        text = _front_matter_as_line(text)
    content[0] = _rewrite_links(text, source, folder or PurePosixPath("."))


def _qualify_raised(obj: object, lines: list[str]) -> None:
    """Name each exception of a ``Raises:`` section by its full path.

    A docstring names an exception as its module does; autodoc looks the name
    up among every documented module, where two classes may share it.
    """
    module = sys.modules.get(getattr(obj, "__module__", "") or "")
    if module is None:
        return
    section_indent: int | None = None
    for index, line in enumerate(lines):
        indent = len(line) - len(line.lstrip())
        if line.strip() == "Raises:":
            section_indent = indent
            continue
        if section_indent is None:
            continue
        if line.strip() and indent <= section_indent:
            section_indent = None
            continue
        entry = re.match(r"^(\s+)(\w+):", line)
        if entry is None:
            continue
        raised = getattr(module, entry[2], None)
        if isinstance(raised, type) and issubclass(raised, BaseException):
            path = f"~{raised.__module__}.{raised.__qualname__}"
            lines[index] = f"{entry[1]}{path}{line[entry.end(2) :]}"


_RESULT_FIELDS = {"Returns:": ":returns:", "Yields:": ":Yields:"}


def _untyped_results(lines: list[str]) -> None:
    """Write each ``Returns:`` and ``Yields:`` section as a field without type.

    The type of a result is its annotation, which autodoc shows; napoleon
    would read the words before the section's first colon as a type.
    """
    index = 0
    while index < len(lines):
        field = _RESULT_FIELDS.get(lines[index].strip())
        if field is None:
            index += 1
            continue
        indent = len(lines[index]) - len(lines[index].lstrip())
        end = index + 1
        while end < len(lines) and (
            not lines[end].strip()
            or len(lines[end]) - len(lines[end].lstrip()) > indent
        ):
            end += 1
        raw = lines[index + 1 : end]
        common = min(
            (len(line) - len(line.lstrip()) for line in raw if line.strip()), default=0
        )
        body = [line[common:].rstrip() for line in raw]
        while body and not body[-1]:
            body.pop()
        if not body:
            index = end
            continue
        margin = " " * indent
        section = [f"{margin}{field} {body[0]}"]
        section += [f"{margin}    {line}" if line else "" for line in body[1:]]
        lines[index:end] = [*section, ""]
        index += len(section) + 1


def _read_docstring(
    app: Sphinx, what: str, name: str, obj: object, options: object, lines: list[str]
) -> None:
    """Read a docstring with napoleon, except a constant's or an attribute's.

    The docstring of a constant or an attribute is a sentence; its type is its
    annotation. Napoleon would read the words before its first colon as a type.
    """
    if what in ("data", "attribute"):
        return
    _qualify_raised(obj, lines)
    _untyped_results(lines)
    napoleon._process_docstring(app, what, name, obj, options, lines)


def _resolve_in_module(
    app: Sphinx, env: BuildEnvironment, node: pending_xref, contnode: Element
) -> Element | None:
    """Resolve a Python name the way its module does.

    A docstring or an annotation names an object as its module imports it
    (``MusicBrainz``, ``Annotated``); the object is documented where it is
    defined, under its full path, which is looked up here.
    """
    if node.get("refdomain") != "py":
        return None
    module = sys.modules.get(node.get("py:module") or "")
    target = node["reftarget"]
    parts = target.split(".")
    for end in range(len(parts) - 1, 0, -1):
        if ".".join(parts[:end]) in sys.modules:
            module = sys.modules[".".join(parts[:end])]
            target = ".".join(parts[end:])
            break
    head, _, rest = target.partition(".")
    found = getattr(module, head, None) if module is not None else None
    defined_in = getattr(found, "__module__", None)
    if defined_in is None or defined_in == getattr(module, "__name__", None):
        return None
    qualname = getattr(found, "__qualname__", head)
    full = ".".join(part for part in (defined_in, qualname, rest) if part)
    resolved = env.get_domain("py").resolve_xref(
        env, node["refdoc"], app.builder, node["reftype"], full, node, contnode
    )
    if resolved is not None:
        return resolved
    moved = node.deepcopy()
    moved["reftarget"] = full
    # An annotation is looked up as a class; a special form such as
    # ``typing.Annotated`` is data in Python's inventory.
    moved["reftype"] = "obj"
    return intersphinx.missing_reference(app, env, moved, contnode)


def setup(app: Sphinx) -> None:
    app.connect("missing-reference", _resolve_in_module)
    for listener in list(app.events.listeners["autodoc-process-docstring"]):
        if listener.handler is napoleon._process_docstring:
            app.disconnect(listener.id)
    app.connect("autodoc-process-docstring", _read_docstring)
    app.connect("builder-inited", _generate, priority=100)
    app.connect("source-read", _read_page)
    app.connect("include-read", _read_included)
