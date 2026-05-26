#!/usr/bin/env python3
"""Run from project root: python test_resend.py"""
import os, sys
from pathlib import Path

# Load backend/.env
from dotenv import load_dotenv
env_path = Path(__file__).parent / "backend" / ".env"
load_dotenv(env_path)
print(f"[1] .env path:         {env_path}")
print(f"[1] .env exists:       {env_path.exists()}")

key = os.getenv("RESEND_API_KEY", "")
print(f"[2] RESEND_API_KEY:    {'SET (' + key[:12] + '...)' if key else 'EMPTY — this is the bug'}")

if not key:
    print("\nFAIL: Key not loaded. Check backend/.env has RESEND_API_KEY=re_...")
    sys.exit(1)

print(f"[3] EMAIL_FROM:        {os.getenv('EMAIL_FROM', 'noreply@veldrixai.ca')}")

try:
    import resend
    print(f"[4] resend version:    {resend.__version__}")
except Exception as e:
    print(f"[4] resend import FAILED: {e}")
    sys.exit(1)

resend.api_key = key
print("[5] Sending test email via Resend...")
try:
    result = resend.Emails.send({
        "from":    "VeldrixAI <noreply@veldrixai.ca>",
        "to":      ["rudramanidhiman@gmail.com"],
        "subject": "VeldrixAI Email Test",
        "html":    "<p>Test email from VeldrixAI. Email is working!</p>",
    })
    print(f"[5] SUCCESS — email id: {getattr(result, 'id', result)}")
except Exception as e:
    print(f"[5] FAILED — {type(e).__name__}: {e}")
    sys.exit(1)
