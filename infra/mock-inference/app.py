#!/usr/bin/env python3
"""Deterministic OpenAI-compatible inference STUB for the VeldrixAI dev env.

Phase 5 locked decision #3: dev defaults to deterministic stubbed inference so
the env boots free and verify-dev.sh is reliable. The real-key seam is built
(VELDRIX_INFERENCE_MODE=live + real provider URLs) but defaults to stub.

This is INFRASTRUCTURE, not application logic — it stands in for NVIDIA NIM / Groq
at the network boundary (core's inference router POSTs {base}/chat/completions and
reads choices[0].message.content). It returns ONE JSON object that is a superset of
every pillar's expected keys, with clean/low-risk values, so all five trust pillars
parse a valid "safe" result deterministically. No real model, no cost, no network.

Zero third-party deps (stdlib http.server) so the image builds fast and offline.
"""
from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 9009

# Superset of the keys the five pillars read (see ai_safety_pillars.py). Each
# pillar uses .get(key, default); a superset means every pillar finds its own
# fields. Values are deterministic + low-risk so dev evaluations render green.
STUB_ASSESSMENT = {
    # generic
    "score": 0.96,
    "risk": 0.04,
    "label": "safe",
    "confidence": 0.95,
    "flags": [],
    "reasoning": "Deterministic dev inference stub (VELDRIX_INFERENCE_MODE=stub).",
    # hallucination pillar
    "hallucination_risk": 0.04,
    "uncertain_claims": [],
    "grounded": True,
    # bias pillar
    "bias_score": 0.04,
    "bias_types": [],
    "ethical_flags": [],
    "severity": "none",
    # policy / prompt-security pillar
    "policy_violation": False,
    "violations": [],
    "injection_detected": False,
    # legal / compliance pillar
    "legal_risk": 0.04,
    "legal_flags": [],
    "pii_detected": False,
}


def _completion(model: str) -> dict:
    content = json.dumps(STUB_ASSESSMENT, sort_keys=True, separators=(",", ":"))
    return {
        "id": "chatcmpl-stub-deterministic",
        "object": "chat.completion",
        "model": model or "veldrix-dev-stub",
        "choices": [
            {
                "index": 0,
                "finish_reason": "stop",
                "message": {"role": "assistant", "content": content},
            }
        ],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  # noqa: N802
        if self.path.rstrip("/") in ("/health", "/v1/health", ""):
            self._send(200, {"status": "ok", "mode": "stub"})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):  # noqa: N802
        # Accept any OpenAI-style path: /v1/chat/completions or /chat/completions.
        if not self.path.endswith("/chat/completions"):
            self._send(404, {"error": "not found"})
            return
        length = int(self.headers.get("Content-Length", 0) or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            req = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            req = {}
        self._send(200, _completion(req.get("model", "")))

    def log_message(self, *_args):  # silence default access logging
        return


if __name__ == "__main__":
    print(f"[mock-inference] deterministic stub listening on :{PORT}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
