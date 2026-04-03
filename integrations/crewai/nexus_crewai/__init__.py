"""
nexus-crewai
============
CrewAI integration for the Nexus multi-agent memory platform.

Exports
-------
NexusCrewMemory
    CrewAI memory backend that compiles context from Nexus and sends task
    outputs to the distillery.

NexusCrewCallback
    Task and crew lifecycle callback that captures outputs and creates
    Nexus session summaries automatically.
"""

from .callback import NexusCrewCallback
from .memory import NexusCrewMemory

__version__ = "0.1.0"

__all__ = [
    "NexusCrewMemory",
    "NexusCrewCallback",
]
