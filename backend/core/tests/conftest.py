"""
pytest session configuration for the VeldrixAI pillar test suite.

Sets NVIDIA_API_KEY=test so the inference provider registry includes
nvidia_nim in the active provider list during tests.  All actual HTTP calls
are intercepted by mocking route_inference in individual test modules.
"""

import os

# Ensure NVIDIA NIM is included in the active provider registry
os.environ.setdefault("NVIDIA_API_KEY", "test")
os.environ.setdefault("NVIDIA_API_BASE_URL", "https://integrate.api.nvidia.com/v1")
