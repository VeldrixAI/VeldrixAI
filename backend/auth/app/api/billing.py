"""
VeldrixAI — Stripe Billing Router

Endpoints:
  POST /billing/create-checkout-session   — Start Stripe Hosted Checkout
  POST /billing/create-portal-session     — Open Stripe Customer Portal
  POST /billing/webhook                   — Handle Stripe webhook events
  GET  /billing/status                    — Current user's plan & usage
"""

import logging
from datetime import datetime, timezone

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.vault import encrypt, decrypt, hmac_stripe_customer_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["billing"])

# ── Price ID map ───────────────────────────────────────────────────────────────

_PRICE_MAP: dict[str, str] = {}


def _price_map() -> dict[str, str]:
    """Build lazily so settings are loaded first."""
    if not _PRICE_MAP:
        _PRICE_MAP.update(
            {
                "grow_monthly": settings.STRIPE_PRICE_GROW_MONTHLY,
                "grow_annual": settings.STRIPE_PRICE_GROW_ANNUAL,
                "scale_monthly": settings.STRIPE_PRICE_SCALE_MONTHLY,
                "scale_annual": settings.STRIPE_PRICE_SCALE_ANNUAL,
            }
        )
    return _PRICE_MAP


# ── Schemas ────────────────────────────────────────────────────────────────────


class CheckoutRequest(BaseModel):
    plan: str  # "grow" | "scale"
    cycle: str  # "monthly" | "annual"


class CheckoutResponse(BaseModel):
    checkout_url: str


class PortalResponse(BaseModel):
    portal_url: str


class BillingStatus(BaseModel):
    plan_tier: str
    plan_status: str
    eval_count_month: int
    billing_period_end: str | None
    stripe_customer_id: str | None


# ── Helpers ────────────────────────────────────────────────────────────────────


def _get_stripe():
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Billing is not configured on this server.",
        )
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


def _get_or_create_customer(stripe_module, user: User, db: Session) -> str:
    if user.stripe_customer_id:
        return decrypt(user.stripe_customer_id)

    customer = stripe_module.Customer.create(
        email=user.email,
        metadata={"user_id": str(user.id)},
    )
    user.stripe_customer_id = encrypt(customer.id)
    user.stripe_customer_id_lookup = hmac_stripe_customer_id(customer.id)
    db.commit()
    return customer.id


# ── Routes ─────────────────────────────────────────────────────────────────────


@router.get("/status", response_model=BillingStatus)
def get_billing_status(
    current_user: User = Depends(get_current_user),
):
    return BillingStatus(
        plan_tier=current_user.plan_tier,
        plan_status=current_user.plan_status,
        eval_count_month=current_user.eval_count_month,
        billing_period_end=(
            current_user.billing_period_end.isoformat()
            if current_user.billing_period_end
            else None
        ),
        stripe_customer_id=decrypt(current_user.stripe_customer_id) if current_user.stripe_customer_id else None,
    )


@router.post("/create-checkout-session", response_model=CheckoutResponse)
def create_checkout_session(
    body: CheckoutRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    st = _get_stripe()
    price_key = f"{body.plan}_{body.cycle}"
    price_id = _price_map().get(price_key)

    if not price_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown plan/cycle combination: {price_key}",
        )

    customer_id = _get_or_create_customer(st, current_user, db)

    session = st.checkout.Session.create(
        customer=customer_id,
        payment_method_types=["card"],
        line_items=[{"price": price_id, "quantity": 1}],
        mode="subscription",
        success_url=f"{settings.VELDRIX_UI_URL}/dashboard/billing?success=1",
        cancel_url=f"{settings.VELDRIX_UI_URL}/dashboard/billing?cancelled=1",
        metadata={"user_id": str(current_user.id)},
        subscription_data={
            "metadata": {"user_id": str(current_user.id), "plan": body.plan}
        },
    )

    return CheckoutResponse(checkout_url=session.url)


@router.post("/create-portal-session", response_model=PortalResponse)
def create_portal_session(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    st = _get_stripe()

    if not current_user.stripe_customer_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No billing account found. Subscribe to a plan first.",
        )

    session = st.billing_portal.Session.create(
        customer=decrypt(current_user.stripe_customer_id),
        return_url=f"{settings.VELDRIX_UI_URL}/dashboard/billing",
    )

    return PortalResponse(portal_url=session.url)


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="stripe-signature"),
    db: Session = Depends(get_db),
):
    st = _get_stripe()

    if not settings.STRIPE_WEBHOOK_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Webhook secret not configured.",
        )

    payload = await request.body()
    try:
        event = st.Webhook.construct_event(
            payload, stripe_signature, settings.STRIPE_WEBHOOK_SECRET
        )
    except st.error.SignatureVerificationError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook signature"
        )

    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "checkout.session.completed":
        _handle_checkout_completed(data, db)
    elif event_type in (
        "customer.subscription.updated",
        "customer.subscription.created",
    ):
        _handle_subscription_updated(data, db)
    elif event_type == "customer.subscription.deleted":
        _handle_subscription_deleted(data, db)
    elif event_type == "invoice.payment_failed":
        _handle_payment_failed(data, db)
    else:
        logger.debug("[Billing] Unhandled webhook event: %s", event_type)

    return {"received": True}


# ── Webhook handlers ───────────────────────────────────────────────────────────


def _find_user_by_customer(customer_id: str, db: Session) -> User | None:
    # O(log n) lookup via the HMAC-SHA256 deterministic index column.
    # The encrypted stripe_customer_id column remains the cryptographic source of truth;
    # this column powers equality lookup only.
    lookup_hash = hmac_stripe_customer_id(customer_id)
    return (
        db.query(User)
        .filter(User.stripe_customer_id_lookup == lookup_hash)
        .first()
    )


def _handle_checkout_completed(session: dict, db: Session) -> None:
    customer_id = session.get("customer")
    subscription_id = session.get("subscription")
    user_id = session.get("metadata", {}).get("user_id")
    plan = session.get("metadata", {}).get("plan", "grow")

    user = None
    if user_id:
        from uuid import UUID
        user = db.query(User).filter(User.id == UUID(user_id)).first()
    if user is None and customer_id:
        user = _find_user_by_customer(customer_id, db)

    if user is None:
        logger.warning("[Billing] checkout.session.completed: user not found (customer=%s)", customer_id)
        return

    user.stripe_customer_id = encrypt(customer_id) if customer_id else None
    user.stripe_customer_id_lookup = hmac_stripe_customer_id(customer_id) if customer_id else None
    user.subscription_id = encrypt(subscription_id) if subscription_id else None
    user.plan_tier = plan
    user.plan_status = "active"
    db.commit()
    logger.info("[Billing] Checkout completed: user=%s plan=%s", user.email, plan)


def _handle_subscription_updated(subscription: dict, db: Session) -> None:
    customer_id = subscription.get("customer")
    user = _find_user_by_customer(customer_id, db)
    if user is None:
        logger.warning("[Billing] subscription.updated: user not found (customer=%s)", customer_id)
        return

    plan = subscription.get("metadata", {}).get("plan", user.plan_tier)
    period_end_ts = subscription.get("current_period_end")

    user.subscription_id = encrypt(subscription["id"])
    user.plan_tier = plan
    user.plan_status = subscription.get("status", "active")
    if period_end_ts:
        user.billing_period_end = datetime.fromtimestamp(period_end_ts, tz=timezone.utc).replace(tzinfo=None)
    db.commit()
    logger.info("[Billing] Subscription updated: user=%s status=%s", user.email, user.plan_status)


def _handle_subscription_deleted(subscription: dict, db: Session) -> None:
    customer_id = subscription.get("customer")
    user = _find_user_by_customer(customer_id, db)
    if user is None:
        return

    user.plan_tier = "free"
    user.plan_status = "cancelled"
    user.subscription_id = None
    user.billing_period_end = None
    db.commit()
    logger.info("[Billing] Subscription cancelled: user=%s", user.email)


def _handle_payment_failed(invoice: dict, db: Session) -> None:
    customer_id = invoice.get("customer")
    user = _find_user_by_customer(customer_id, db)
    if user is None:
        return

    user.plan_status = "past_due"
    db.commit()
    logger.warning("[Billing] Payment failed: user=%s", user.email)
