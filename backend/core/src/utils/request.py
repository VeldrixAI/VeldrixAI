"""Utility functions for request handling."""

import uuid
import time
from contextvars import ContextVar
from typing import Optional


request_id_var: ContextVar[Optional[str]] = ContextVar('request_id', default=None)


def generate_request_id() -> str:
    """Generate unique request ID."""
    return str(uuid.uuid4())


def get_request_id() -> Optional[str]:
    """Get current request ID from context."""
    return request_id_var.get()


def set_request_id(request_id: str) -> None:
    """Set request ID in context."""
    request_id_var.set(request_id)


class Timer:
    """Simple execution timer."""
    
    def __init__(self):
        self.start_time = None
        self.end_time = None
    
    def start(self):
        """Start timer."""
        self.start_time = time.perf_counter()
        return self
    
    def stop(self) -> float:
        """Stop timer and return elapsed milliseconds."""
        self.end_time = time.perf_counter()
        return (self.end_time - self.start_time) * 1000
