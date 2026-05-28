from mcp.server.fastmcp import FastMCP
from pathlib import Path
import subprocess
import tempfile
import os
from langchain_community.tools.tavily_search import TavilySearchResults



mcp = FastMCP("Tools")

@mcp.tool()
def search_web(query:str) -> str:
    """Search Web for information"""
    search = TavilySearchResults(max_results=3)
    results = search.invoke(query)
    return str(results)

@mcp.tool()
def run_code(file_path:str):
    try:
        process = subprocess.run(["python", file_path], capture_output=True, text=True, timeout=10)
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
def write_file(file_path:str, content:str):
    try:
        with open(file_path, "w") as file:
            file.write(content)
            return {"success":True}
    except Exception as e:
        return {"success":False, "error": str(e)}

@mcp.tool()
def list_files(dir:str):
    try:
        path = Path(dir)
        files = [str(f) for f in path.iterdir() if f.is_file()]
        return {"success":True, "files":files}
    except Exception as e:
        return {"success":False, "error": str(e)}

if __name__ == "__main__":
    mcp.run(transport="stdio")