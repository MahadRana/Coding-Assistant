import sys
from pathlib import Path

from dotenv import load_dotenv
from langchain_mcp_adapters.client import MultiServerMCPClient

load_dotenv()

_MCP_SERVER = str(Path(__file__).parent / "mcp_server.py")

# Single MCP client shared by every subgraph. One stdio subprocess, one tool list.
client = MultiServerMCPClient({
    "tools": {
        "command": sys.executable,
        "args": [_MCP_SERVER],
        "transport": "stdio",
    }
})

_tools = None


async def get_tools():
    """Return the MCP tool list, fetching it from the server only once."""
    global _tools
    if _tools is None:
        _tools = await client.get_tools()
    return _tools
