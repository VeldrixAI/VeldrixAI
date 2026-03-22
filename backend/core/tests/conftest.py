"""
pytest session configuration for the AegisAI NIM test suite.

Sets NVIDIA_API_KEY=test before any module imports so that
NIMClientRegistry does not raise RuntimeError during test collection.
All actual HTTP calls are intercepted by respx in individual test modules.
"""

import os

# Must be set before importing any pillar modules.
os.environ.setdefault("NVIDIA_API_KEY", "test")
os.environ.setdefault("NVIDIA_API_BASE_URL", "https://integrate.api.nvidia.com/v1")
