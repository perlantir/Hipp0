"""Nexus Memory — zero-config decision memory for multi-agent teams."""

from nexus_sdk.client import NexusClient
from .server import NexusServer

_server = None

def init(db_path="./nexus.db", port=3100):
    """Start Nexus with zero config. One line."""
    global _server
    _server = NexusServer(db_path=db_path, port=port)
    _server.start()
    return NexusClient(
        base_url=f"http://localhost:{port}",
        api_key=_server.api_key
    )

def stop():
    """Stop the running Nexus server."""
    global _server
    if _server:
        _server.stop()
        _server = None
