"""
nexus-langchain
===============
LangChain / LangGraph integration for the Nexus multi-agent memory platform.

Exports
-------
NexusMemory
    LangChain ``BaseMemory`` that compiles context from Nexus on every chain
    invocation and sends conversation turns to the distillery.

NexusCallbackHandler
    ``BaseCallbackHandler`` that automatically captures LLM, chain, and tool
    outputs and ships them to the Nexus distillery.

NexusCheckpointer
    LangGraph ``BaseCheckpointSaver`` that persists checkpoints as Nexus
    session summaries.
"""

try:
    import langchain_core  # noqa: F401
except ImportError:
    raise ImportError(
        "nexus-langchain requires langchain-core>=0.3.0. "
        "Install it with: pip install langchain-core"
    )

from .callback import NexusCallbackHandler
from .checkpointer import NexusCheckpointer
from .memory import NexusMemory

__version__ = "0.1.0"

__all__ = [
    "NexusMemory",
    "NexusCallbackHandler",
    "NexusCheckpointer",
]
