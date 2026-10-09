---
status: accepted
date: 2026-10-09
---

# Serve the app with FastAPI and uvicorn

## Context

The local server must serve static files, report installed versions and reject foreign hosts, origins and invalid API tokens.

## Considered options

- FastAPI + uvicorn: ASGI routes, Starlette static serving and a standard server.
- Starlette alone: enough for this endpoint, but would remove the chosen FastAPI application interface.
- Flask: mature WSGI framework, a different application/server interface.
- aiohttp: integrated async server, but different middleware and test contracts.
- Litestar: capable ASGI framework, no present advantage for this API.
- Write it ourselves: HTTP parsing, middleware and file serving are mature infrastructure; a custom server creates unnecessary correctness work.

## Decision

Use fastapi 0.141.1 and uvicorn[standard] 0.53.0. A pure ASGI guard checks Host and Origin before routing, and exact bearer authentication for `/api/`. Static pages require the Host and Origin checks but no bearer header. The CLI binds only 127.0.0.1 and generates a token for each run.

`timetoalign>=1.2.0` is required, locked at 1.2.0 for development, and is queried only through `importlib.metadata`; no model code is imported. Health contains exactly three fields. The CLI self-check verifies both health and the built app.

## Maintenance and dependencies

Sebastián Ramírez and the FastAPI team maintain FastAPI. Marcelo Trylesinski and contributors maintain Starlette/uvicorn, originally authored by Tom Christie. Multiple contributors exist, with substantial lead-maintainer concentration. They release frequent fixes and occasional API changes. Johannes Hentschel and TimeToAlign! contributors maintain timetoalign; its smaller maintainer pool is a concentration risk, and releases follow library changes.

FastAPI adds Starlette, anyio and pydantic (including its native core). Uvicorn's required standard extra adds parsers, an event loop, WebSocket/file-watch support, dotenv and PyYAML. timetoalign necessarily adds networkx, pandas, NumPy and pyarrow. These inherited dependencies are accepted as part of the explicitly required distributions; no direct YAML or Arrow integration is added.

Primary sources: <https://fastapi.tiangolo.com/>, <https://github.com/Kludex/starlette>, <https://www.uvicorn.org/>, <https://github.com/TimeToAlign/timetoalign>.

Registry metadata checked on 2026-10-09. Sizes below are package bytes, not installed graphs: npm unpacked bytes; PyPI smallest release artifact. The lockfiles record the complete transitive graphs. Bus-factor assessments are qualitative; publisher counts do not prove how many people can maintain a project.

| Dependency | Release date | Licence | Size (bytes) | Direct dependency footprint |
|---|---|---|---:|---|
| fastapi 0.141.1 | 2026-07-29 | MIT | 131,954 | starlette>=0.46.0, pydantic>=2.9.0, typing-extensions>=4.8.0, typing-inspection>=0.4.2, annotated-doc>=0.0.2 |
| uvicorn 0.53.0 | 2026-09-14 | BSD-3-Clause | 87,081 | click>=7.0, h11>=0.8, typing-extensions>=4.0; python_version < "3.11" |
| timetoalign 1.2.0 | 2026-08-08 | MIT | 697,542 | networkx>=3.0, pandas>=2.0, pyarrow>=14.0, pydantic<3,>=2.7, typing-extensions>=4.0 |

Primary package metadata: <https://pypi.org/pypi/fastapi/0.141.1/json>, <https://pypi.org/pypi/uvicorn/0.53.0/json>, <https://pypi.org/pypi/timetoalign/1.2.0/json>.

## Consequences

One loopback process serves the wheel offline after installation. Required extras and timetoalign make the installation much larger than the health endpoint itself. Exit cost: retain the ASGI guard and static mount, replace route decorators and CLI server startup.

## Review date

2027-04-09, or sooner if the selected tools stop supporting the pinned toolchain.
