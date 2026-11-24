# The public deployment of TimeLineEditor: the editor and its server in one
# image, started in public mode (see the README). Build from the root of this
# repository:
#
#   docker build -t tilie-public .
#   docker run --rm -e TILIE_PUBLIC_HOST=editor.example.org -p 8000:8000 tilie-public
#
# Both projects resolve sibling repositories by relative path: the app packages
# link @timetoalign/timetoshare from ../../../../TimeToShare/js, and the server
# takes timetoalign and timetoshare from ../../timetoalign and
# ../../TimeToShare/python. Until releases carry what they need, the build
# therefore fetches those repositories beside this one, laid out as in a
# development checkout (/src/TimeLineEditor, /src/TimeToShare,
# /src/timetoalign).
#
# The two refs below move together with server/uv.lock, which records the
# versions of both repositories, and with the timetoalign commit checked out in
# .github/workflows/ci.yml. Build arguments move either one to another commit.
#
# Three stages: the editor is built with Node and pnpm; the server is installed
# with uv into a virtual environment, together with the built editor, which the
# server's package carries; the final image receives that environment and
# nothing else (no git, no uv, no sources).

ARG TIMETOALIGN_REF=3337db21974e7583506b133e213ca77119cef952
ARG TIMETOSHARE_REF=7ff0cfd59c22445527035f91a3cbc53458f69ea5

# ---------------------------------------------------------------------------
# Stage 1: build the editor (Node and pnpm; git only to fetch TimeToShare).
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS editor

ARG TIMETOSHARE_REF

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

# The schema package the app packages link to, built first (its js/ project
# carries its own lockfile). Corepack provides the pnpm each project's
# `packageManager` field names.
RUN git init -q /src/TimeToShare \
    && git -C /src/TimeToShare fetch -q --depth 1 \
        https://github.com/TimeToAlign/TimeToShare.git "$TIMETOSHARE_REF" \
    && git -C /src/TimeToShare checkout -q FETCH_HEAD
RUN corepack enable
WORKDIR /src/TimeToShare/js
RUN pnpm install --frozen-lockfile && pnpm build

# Dependencies come before sources: only the manifests and the lockfile are
# needed for the locked install, so a source change does not repeat it.
WORKDIR /src/TimeLineEditor/app
COPY app/package.json app/pnpm-lock.yaml app/pnpm-workspace.yaml ./
COPY app/packages/arranger/package.json packages/arranger/
COPY app/packages/client/package.json packages/client/
COPY app/packages/core/package.json packages/core/
COPY app/packages/editor/package.json packages/editor/
COPY app/packages/layout/package.json packages/layout/
COPY app/packages/writers/package.json packages/writers/
RUN pnpm install --frozen-lockfile

COPY app/ ./
RUN pnpm build

# ---------------------------------------------------------------------------
# Stage 2: install the server (Python and uv; git only to fetch the siblings).
# ---------------------------------------------------------------------------
FROM python:3.12-slim-bookworm AS server

ARG TIMETOALIGN_REF
ARG TIMETOSHARE_REF

COPY --from=ghcr.io/astral-sh/uv:0.11.28 /uv /uvx /usr/local/bin/

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

RUN git init -q /src/timetoalign \
    && git -C /src/timetoalign fetch -q --depth 1 \
        https://github.com/TimeToAlign/timetoalign.git "$TIMETOALIGN_REF" \
    && git -C /src/timetoalign checkout -q FETCH_HEAD
RUN git init -q /src/TimeToShare \
    && git -C /src/TimeToShare fetch -q --depth 1 \
        https://github.com/TimeToAlign/TimeToShare.git "$TIMETOSHARE_REF" \
    && git -C /src/TimeToShare checkout -q FETCH_HEAD

ENV UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_COMPILE_BYTECODE=1 \
    UV_HTTP_TIMEOUT=120

# The lockfile declares the two siblings and the server itself as editable
# paths; --no-editable installs all three as regular packages, so the
# environment refers to nothing under /src. Locked dependencies come first (the
# project's own build reads ../README.md and hatch_build.py).
WORKDIR /src/TimeLineEditor/server
COPY README.md ../README.md
COPY server/pyproject.toml server/uv.lock server/hatch_build.py ./
RUN uv sync --locked --no-dev --no-editable --no-install-project

# The server's wheel bundles the editor from ../app/packages/editor/dist, so
# the built editor has to be in place before the server is installed.
COPY --from=editor /src/TimeLineEditor/app/packages/editor/dist \
    /src/TimeLineEditor/app/packages/editor/dist
COPY server/src ./src
RUN uv sync --locked --no-dev --no-editable

# ---------------------------------------------------------------------------
# Stage 3: the image that runs. Only the virtual environment, at the path it
# was created at (its scripts name that path), on the same Python as stage 2.
# ---------------------------------------------------------------------------
FROM python:3.12-slim-bookworm

COPY --from=server /src/TimeLineEditor/server/.venv /src/TimeLineEditor/server/.venv

RUN useradd --create-home --uid 1000 tilie
USER tilie

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

# Public mode needs the host the service is reached under: TILIE_PUBLIC_HOST,
# or the hostname Render sets for its web services. PORT is honoured as such
# platforms set it. The editor is the one bundled in the server's package.
CMD if [ -z "${TILIE_PUBLIC_HOST:-$RENDER_EXTERNAL_HOSTNAME}" ]; then \
      echo "tilie: set TILIE_PUBLIC_HOST (or RENDER_EXTERNAL_HOSTNAME) to the host this service is reached under" >&2; \
      exit 1; \
    fi; \
    exec /src/TimeLineEditor/server/.venv/bin/tilie \
      --public-host "${TILIE_PUBLIC_HOST:-$RENDER_EXTERNAL_HOSTNAME}" \
      --port "${PORT:-8000}"
