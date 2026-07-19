"""
pytest session configuration for the VeldrixAI pillar test suite.

Sets NVIDIA_API_KEY=test so the inference provider registry includes
nvidia_nim in the active provider list during tests.  All actual HTTP calls
are intercepted by mocking route_inference in individual test modules.
"""

import os
import pytest

# Ensure NVIDIA NIM is included in the active provider registry
os.environ.setdefault("NVIDIA_API_KEY", "test")
os.environ.setdefault("NVIDIA_API_BASE_URL", "https://integrate.api.nvidia.com/v1")


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "integration: tests that require external services (Redis, DB, network)"
    )


@pytest.fixture(autouse=True)
def _reset_shadow_flag_store():
    """Hermetic shadow runtime-flag state (Phase-6 hot-detach).

    Drops the flag cache/client around every test so no test observes another's
    attach posture. In the reset (cold) state, with no event loop running, the
    env defaults rule — exactly the pre-closeout gating the older tests assert.
    """
    from src.policy import shadow_flags
    shadow_flags.reset_for_tests()
    yield
    shadow_flags.reset_for_tests()
