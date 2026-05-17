"""
VeldrixAI — Stripe Billing Router

Endpoints (Hosted Checkout flow — existing):
  POST /billing/create-checkout-session   — Start Stripe Hosted Checkout
  POST /billing/create-portal-session     — Open Stripe Customer Portal
  POST /billing/webhook                   — Handle Stripe webhook events
  GET  /billing/status                    — Current user's plan & usage

Endpoints (Elements + OTP flow — new):
  POST /billing/create-payment-intent     — Create Stripe PaymentIntent (Elements)
  POST /billing/issue-otp                 — Generate + encrypt OTP, send via email
  POST /billing/verify-otp               — Verify OTP, confirm payment, activate plan
"""

import logging
from datetime import datetime, timedelta, timezone

import stripe
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import get_current_user
from app.db.models import PaymentHistory, PaymentOTPVault, User
from app.db.session import get_db
from app.utils.otp_crypto import decrypt_otp, encrypt_otp, generate_otp
from app.vault import decrypt, encrypt

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


class CreatePaymentIntentRequest(BaseModel):
    plan: str   # "grow" | "scale"
    cycle: str  # "monthly" | "annual"


class IssueOTPRequest(BaseModel):
    payment_intent_id: str
    payment_method_id: str


class VerifyOTPRequest(BaseModel):
    payment_intent_id: str
    otp: str


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
    known_keys = set(_price_map().keys())
    if price_key not in known_keys:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid plan/cycle combination '{price_key}'. Valid options: {', '.join(sorted(known_keys))}",
        )
    price_id = _price_map()[price_key]
    if not price_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Billing is not yet configured on this server. Please contact support.",
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
    # Temporary O(n) fallback — run add_stripe_customer_lookup_hash.sql migration to restore O(log n)
    for user in db.query(User).filter(User.stripe_customer_id.isnot(None)).all():
        try:
            if decrypt(user.stripe_customer_id) == customer_id:
                return user
        except Exception:
            continue
    return None


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


# ── Elements + OTP flow ────────────────────────────────────────────────────────

@router.post("/create-payment-intent")
def create_payment_intent(
    body: CreatePaymentIntentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a Stripe PaymentIntent for Stripe Elements checkout.
    Returns client_secret, payment_intent_id, and publishable_key.
    Idempotent: reuses an existing uncompleted intent for the same user+plan.
    """
    st = _get_stripe()
    price_key = f"{body.plan}_{body.cycle}"
    known_keys = set(_price_map().keys())
    if price_key not in known_keys:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid plan/cycle combination '{price_key}'. Valid options: {', '.join(sorted(known_keys))}",
        )
    price_id = _price_map()[price_key]
    if not price_id:
        raise HTTPException(
            status_code=503,
            detail="Billing is not yet configured on this server. Please contact support.",
        )

    # Resolve amount from Stripe (source of truth)
    try:
        price_obj = st.Price.retrieve(price_id)
        amount = price_obj.unit_amount
    except st.error.StripeError as exc:
        raise HTTPException(status_code=400, detail=f"Failed to retrieve price: {exc}")

    customer_id = _get_or_create_customer(st, current_user, db)

    # Idempotency: try reusing an existing intent for this user+plan
    if current_user.subscription_id:
        # subscription_id column is repurposed as pending-intent storage here
        # only if the value starts with "pi_" (PaymentIntent prefix)
        stored = current_user.subscription_id
        try:
            stored_plain = decrypt(stored)
        except Exception:
            stored_plain = ""
        if stored_plain.startswith("pi_"):
            try:
                existing = st.PaymentIntent.retrieve(stored_plain)
                reusable = ("requires_payment_method", "requires_confirmation", "requires_action")
                if existing.status in reusable and existing.metadata.get("plan") == body.plan:
                    return {
                        "client_secret": existing.client_secret,
                        "payment_intent_id": existing.id,
                        "publishable_key": settings.STRIPE_PUBLISHABLE_KEY,
                        "plan": {"name": body.plan, "cycle": body.cycle, "amount": amount},
                    }
            except Exception:
                pass  # fall through to create new intent

    intent = st.PaymentIntent.create(
        amount=amount,
        currency="usd",
        customer=customer_id,
        automatic_payment_methods={"enabled": True, "allow_redirects": "never"},
        metadata={"user_id": str(current_user.id), "plan": body.plan, "cycle": body.cycle},
        receipt_email=current_user.email,
        description=f"VeldrixAI {body.plan.title()} ({body.cycle}) — Subscription",
        capture_method="manual",  # we confirm server-side after OTP
    )

    # Store PI id in subscription_id temporarily (encrypted) for idempotency
    current_user.subscription_id = encrypt(intent.id)
    db.commit()
    logger.info("[Billing] PaymentIntent %s created for user %s plan=%s", intent.id, current_user.email, body.plan)

    return {
        "client_secret": intent.client_secret,
        "payment_intent_id": intent.id,
        "publishable_key": settings.STRIPE_PUBLISHABLE_KEY,
        "plan": {"name": body.plan, "cycle": body.cycle, "amount": amount},
    }


@router.post("/issue-otp")
def issue_otp(
    body: IssueOTPRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    After the user fills Stripe Elements, create an OTP and send it by email.
    Stores the AES-256-GCM encrypted OTP in payment_otp_vault.
    """
    st = _get_stripe()

    # Verify PI belongs to this user
    try:
        intent = st.PaymentIntent.retrieve(body.payment_intent_id)
        if intent.metadata.get("user_id") != str(current_user.id):
            raise HTTPException(status_code=403, detail="Payment intent mismatch")
    except st.error.StripeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    otp = generate_otp(6)
    encrypted = encrypt_otp(otp)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    # Invalidate any previous OTP for this PI, then insert a fresh one
    db.query(PaymentOTPVault).filter(
        PaymentOTPVault.user_id == current_user.id,
        PaymentOTPVault.payment_intent_id == body.payment_intent_id,
    ).delete(synchronize_session=False)

    vault_record = PaymentOTPVault(
        user_id=current_user.id,
        payment_intent_id=body.payment_intent_id,
        payment_method_id=body.payment_method_id,
        encrypted_otp=encrypted,
        expires_at=expires_at,
    )
    db.add(vault_record)
    db.commit()

    # Send OTP email (best-effort — never blocks response)
    try:
        from app.utils.email import send_otp_email
        send_otp_email(to_email=current_user.email, otp=otp, expires_minutes=10)
    except Exception as exc:
        logger.warning("[Billing] OTP email failed for %s: %s", current_user.email, exc)

    logger.info("[Billing] OTP issued for user %s PI %s", current_user.email, body.payment_intent_id)
    masked = f"{current_user.email[:2]}***@{current_user.email.split('@')[1]}"

    return {
        "message": "Verification code sent to your registered email",
        "expires_in_seconds": 600,
        "masked_email": masked,
    }


@router.post("/verify-otp")
def verify_otp(
    body: VerifyOTPRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Verify OTP → confirm PaymentIntent server-side → activate subscription.
    Idempotent: ON CONFLICT DO NOTHING on PaymentHistory prevents duplicate records.
    """
    st = _get_stripe()
    now = datetime.now(timezone.utc)

    # Fetch latest unused vault record
    vault = (
        db.query(PaymentOTPVault)
        .filter(
            PaymentOTPVault.user_id == current_user.id,
            PaymentOTPVault.payment_intent_id == body.payment_intent_id,
            PaymentOTPVault.used_at.is_(None),
        )
        .order_by(PaymentOTPVault.created_at.desc())
        .first()
    )
    if vault is None:
        raise HTTPException(status_code=404, detail="No active verification code found for this payment")

    if now > vault.expires_at:
        raise HTTPException(status_code=410, detail="Verification code expired. Please restart checkout.")

    if vault.attempt_count >= vault.max_attempts:
        raise HTTPException(status_code=429, detail="Maximum attempts exceeded. Payment cancelled for security.")

    vault.attempt_count += 1
    db.commit()

    try:
        plaintext_otp = decrypt_otp(vault.encrypted_otp)
    except Exception:
        raise HTTPException(status_code=500, detail="Verification system error")

    remaining = vault.max_attempts - vault.attempt_count

    if plaintext_otp != body.otp.strip():
        if remaining <= 0:
            try:
                st.PaymentIntent.cancel(body.payment_intent_id)
            except Exception:
                pass
            raise HTTPException(
                status_code=429,
                detail="Maximum attempts exceeded. Payment cancelled. Please start over.",
            )
        raise HTTPException(
            status_code=422,
            detail=f"Invalid code. {remaining} attempt(s) remaining.",
        )

    # Mark OTP as used before touching Stripe (idempotency guard)
    vault.used_at = now
    db.commit()

    # Confirm PaymentIntent with the stored payment method
    try:
        intent = st.PaymentIntent.confirm(
            body.payment_intent_id,
            payment_method=vault.payment_method_id,
        )
    except st.error.StripeError as exc:
        raise HTTPException(status_code=402, detail=f"Payment failed: {exc}")

    if intent.status not in ("succeeded", "requires_capture", "processing"):
        raise HTTPException(status_code=402, detail=f"Payment not confirmed: {intent.status}")

    # Capture if manual capture
    if intent.status == "requires_capture":
        try:
            intent = st.PaymentIntent.capture(body.payment_intent_id)
        except st.error.StripeError as exc:
            raise HTTPException(status_code=402, detail=f"Capture failed: {exc}")

    # Activate subscription on User record
    plan = intent.metadata.get("plan", "grow")
    period_end = now + timedelta(days=30)
    current_user.plan_tier = plan
    current_user.plan_status = "active"
    current_user.billing_period_end = period_end.replace(tzinfo=None)
    db.commit()

    # Insert payment history (unique on PI id — safe to retry)
    existing_history = db.query(PaymentHistory).filter(
        PaymentHistory.stripe_payment_intent_id == body.payment_intent_id
    ).first()
    if not existing_history:
        db.add(PaymentHistory(
            user_id=current_user.id,
            stripe_payment_intent_id=body.payment_intent_id,
            amount=intent.amount,
            currency=intent.currency,
            status="succeeded",
            plan_name=plan,
            receipt_email=current_user.email,
        ))
        db.commit()

    # Send receipt email in background
    background_tasks.add_task(
        _send_receipt_background,
        to_email=current_user.email,
        to_name=current_user.email.split("@")[0],
        payment_intent_id=body.payment_intent_id,
        amount=intent.amount,
        plan_name=plan,
    )

    logger.info("[Billing] Payment verified, plan=%s activated for user=%s", plan, current_user.email)

    return {
        "status": "succeeded",
        "payment_intent_id": body.payment_intent_id,
        "transaction_id": f"VX-{body.payment_intent_id[-8:].upper()}",
        "amount": intent.amount,
        "currency": intent.currency,
        "plan": plan,
    }


def _send_receipt_background(
    to_email: str, to_name: str, payment_intent_id: str, amount: int, plan_name: str
) -> None:
    try:
        from app.utils.email import send_receipt_email
        send_receipt_email(
            to_email=to_email,
            to_name=to_name,
            payment_intent_id=payment_intent_id,
            amount=amount,
            plan_name=plan_name,
        )
    except Exception as exc:
        logger.warning("[Billing] Receipt email failed: %s", exc)
