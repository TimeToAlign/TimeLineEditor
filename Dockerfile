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
# ../../TimeToShare/python. Until releases carry what they need, the image
# therefore clones those repositories beside this one at build time, laid out
# as in a development checkout (/src/TimeLineEditor, /src/TimeToShare,
# /src/timetoalign). The default timetoalign commit is the one server/uv.lock
# was locked against; the build arguments move either clone to another ref.

ARG TIMETOALIGN_REF=3337db21974e7583506b133e213ca77119cef952
ARG TIMETOSHARE_REF=main

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
RUN git clone https://github.com/TimeToAlign/TimeToShare.git /src/TimeToShare \
    && git -C /src/TimeToShare checkout "$TIMETOSHARE_REF"
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
# Stage 2: the server (Python and uv; git only to fetch the siblings).
# ---------------------------------------------------------------------------
FROM python:3.12-slim-bookworm AS server

ARG TIMETOALIGN_REF
ARG TIMETOSHARE_REF

COPY --from=ghcr.io/astral-sh/uv:0.11.28 /uv /uvx /usr/local/bin/

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

# The two editable siblings stay in the image: the server's environment refers
# to them in place. Their history is not needed at run time.
RUN git clone https://github.com/TimeToAlign/timetoalign.git /src/timetoalign \
    && git -C /src/timetoalign checkout "$TIMETOALIGN_REF" \
    && rm -rf /src/timetoalign/.git
RUN git clone https://github.com/TimeToAlign/TimeToShare.git /src/TimeToShare \
    && git -C /src/TimeToShare checkout "$TIMETOSHARE_REF" \
    && rm -rf /src/TimeToShare/.git

ENV UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_COMPILE_BYTECODE=1 \
    UV_HTTP_TIMEOUT=120

# Locked dependencies first (the project's own build reads ../README.md and
# hatch_build.py), then the server sources.
WORKDIR /src/TimeLineEditor/server
COPY README.md ../README.md
COPY server/pyproject.toml server/uv.lock server/hatch_build.py ./
RUN uv sync --locked --no-dev --no-install-project
COPY server/src ./src
RUN uv sync --locked --no-dev

# The editor built in stage 1, where the server's --static-dir points.
COPY --from=editor /src/TimeLineEditor/app/packages/editor/dist \
    /src/TimeLineEditor/app/packages/editor/dist

RUN useradd --create-home --uid 1000 tilie
USER tilie

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

# Public mode needs the host the service is reached under: TILIE_PUBLIC_HOST,
# or the hostname Render sets for its web services. PORT is honoured as such
# platforms set it.
CMD if [ -z "${TILIE_PUBLIC_HOST:-$RENDER_EXTERNAL_HOSTNAME}" ]; then \
      echo "tilie: set TILIE_PUBLIC_HOST (or RENDER_EXTERNAL_HOSTNAME) to the host this service is reached under" >&2; \
      exit 1; \
    fi; \
    exec /src/TimeLineEditor/server/.venv/bin/tilie \
      --public-host "${TILIE_PUBLIC_HOST:-$RENDER_EXTERNAL_HOSTNAME}" \
      --port "${PORT:-8000}" \
      --static-dir /src/TimeLineEditor/app/packages/editor/dist
