# syntax=docker/dockerfile:1

# uv-based image gives us both Python 3.12 and the `uv` CLI. The MCP server's
# `install_deps` tool shells out to `uv pip install` at runtime, so uv must
# remain available in the final image (not just at build time).
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

# Don't buffer stdout/stderr so logs surface immediately in `docker logs`.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app

# Install dependencies first (cached layer) using only the lockfiles.
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

# Copy the application source.
COPY . .

# Install the project itself into the environment.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

# Put the project's virtualenv on PATH so `uvicorn`/`python` resolve to it.
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
