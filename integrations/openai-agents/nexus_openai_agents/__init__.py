"""
nexus-openai-agents
===================
OpenAI Agents SDK integration for the Nexus multi-agent memory platform.

Exports
-------
NexusAgentHooks
    Lifecycle hooks (``on_start``, ``on_end``, ``on_tool_output``,
    ``on_handoff``) that compile Nexus context, capture tool outputs, and
    send conversations to the distillery automatically.
"""

from .hooks import NexusAgentHooks

__version__ = "0.1.0"

__all__ = [
    "NexusAgentHooks",
]
