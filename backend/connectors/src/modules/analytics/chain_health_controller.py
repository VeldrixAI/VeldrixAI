"""Internal chain-health verification endpoints (Part B / B.2).

Triggers a Part A hash-chain verification pass and updates the per-tenant Prometheus
gauges in :mod:`chain_metrics`, which the Grafana chain-health panel renders. These
are internal (service/ops/cron) endpoints — verification is DB work and is therefore
driven on a schedule rather than on every ``/metrics`` scrape.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from src.db.base import get_db
from src.core.middleware.internal_auth import require_internal_token
from src.modules.analytics import chain_metrics

router = APIRouter(prefix="/api/audit-trails/internal/chain-health", tags=["chain-health"])


@router.get("", include_in_schema=False)
def verify_one(
    tenant_id: str = Query(...),
    db: Session = Depends(get_db),
    _: None = Depends(require_internal_token),
):
    """Verify a single tenant's chain and refresh its gauges."""
    return chain_metrics.verify_tenant(db, tenant_id)


@router.post("/refresh", include_in_schema=False)
def refresh_all(
    db: Session = Depends(get_db),
    _: None = Depends(require_internal_token),
):
    """Verify every tenant's chain and refresh all gauges (ops/cron entry point)."""
    return chain_metrics.verify_all(db)
