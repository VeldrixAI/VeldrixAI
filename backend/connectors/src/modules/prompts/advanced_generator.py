"""
Advanced Prompt Generator — Multi-model, high-end prompt engineering service.

Supports Groq (Llama 3.3 70B, Mixtral) and NVIDIA NIM for blazing fast,
high-quality system prompt generation with enterprise-grade governance.
"""

import os
import httpx
import time
from typing import Optional, Dict, List, Any
from pydantic import BaseModel
from enum import Enum


class ModelProvider(str, Enum):
    GROQ_LLAMA_70B = "groq-llama-70b"
    GROQ_MIXTRAL = "groq-mixtral"
    GROQ_LLAMA_8B = "groq-llama-8b"
    NIM_LLAMA_70B = "nim-llama-70b"
    NIM_LLAMA_8B = "nim-llama-8b"


class AdvancedGenerateRequest(BaseModel):
    keywords: Optional[str] = None
    policy_text: Optional[str] = None
    industry: str = "SaaS Support"
    region: str = "US"
    strictness: int = 3
    add_disclaimers: bool = False
    allow_rewrite: bool = True
    escalate_to_human: bool = False
    model: ModelProvider = ModelProvider.GROQ_LLAMA_70B
    creativity: float = 0.3
    max_tokens: int = 2048
    output_format: str = "detailed"


class PromptVariant(BaseModel):
    name: str
    prompt: str
    tokens_used: int
    generation_time_ms: int


class AdvancedGenerateResponse(BaseModel):
    model_used: str
    provider: str
    variants: Dict[str, PromptVariant]
    metadata: Dict[str, Any]


# ── Model Configurations ───────────────────────────────────────────────────────

GROQ_MODELS = {
    ModelProvider.GROQ_LLAMA_70B: {
        "id": "llama-3.3-70b-versatile",
        "name": "Llama 3.3 70B Versatile",
        "max_tokens": 8192,
        "speed": "ultra-fast",
    },
    ModelProvider.GROQ_MIXTRAL: {
        "id": "moonshotai/kimi-k2-instruct",
        "name": "Kimi K2 Instruct",
        "max_tokens": 32768,
        "speed": "fast",
    },
    ModelProvider.GROQ_LLAMA_8B: {
        "id": "llama-3.1-8b-instant",
        "name": "Llama 3.1 8B Instant",
        "max_tokens": 8192,
        "speed": "instant",
    },
}

NIM_MODELS = {
    ModelProvider.NIM_LLAMA_70B: {
        "id": "meta/llama-3.1-70b-instruct",
        "name": "Llama 3.1 70B Instruct",
        "max_tokens": 4096,
        "speed": "standard",
    },
    ModelProvider.NIM_LLAMA_8B: {
        "id": "meta/llama-3.1-8b-instruct",
        "name": "Llama 3.1 8B Instruct",
        "max_tokens": 4096,
        "speed": "fast",
    },
}

# ── Environment Configuration ──────────────────────────────────────────────────

_GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
_GROQ_BASE_URL = "https://api.groq.com/openai/v1"

_NIM_API_KEY = os.getenv("NVIDIA_API_KEY", "")
_NIM_BASE_URL = os.getenv("NVIDIA_API_BASE_URL", "https://integrate.api.nvidia.com/v1")

_TIMEOUT = 30.0


# ── Industry & Compliance Context ───────────────────────────────────────────────

_REGION_COMPLIANCE = {
    "US": {
        "regulations": "CCPA, COPPA, HIPAA (healthcare), SOC 2, FedRAMP (government)",
        "data_residency": "US-based data centers preferred",
        "key_requirements": ["Right to deletion", "Data breach notification", "Opt-out of sale"],
    },
    "EU": {
        "regulations": "GDPR, EU AI Act, Digital Services Act, NIS2 Directive",
        "data_residency": "EU data sovereignty required",
        "key_requirements": ["Right to explanation", "Data minimization", "DPIA for high-risk AI", "Human oversight"],
    },
    "CA": {
        "regulations": "PIPEDA, Quebec Law 25, CPPA (upcoming)",
        "data_residency": "Canada data residency recommended",
        "key_requirements": ["Consent requirements", "Breach reporting", "Accountability principles"],
    },
    "Global": {
        "regulations": "ISO 27001, ISO 42001 (AI), SOC 2 Type II, GDPR baseline",
        "data_residency": "Region-specific compliance",
        "key_requirements": ["Multi-jurisdictional compliance", "Data transfer mechanisms", "Local law adherence"],
    },
}

_INDUSTRY_CONTEXT = {
    "SaaS Support": {
        "description": "Customer support automation, ticket triage, knowledge base",
        "risks": ["PII exposure", "Account takeover attempts", "Service impersonation"],
        "guardrails": ["Never reveal internal systems", "Verify identity before account actions", "Escalate billing disputes"],
        "tone": "Professional, empathetic, solution-oriented",
    },
    "Marketplace": {
        "description": "Product listings, buyer-seller communication, transaction safety",
        "risks": ["Fraud attempts", "Counterfeit goods", "Review manipulation"],
        "guardrails": ["Detect listing fraud patterns", "Moderate pricing anomalies", "Protect payment info"],
        "tone": "Trustworthy, transparent, marketplace-neutral",
    },
    "FinTech": {
        "description": "Financial guidance, transaction processing, risk assessment",
        "risks": ["Financial advice liability", "Fraud facilitation", "Regulatory violations"],
        "guardrails": ["Never provide investment advice", "Flag suspicious transactions", "Compliance-first responses"],
        "tone": "Formal, precise, disclaimer-heavy",
    },
    "Healthcare-lite": {
        "description": "Wellness information, appointment scheduling, health Q&A",
        "risks": ["Medical misinformation", "HIPAA violations", "Diagnosis attempts"],
        "guardrails": ["Never diagnose or prescribe", "Escalate medical emergencies", "Privacy-first data handling"],
        "tone": "Caring, informative, non-diagnostic",
    },
    "Education": {
        "description": "Tutoring, content creation, assessment, academic integrity",
        "risks": ["Academic dishonesty", "Inappropriate content", "Bias in evaluation"],
        "guardrails": ["Promote learning over answers", "Detect plagiarism patterns", "Age-appropriate content"],
        "tone": "Encouraging, pedagogical, Socratic",
    },
    "Legal": {
        "description": "Legal research, document analysis, contract review",
        "risks": ["Unauthorized practice of law", "Confidentiality breaches", "Jurisdiction errors"],
        "guardrails": ["Clarify not legal advice", "Cite sources", "Flag jurisdiction issues"],
        "tone": "Formal, precise, well-cited",
    },
    "E-commerce": {
        "description": "Product recommendations, inventory, customer journey",
        "risks": ["Manipulative persuasion", "Price discrimination", "Data harvesting"],
        "guardrails": ["Transparent recommendations", "Fair pricing practices", "Minimal data collection"],
        "tone": "Helpful, honest, conversion-conscious",
    },
}

_ENFORCEMENT_STYLES = {
    "Strict": {
        "mode": "Maximum enforcement — block all policy violations immediately",
        "response_strategy": "Refuse + explain why + offer safe alternative",
        "escalation": "Only for edge cases after explicit block",
        "documentation": "Log all refusals with reason codes",
    },
    "Balanced": {
        "mode": "Moderate enforcement — rewrite minor violations, block critical ones",
        "response_strategy": "Rewrite + acknowledge + proceed safely",
        "escalation": "For ambiguous or high-stakes requests",
        "documentation": "Log rewrites and blocks",
    },
    "Adaptive": {
        "mode": "Light enforcement — allow with monitoring, block only critical safety issues",
        "response_strategy": "Allow + monitor + intervene if needed",
        "escalation": "Real-time monitoring with human-in-loop",
        "documentation": "Full conversation logging for audit",
    },
}


# ── Prompt Engineering Templates ────────────────────────────────────────────────

def _build_system_prompt(req: AdvancedGenerateRequest, variant: str) -> str:
    output_instruction = {
        "detailed": "Write a comprehensive, detailed system prompt (400-600 words) with explicit rules and examples.",
        "concise": "Write a concise, punchy system prompt (200-300 words) focused on essential rules.",
        "structured": "Write a structured system prompt using clear sections, numbered rules, and decision trees (500-700 words).",
    }[req.output_format]
    
    return f"""You are an elite AI Prompt Engineer specializing in enterprise-grade system prompts for regulated industries. You write prompts that are:

1. **Enforceable** — Clear rules that can be programmatically validated
2. **Compliant** — Embedding regulatory requirements directly
3. **Robust** — Handling edge cases and adversarial inputs
4. **Auditable** — Traceable decision-making logic

OUTPUT REQUIREMENTS:
{output_instruction}
Output ONLY the system prompt text — no markdown fences, no preamble, no explanations.

QUALITY STANDARDS:
- Every rule must be actionable and testable
- Include specific examples of allowed vs prohibited responses
- Define clear escalation triggers
- Specify exact phrasing for disclaimers if required
- Use second person ("You are...", "You must...")"""


def _build_user_prompt(req: AdvancedGenerateRequest, variant: str) -> str:
    industry_ctx = _INDUSTRY_CONTEXT.get(req.industry, {})
    region_ctx = _REGION_COMPLIANCE.get(req.region, {})
    enforcement = _ENFORCEMENT_STYLES[variant]
    
    policy_section = ""
    if req.policy_text and req.policy_text.strip():
        policy_preview = req.policy_text[:4000]
        policy_section = f"""
COMPANY POLICY DOCUMENT (EXTRACTED):
{policy_preview}

CRITICAL: Extract the 5 most important rules from this policy and embed them verbatim in the system prompt.
"""
    
    keywords_section = ""
    if req.keywords and req.keywords.strip():
        keywords_section = f"""
TOPIC BOUNDARIES / KEYWORDS:
{req.keywords}

INSTRUCTION: Define explicit rules for staying within these topic boundaries. Reject requests outside scope.
"""
    
    return f"""Generate a {variant.upper()} variant system prompt with these specifications:

DEPLOYMENT CONTEXT:
Industry: {req.industry}
Description: {industry_ctx.get('description', 'General purpose')}
Key Risks: {', '.join(industry_ctx.get('risks', []))}
Required Guardrails: {', '.join(industry_ctx.get('guardrails', []))}
Tone: {industry_ctx.get('tone', 'Professional')}

Region: {req.region}
Applicable Regulations: {region_ctx.get('regulations', 'Standard compliance')}
Key Requirements: {', '.join(region_ctx.get('key_requirements', []))}

ENFORCEMENT CONFIGURATION:
Strictness Level: {req.strictness}/5
Enforcement Mode: {enforcement['mode']}
Response Strategy: {enforcement['response_strategy']}
Escalation Policy: {enforcement['escalation']}
Documentation: {enforcement['documentation']}

Options:
- Add Disclaimers: {'YES' if req.add_disclaimers else 'NO'}
- Allow Rewrite: {'YES' if req.allow_rewrite else 'NO'}
- Escalate to Human: {'YES' if req.escalate_to_human else 'NO'}
{policy_section}{keywords_section}
STRUCTURE YOUR OUTPUT AS FOLLOWS:

## 1. ROLE DEFINITION
## 2. CORE BEHAVIORAL RULES (numbered)
## 3. CONTENT BOUNDARIES (allow/block with examples)
## 4. COMPLIANCE REQUIREMENTS
## 5. ESCALATION TRIGGERS
## 6. RESPONSE GUIDELINES
## 7. ENFORCEMENT SUMMARY

Begin the system prompt now:"""


# ── API Call Functions ──────────────────────────────────────────────────────────

async def _call_groq(model_id: str, system: str, user: str, temperature: float, max_tokens: int) -> tuple:
    if not _GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY not configured")

    headers = {"Authorization": f"Bearer {_GROQ_API_KEY}", "Content-Type": "application/json"}
    # Groq returns 400 when both temperature and top_p are set — use only temperature.
    payload = {
        "model": model_id,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    start = time.time()
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(f"{_GROQ_BASE_URL}/chat/completions", json=payload, headers=headers)
        if resp.status_code >= 400:
            body = resp.text[:500]
            raise ValueError(f"Groq API {resp.status_code}: {body}")
        data = resp.json()

    latency_ms = int((time.time() - start) * 1000)
    return data["choices"][0]["message"]["content"].strip(), data.get("usage", {}).get("total_tokens", 0), latency_ms


async def _call_nim(model_id: str, system: str, user: str, temperature: float, max_tokens: int) -> tuple:
    if not _NIM_API_KEY:
        raise ValueError("NVIDIA_API_KEY not configured")

    headers = {"Authorization": f"Bearer {_NIM_API_KEY}", "Content-Type": "application/json"}
    # Do not send top_p alongside temperature — causes 400 on both Groq and NIM.
    payload = {
        "model": model_id,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    start = time.time()
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(f"{_NIM_BASE_URL}/chat/completions", json=payload, headers=headers)
        if resp.status_code >= 400:
            body = resp.text[:500]
            raise ValueError(f"NIM API {resp.status_code}: {body}")
        data = resp.json()

    latency_ms = int((time.time() - start) * 1000)
    return data["choices"][0]["message"]["content"].strip(), data.get("usage", {}).get("total_tokens", 0), latency_ms


async def generate_advanced_prompt(req: AdvancedGenerateRequest) -> AdvancedGenerateResponse:
    if req.model in GROQ_MODELS:
        model_config = GROQ_MODELS[req.model]
        provider = "groq"
        call_fn = _call_groq
    elif req.model in NIM_MODELS:
        model_config = NIM_MODELS[req.model]
        provider = "nvidia_nim"
        call_fn = _call_nim
    else:
        raise ValueError(f"Unknown model provider: {req.model}")
    
    model_id = model_config["id"]
    variants: Dict[str, PromptVariant] = {}
    
    for variant_name in ["Strict", "Balanced", "Adaptive"]:
        system_prompt = _build_system_prompt(req, variant_name)
        user_prompt = _build_user_prompt(req, variant_name)
        
        try:
            content, tokens, latency = await call_fn(model_id, system_prompt, user_prompt, req.creativity, req.max_tokens)
            variants[variant_name] = PromptVariant(name=variant_name, prompt=content, tokens_used=tokens, generation_time_ms=latency)
        except Exception as e:
            variants[variant_name] = PromptVariant(name=variant_name, prompt=f"[Generation failed: {str(e)}]", tokens_used=0, generation_time_ms=0)
    
    return AdvancedGenerateResponse(
        model_used=model_config["name"],
        provider=provider,
        variants=variants,
        metadata={"industry": req.industry, "region": req.region, "strictness": req.strictness, "output_format": req.output_format, "creativity": req.creativity},
    )


def get_available_models() -> List[Dict[str, Any]]:
    models = []
    if _GROQ_API_KEY:
        for provider_id, config in GROQ_MODELS.items():
            models.append({"id": provider_id.value, "name": config["name"], "provider": "Groq", "speed": config["speed"], "max_tokens": config["max_tokens"], "available": True})
    if _NIM_API_KEY:
        for provider_id, config in NIM_MODELS.items():
            models.append({"id": provider_id.value, "name": config["name"], "provider": "NVIDIA NIM", "speed": config["speed"], "max_tokens": config["max_tokens"], "available": True})
    return models
