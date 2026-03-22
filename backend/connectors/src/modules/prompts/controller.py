"""Saved prompts CRUD + AI generation controller."""

import os
import io
import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, Any, Dict
from uuid import UUID
from src.db.base import get_db
from src.core.middleware.auth import get_current_user
from src.modules.prompts.models import SavedPrompt

router = APIRouter(prefix="/api/prompts", tags=["prompts"])

# ── NIM config ────────────────────────────────────────────────────────────────
_NIM_BASE   = os.getenv("NVIDIA_API_BASE_URL", "https://integrate.api.nvidia.com/v1")
_NIM_KEY    = os.getenv("NVIDIA_API_KEY", "")
_NIM_MODEL  = "meta/llama-3.1-8b-instruct"
_NIM_TIMEOUT = int(os.getenv("VELDRIX_NIM_TIMEOUT_MS", "8000")) / 1000


# ── Schemas ───────────────────────────────────────────────────────────────────

class PromptCreate(BaseModel):
    name: str
    variant: str
    prompt_text: str
    config_json: Optional[Dict[str, Any]] = None
    industry: Optional[str] = None
    region: Optional[str] = None
    strictness: Optional[int] = 3
    keywords: Optional[str] = None


class PromptUpdate(BaseModel):
    name: Optional[str] = None
    prompt_text: Optional[str] = None
    config_json: Optional[Dict[str, Any]] = None
    strictness: Optional[int] = None


class GenerateRequest(BaseModel):
    keywords: Optional[str] = None
    policy_text: Optional[str] = None
    industry: str = "SaaS Support"
    region: str = "US"
    strictness: int = 3
    add_disclaimers: bool = False
    allow_rewrite: bool = True
    escalate_to_human: bool = False


# ── Helpers ───────────────────────────────────────────────────────────────────

def _serialize(p: SavedPrompt) -> dict:
    return {
        "id": str(p.id),
        "name": p.name,
        "variant": p.variant,
        "prompt_text": p.prompt_text,
        "config_json": p.config_json,
        "industry": p.industry,
        "region": p.region,
        "strictness": p.strictness,
        "keywords": p.keywords,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


def _nim_chat(system: str, user: str) -> str:
    """Call NIM chat completions and return the assistant message text."""
    headers = {
        "Authorization": f"Bearer {_NIM_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": _NIM_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
        "temperature": 0.3,
        "max_tokens": 1024,
    }
    resp = httpx.post(
        f"{_NIM_BASE}/chat/completions",
        json=payload,
        headers=headers,
        timeout=_NIM_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()


_REGION_COMPLIANCE = {
    "US":     "US federal and state regulations including CCPA, SOC 2, and HIPAA where applicable",
    "EU":     "GDPR, EU AI Act, and relevant member state regulations — ensure data minimisation and right to explanation",
    "CA":     "PIPEDA, Canadian AI governance frameworks, and provincial privacy legislation",
    "Global": "the strictest applicable regulations across all operating jurisdictions",
}

_INDUSTRY_CONTEXT = {
    "SaaS Support":    "customer support automation, ticket resolution, knowledge base queries, and user onboarding",
    "Marketplace":     "product listings, buyer-seller communication, transaction safety, and review moderation",
    "FinTech":         "financial advice, transaction processing, regulatory compliance, risk assessment, and fraud detection",
    "Healthcare-lite": "general wellness information, appointment scheduling, and non-diagnostic health guidance",
    "Education":       "tutoring, course content generation, student assessment, and academic integrity",
}


def _build_nim_prompt(req: GenerateRequest, variant: str) -> tuple[str, str]:
    """Return (system_msg, user_msg) for NIM to generate a system prompt."""
    policy_section = (
        f"\n\nCOMPANY POLICY CONTEXT (extracted from uploaded policy document):\n{req.policy_text[:3000]}"
        if req.policy_text and req.policy_text.strip()
        else ""
    )
    enforcement_map = {
        "Strict":   "maximum enforcement — block all violations, no exceptions",
        "Balanced": "moderate enforcement — rewrite minor violations, block critical ones",
        "Adaptive": "light enforcement — allow with monitoring, block only critical safety violations",
    }
    system = (
        "You are an expert AI governance engineer specialising in writing production-grade "
        "system prompts for enterprise AI deployments. You write clear, structured, enforceable "
        "system prompts that embed compliance rules, safety guardrails, and policy constraints. "
        "Output ONLY the system prompt text — no preamble, no explanation, no markdown fences."
    )
    keywords_line = f"Keywords / Topics: {req.keywords}" if req.keywords and req.keywords.strip() else "Keywords / Topics: (derived from policy document)"
    user = f"""Write a {variant.upper()} mode system prompt for an AI assistant with the following configuration:

Industry: {req.industry} — {_INDUSTRY_CONTEXT.get(req.industry, req.industry)}
Region / Compliance: {_REGION_COMPLIANCE.get(req.region, req.region)}
{keywords_line}
Strictness Level: {req.strictness}/5
Enforcement Mode: {enforcement_map[variant]}
Add Disclaimers: {"Yes — all responses must include appropriate liability disclaimers" if req.add_disclaimers else "No"}
Allow Rewrite on Violation: {"Yes" if req.allow_rewrite else "No"}
Escalate to Human: {"Yes — flag borderline cases for human review" if req.escalate_to_human else "No"}{policy_section}

Requirements:
- Open with a clear role definition and enforcement mode declaration
- Include numbered rules covering: content safety, PII handling, prompt injection defence, compliance obligations, and response scope
- Embed the keywords as explicit topic boundaries
- If policy context was provided, extract and embed the most critical policy rules directly into the prompt
- Close with an enforcement summary line
- Write in second person ("You are...", "You must...", "You will...")
- Be specific and actionable — avoid vague language like "be careful" or "try to"
- Length: 200–400 words"""
    return system, user


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/extract-policy")
async def extract_policy(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Extract plain text from an uploaded PDF policy document."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    try:
        import pypdf
    except ImportError:
        raise HTTPException(status_code=500, detail="pypdf not installed — run: pip install pypdf")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10 MB limit
        raise HTTPException(status_code=400, detail="PDF too large — maximum 10 MB")

    try:
        import re
        reader = pypdf.PdfReader(io.BytesIO(content))
        total_pages = len(reader.pages)
        # Cap at 50 pages for efficiency; strip redundant whitespace inline
        extracted = []
        for page in reader.pages[:50]:
            raw = page.extract_text() or ""
            cleaned = re.sub(r" {2,}", " ", re.sub(r"\n{3,}", "\n\n", raw)).strip()
            if cleaned:
                extracted.append(cleaned)
        text = "\n\n".join(extracted)
        if not text:
            raise HTTPException(status_code=422, detail="Could not extract text from PDF — it may be image-based")
        return {"text": text, "pages": total_pages, "chars": len(text)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF extraction failed: {str(e)}")


@router.post("/generate")
async def generate_prompts(
    body: GenerateRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Generate Strict / Balanced / Adaptive system prompts using NVIDIA NIM
    (meta/llama-3.1-8b-instruct). Keywords and optional policy text are
    embedded into the generation prompt.
    """
    if not _NIM_KEY:
        raise HTTPException(status_code=500, detail="NVIDIA_API_KEY not configured")
    if not (body.keywords and body.keywords.strip()) and not (body.policy_text and body.policy_text.strip()):
        raise HTTPException(status_code=400, detail="Provide keywords or upload a policy PDF")

    results = {}
    errors = {}
    for variant in ("Strict", "Balanced", "Adaptive"):
        try:
            system_msg, user_msg = _build_nim_prompt(body, variant)
            results[variant] = _nim_chat(system_msg, user_msg)
        except httpx.HTTPStatusError as e:
            errors[variant] = f"NIM API error {e.response.status_code}"
            results[variant] = None
        except Exception as e:
            errors[variant] = str(e)
            results[variant] = None

    if all(v is None for v in results.values()):
        raise HTTPException(status_code=502, detail=f"All NIM calls failed: {errors}")

    return {
        "model": _NIM_MODEL,
        "variants": results,
        "errors": errors if errors else None,
    }


@router.get("/")
async def list_prompts(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    uid = current_user["id"]
    prompts = db.query(SavedPrompt).filter(
        SavedPrompt.user_id == uid, SavedPrompt.is_deleted == False
    ).order_by(SavedPrompt.created_at.desc()).all()
    return [_serialize(p) for p in prompts]


@router.post("/", status_code=201)
async def create_prompt(
    body: PromptCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    uid = current_user["id"]
    p = SavedPrompt(user_id=uid, **body.dict())
    db.add(p)
    db.commit()
    db.refresh(p)
    return _serialize(p)


@router.patch("/{prompt_id}")
async def update_prompt(
    prompt_id: UUID,
    body: PromptUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    uid = current_user["id"]
    p = db.query(SavedPrompt).filter(
        SavedPrompt.id == prompt_id,
        SavedPrompt.user_id == uid,
        SavedPrompt.is_deleted == False,
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Prompt not found")
    for k, v in body.dict(exclude_none=True).items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return _serialize(p)


@router.delete("/{prompt_id}")
async def delete_prompt(
    prompt_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    uid = current_user["id"]
    p = db.query(SavedPrompt).filter(
        SavedPrompt.id == prompt_id,
        SavedPrompt.user_id == uid,
        SavedPrompt.is_deleted == False,
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Prompt not found")
    p.is_deleted = True
    db.commit()
    return {"success": True}
