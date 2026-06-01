import logging
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv
from langchain_tavily import TavilySearch
from mcp.server.fastmcp import FastMCP

load_dotenv(Path(__file__).parent.parent / ".env")

logger = logging.getLogger(__name__)

mcp = FastMCP("Tools")
_tavily = TavilySearch(max_results=3)


@mcp.tool()
def search_web(query: str) -> str:
    """Search Web for information"""
    logger.info("search_web | query=%r", query)
    results = _tavily.invoke(query)
    return str(results)


@mcp.tool()
def run_code(file_path: str):
    logger.info("run_code | file=%s", file_path)
    try:
        p = Path(file_path)
        # Run the script in its own directory so relative imports and file references resolve correctly.
        # Timeout of 10s prevents runaway or infinite-loop generated code from hanging the agent.
        process = subprocess.run(
            [sys.executable, p.name],
            capture_output=True, text=True, timeout=60, cwd=str(p.parent)
        )
        if process.returncode == 0:
            logger.info("run_code succeeded | file=%s", file_path)
            return {"success": True, "output": str(process.stdout)}
        else:
            logger.warning("run_code failed | file=%s | stderr=%r", file_path, process.stderr[:200])
            return {"success": False, "error": str(process.stderr)}
    except subprocess.TimeoutExpired:
        logger.warning("run_code timed out | file=%s", file_path)
        return {"success": False, "error": "code timed out"}
    except Exception as e:
        logger.error("run_code error | file=%s | %s", file_path, e)
        return {"success": False, "error": str(e)}


@mcp.tool()
def read_file(file_path: str):
    logger.info("read_file | file=%s", file_path)
    try:
        with open(file_path, "r") as file:
            data = file.read()
        return {"success": True, "data": data}
    except Exception as e:
        logger.error("read_file error | file=%s | %s", file_path, e)
        return {"success": False, "error": str(e)}


@mcp.tool()
def write_files(files: dict):
    logger.info("write_files | paths=%s", list(files.keys()))
    try:
        for file_path, content in files.items():
            Path(file_path).parent.mkdir(parents=True, exist_ok=True)
            with open(file_path, "w") as file:
                file.write(content)
        return {"success": True}
    except Exception as e:
        logger.error("write_files error | %s", e)
        return {"success": False, "error": str(e)}


@mcp.tool()
def list_files(directory: str):
    try:
        path = Path(directory)
        files = [str(f) for f in path.iterdir() if f.is_file()]
        return {"success": True, "files": files}
    except Exception as e:
        logger.error("list_files error | dir=%s | %s", directory, e)
        return {"success": False, "error": str(e)}


@mcp.tool()
def install_deps(packages: list):
    logger.info("install_deps | packages=%s", packages)
    try:
        process = subprocess.run(
            ["uv", "pip", "install", "--python", sys.executable, *packages],
            capture_output=True, text=True, timeout=120
        )
        if process.returncode == 0:
            logger.info("install_deps succeeded | packages=%s", packages)
            return {"success": True}
        logger.warning("install_deps failed | packages=%s | stderr=%r", packages, process.stderr[:200])
        return {"success": False, "error": process.stderr}
    except subprocess.TimeoutExpired:
        logger.warning("install_deps timed out | packages=%s", packages)
        return {"success": False, "error": "pip install timed out"}
    except Exception as e:
        logger.error("install_deps error | %s", e)
        return {"success": False, "error": str(e)}


if __name__ == "__main__":
    mcp.run(transport="stdio")
