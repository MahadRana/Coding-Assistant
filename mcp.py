from mcp.server.fastmcp import FastMCP
from pathlib import Path
import subprocess
import tempfile
import os



mcp = FastMCP("Tools")

@mcp.tool()
def run_code(code:str):
    try:
        # Creates a securely named temp file and opens it in text write mode
        with tempfile.NamedTemporaryFile(mode='w+', delete=False) as temp_file:
            temp_file.write(code)
            temp_path = temp_file.name

        process = subprocess.run(["python", temp_path], capture_output=True, text=True, timeout=10)
        if process.returncode == 0:
            return {"success":True, "output":str(process.stdout)}
        else:
            return {"success":False, "error":str(process.stderr)}
    except subprocess.TimeoutExpired:
        return {"success":False, "error": "code timed out"}
    except Exception as e:
        return {"success":False, "error": str(e)}
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        

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