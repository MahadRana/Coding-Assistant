from mcp.server.fastmcp import FastMCP
from pathlib import Path
import subprocess
import sys
from langchain_tavily import TavilySearch


mcp = FastMCP("Tools")
_tavily = TavilySearch(max_results=3)

@mcp.tool()
def search_web(query:str) -> str:
    """Search Web for information"""
    results = _tavily.invoke(query)
    return str(results)

@mcp.tool()
def run_code(file_path:str):
    try:
        p = Path(file_path)
        process = subprocess.run([sys.executable, p.name], capture_output=True, text=True, timeout=10, cwd=str(p.parent))
        if process.returncode == 0:
            return {"success":True, "output":str(process.stdout)}
        else:
            return {"success":False, "error":str(process.stderr)}
    except subprocess.TimeoutExpired:
        return {"success":False, "error": "code timed out"}
    except Exception as e:
        return {"success":False, "error": str(e)}
        

@mcp.tool()
def read_file(file_path:str):
    try:
        with open(file_path, "r") as file:
            data = file.read()
            return {"success":True, "data":data}
    except Exception as e:
        return {"success":False, "error": str(e)}



@mcp.tool()
def write_files(files:dict):
    try:
        for file_path, content in files.items():
            Path(file_path).parent.mkdir(parents=True, exist_ok=True)
            with open(file_path, "w") as file:
                file.write(content)
        return {"success":True}
    except Exception as e:
        return {"success":False, "error": str(e)}

@mcp.tool()
def list_files(directory: str):
    try:
        path = Path(directory)
        files = [str(f) for f in path.iterdir() if f.is_file()]
        return {"success":True, "files":files}
    except Exception as e:
        return {"success":False, "error": str(e)}

@mcp.tool()
def install_deps(packages: list):
    try:
        process = subprocess.run(
            [sys.executable, "-m", "pip", "install", *packages],
            capture_output=True, text=True, timeout=120
        )
        if process.returncode == 0:
            return {"success": True}
        return {"success": False, "error": process.stderr}
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "pip install timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    mcp.run(transport="stdio")
