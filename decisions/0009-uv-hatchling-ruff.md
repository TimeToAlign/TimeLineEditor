---
status: accepted
date: 2026-10-09
---

# Manage Python with uv, hatchling and Ruff

## Context

Python environments, distribution builds, style checks and tests need reproducible commands on Python 3.11 and newer.

## Considered options

- uv: lockfile, environment management, release-age cutoff and builds in one tool.
- pip-tools: standard requirements output, with more manual environment/build steps.
- Poetry or PDM: capable project managers, unnecessary migration and configuration here.
- hatchling: documented custom build hook API; setuptools would require command customisation.
- Ruff: one lint/format tool; Black + isort + flake8 require three configurations.
- pytest: fixtures, parametrisation and good assertion diagnostics; unittest adds boilerplate.
- Write it ourselves: a resolver, builder, formatter or test runner would duplicate established standards implementations.

## Decision

Use uv 0.11.28, hatchling 1.32.4, Ruff 0.16.9 and pytest 9.1.1. Pin direct Python tools and framework dependencies; preserve the required timetoalign lower bound. `uv.lock` and `exclude-newer` fix development resolution. Ruff uses line length 88, Python 3.11 syntax and E/F/W/I/UP/B rules.

Use httpx2 2.13.1 for FastAPI's TestClient via the locked Starlette version. CLI subprocess tests additionally exercise real loopback sockets. TOML metadata is read by the Python standard library, without a direct TOML parser dependency.

## Maintenance and dependencies

Astral maintains uv and Ruff; Charlie Marsh and a broader team reduce individual bus-factor risk but concentrate both tools in one organisation. Ofek Lev leads hatchling under PyPA; specialised backend work is more concentrated. pytest has a broad team including Bruno Oliveira, Ronny Pfannschmidt and contributors. Pydantic maintains httpx2, continuing Tom Christie's HTTPX; PyPI lists Marcelo Trylesinski (Kludex) as its owner. This gives the client organisational backing but concentrates publishing access in one listed owner. uv/Ruff and HTTP tools release frequent fixes; pytest and hatchling have periodic feature releases with intervening patches.

Ruff/uv ship native binaries without Python runtime dependencies. Hatchling adds packaging, pathspec, pluggy, trove-classifiers and tomlkit; its TOML dependency is inherited build infrastructure. pytest adds pluggy, packaging, iniconfig and pygments. httpx2 adds httpcore2, anyio, idna and truststore. All are development/build dependencies, separate from the wheel runtime.

Primary sources: <https://docs.astral.sh/uv/>, <https://docs.astral.sh/ruff/>, <https://hatch.pypa.io/latest/>, <https://docs.pytest.org/>, <https://github.com/Kludex/starlette/blob/main/starlette/testclient.py>, <https://github.com/pydantic/httpx2>.

Registry metadata checked on 2026-10-09. Sizes below are package bytes, not installed graphs: npm unpacked bytes; PyPI smallest release artifact. The lockfiles record the complete transitive graphs. Bus-factor assessments are qualitative; publisher counts do not prove how many people can maintain a project.

| Dependency | Release date | Licence | Size (bytes) | Direct dependency footprint |
|---|---|---|---:|---|
| uv 0.11.28 | 2026-07-07 | MIT OR Apache-2.0 | 5,985,690 | No runtime package dependencies |
| hatchling 1.32.4 | 2026-09-20 | MIT | 58,065 | packaging>=24.2, pathspec>=0.10.1, pluggy>=1.0.0, tomli>=1.2.2; python_version < "3.11", tomlkit>=0.11.1, trove-classifiers |
| ruff 0.16.9 | 2026-09-24 | MIT | 4,948,764 | No runtime package dependencies |
| pytest 9.1.1 | 2026-06-19 | MIT | 386,536 | colorama>=0.4; sys_platform == "win32", exceptiongroup>=1; python_version < "3.11", iniconfig>=1.0.1, packaging>=22, pluggy<2,>=1.5, pygments>=2.7.2, tomli>=1; python_version < "3.11" |
| httpx2 2.13.1 | 2026-09-23 | BSD-3-Clause | 95,597 | anyio>=4.10; sys_platform != "emscripten", httpcore2==2.13.1; sys_platform != "emscripten", httpx2-jsfetch; sys_platform == "emscripten" and python_version >= "3.12", idna>=3.18, truststore>=0.10; sys_platform != "emscripten", typing-extensions>=4.5.0; python_version < "3.13" |

Primary package metadata: <https://pypi.org/pypi/uv/0.11.28/json>, <https://pypi.org/pypi/hatchling/1.32.4/json>, <https://pypi.org/pypi/ruff/0.16.9/json>, <https://pypi.org/pypi/pytest/9.1.1/json>, <https://pypi.org/pypi/httpx2/2.13.1/json>.

## Consequences

CI shares local commands. Pins require deliberate updates and the absolute age cutoff must advance when refreshing the lock. Exit cost: export requirements for pip, replace the build hook adapter, and translate Ruff rules to other style tools.

## Review date

2027-04-09, or sooner if the selected tools stop supporting the pinned toolchain.
