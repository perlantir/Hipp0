"""
Nexus SDK — Exceptions
======================
All SDK-specific exception types.
"""

from __future__ import annotations


class NexusError(Exception):
    """Base class for all Nexus SDK errors."""


class NexusApiError(NexusError):
    """Raised when the Nexus API returns a non-2xx HTTP response."""

    def __init__(self, status_code: int, message: str, response_body: dict | None = None) -> None:
        self.status_code = status_code
        self.message = message
        self.response_body = response_body or {}
        super().__init__(f"HTTP {status_code}: {message}")


class NexusNotFoundError(NexusApiError):
    """Raised on HTTP 404 responses."""


class NexusAuthError(NexusApiError):
    """Raised on HTTP 401 / 403 responses."""


class NexusValidationError(NexusApiError):
    """Raised on HTTP 422 validation failures."""


class NexusConnectionError(NexusError):
    """Raised when the SDK cannot reach the Nexus server."""


__all__ = [
    "NexusError",
    "NexusApiError",
    "NexusNotFoundError",
    "NexusAuthError",
    "NexusValidationError",
    "NexusConnectionError",
]
