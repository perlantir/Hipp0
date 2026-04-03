"""
nexus-autogen
=============
Microsoft AutoGen integration for the Nexus multi-agent memory platform.

Exports
-------
NexusAutoGenMemory
    Memory backend for AutoGen agents that compiles context from Nexus,
    buffers messages for periodic distillation, and creates session summaries.
"""

from .memory import NexusAutoGenMemory

__version__ = "0.1.0"

__all__ = [
    "NexusAutoGenMemory",
]
