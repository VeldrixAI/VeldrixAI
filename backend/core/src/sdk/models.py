"""
VeldrixAI SDK — Pydantic v2 schemas.
Scores are in 0.0–1.0 range (higher = safer/more trusted).
These are distinct from the internal 0–100 domain types.
"""
from __future__ import annotations

import time
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class PillarStatus(str, Enum):
    OK    = "ok"
    ERROR = "error"
    SKIP  = "skip"


class PillarResult(BaseModel):
    pillar:      str
    status:      PillarStatus
    score:       Optional[float] = None   # 0.0 (worst) → 1.0 (best)
    confidence:  Optional[float] = None
    flags:       list[str]       = Field(default_factory=list)
    raw_labels:  dict            = Field(default_factory=dict)
    error:       Optional[str]   = None
    latency_ms:  Optional[int]   = None


class TrustScore(BaseModel):
    overall:        float                 # weighted aggregate, 0.0–1.0
    verdict:        str                   # ALLOW | WARN | REVIEW | BLOCK
    critical_flags: list[str]
    all_flags:      list[str]
    pillar_scores:  dict[str, float]


class AnalysisRequest(BaseModel):
    prompt:    str
    response:  str
    context:   Optional[str] = None
    metadata:  dict          = Field(default_factory=dict)
    policy_id: Optional[str] = None


class AnalysisResult(BaseModel):
    request_id:       str
    trust_score:      TrustScore
    pillars:          dict[str, PillarResult]
    total_latency_ms: int
    sdk_version:      str
    timestamp:        float = Field(default_factory=time.time)


class SDKError(Exception):
    """Base exception for all VeldrixAI SDK errors."""

    def __init__(self, message: str, pillar: str | None = None, retryable: bool = False):
        super().__init__(message)
        self.pillar    = pillar
        self.retryable = retryable
