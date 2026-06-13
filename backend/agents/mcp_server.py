import asyncio
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv
from langchain_tavily import TavilySearch
from mcp.server.fastmcp import FastMCP

load_dotenv(Path(__file__).parent.parent / ".env")

logger = logging.getLogger(__name__)

mcp = FastMCP("Tools")
_tavily = TavilySearch(max_results=3)


async def _run_subprocess(cmd: list[str], *, cwd: str | None = None, timeout: float):
    """Run a subprocess without blocking the event loop.

    Returns (returncode, stdout, stderr). Raises asyncio.TimeoutError on timeout,
    after killing the child so it can't outlive the call.
    """
    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=cwd,
    )
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        process.kill()
        await process.communicate()
        raise
    return process.returncode, stdout.decode(), stderr.decode()


@mcp.tool()
async def search_web(query: str) -> str:
    """Search Web for information"""
    logger.info("search_web | query=%r", query)
    results = await _tavily.ainvoke(query)
    return str(results)


@mcp.tool()
async def run_code(file_path: str):
    logger.info("run_code | file=%s", file_path)
    try:
        p = Path(file_path)
        # Run the script in its own directory so relative imports and file references resolve correctly.
        # Timeout of 60s prevents runaway or infinite-loop generated code from hanging the agent.
        returncode, stdout, stderr = await _run_subprocess(
            [sys.executable, p.name], cwd=str(p.parent), timeout=60
        )
        if returncode == 0:
            logger.info("run_code succeeded | file=%s", file_path)
            return {"success": True, "output": str(stdout)}
        else:
            logger.warning("run_code failed | file=%s | stderr=%r", file_path, stderr[:200])
            return {"success": False, "error": str(stderr)}
    except asyncio.TimeoutError:
        logger.warning("run_code timed out | file=%s", file_path)
        return {"success": False, "error": "code timed out"}
    except Exception as e:
        logger.error("run_code error | file=%s | %s", file_path, e)
        return {"success": False, "error": str(e)}


def _read_file_sync(file_path: str) -> str:
    with open(file_path, "r") as file:
        return file.read()


@mcp.tool()
async def read_file(file_path: str):
    logger.info("read_file | file=%s", file_path)
    try:
        data = await asyncio.to_thread(_read_file_sync, file_path)
        return {"success": True, "data": data}
    except Exception as e:
        logger.error("read_file error | file=%s | %s", file_path, e)
        return {"success": False, "error": str(e)}


def _write_files_sync(files: dict):
    for file_path, content in files.items():
        Path(file_path).parent.mkdir(parents=True, exist_ok=True)
        with open(file_path, "w") as file:
            file.write(content)


@mcp.tool()
async def write_files(files: dict):
    logger.info("write_files | paths=%s", list(files.keys()))
    try:
        await asyncio.to_thread(_write_files_sync, files)
        return {"success": True}
    except Exception as e:
        logger.error("write_files error | %s", e)
        return {"success": False, "error": str(e)}


def _list_files_sync(directory: str) -> list[str]:
    path = Path(directory)
    return [str(f) for f in path.iterdir() if f.is_file()]


@mcp.tool()
async def list_files(directory: str):
    try:
        files = await asyncio.to_thread(_list_files_sync, directory)
        return {"success": True, "files": files}
    except Exception as e:
        logger.error("list_files error | dir=%s | %s", directory, e)
        return {"success": False, "error": str(e)}


@mcp.tool()
async def install_deps(packages: list):
    logger.info("install_deps | packages=%s", packages)
    try:
        returncode, _stdout, stderr = await _run_subprocess(
            ["uv", "pip", "install", "--python", sys.executable, *packages],
            timeout=120,
        )
        if returncode == 0:
            logger.info("install_deps succeeded | packages=%s", packages)
            return {"success": True}
        logger.warning("install_deps failed | packages=%s | stderr=%r", packages, stderr[:200])
        return {"success": False, "error": stderr}
    except asyncio.TimeoutError:
        logger.warning("install_deps timed out | packages=%s", packages)
        return {"success": False, "error": "pip install timed out"}
    except Exception as e:
        logger.error("install_deps error | %s", e)
        return {"success": False, "error": str(e)}


if __name__ == "__main__":
    mcp.run(transport="stdio")
