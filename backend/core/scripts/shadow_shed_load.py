#!/usr/bin/env python3
"""Phase-6 closeout Fix 2 — LIVE shed-path proof for the dedicated shadow worker pool.

Drives real concurrent governed requests at the dev stack's ``POST /trust/evaluate``
fast enough that the out-of-band shadow workers hold more than
``ENGINE_SHADOW_POOL_MAX_CONNECTIONS`` (default **5**) writes in flight at once, then
verifies — from the service's own Prometheus metrics — the four things the closeout
demands be proven live, simultaneously:

  1. **Saturation**: ``veldrix_policy_shadow_worker_pool_inflight`` reaches the cap
     (sampled continuously during the run, since it is an instantaneous gauge).
  2. **Shed + counted**: ``veldrix_policy_shadow_outcome_total{outcome="write_failed"}``
     increments (the cap-5 pool sheds via httpx PoolTimeout after a 0.25 s acquire wait —
     RECON-CLOSE Finding 4; ``dropped_backpressure`` would indicate the 64-cap runtime
     gate, also reported).
  3. **Impact guard flat**: the ``veldrix_policy_shadow_dispatch_handoff_seconds``
     histogram delta over the run keeps p99 sub-millisecond — worker saturation never
     touches the request path.
  4. **No request delayed/failed**: every driven request returns 200; client-side
     latency is reported for the record.

Nothing here mocks anything: the pool, the shed, and the metrics are the live service's.
If the pool never saturates, or sheds aren't counted, the script FAILS — that is a
finding, not an inconvenience.

Usage (dev stack up, from repo root — stdlib + httpx only):

    python backend/core/scripts/shadow_shed_load.py \
        --base-url http://localhost:8001 \
        --requests 300 --concurrency 40 \
        --jwt-secret "$JWT_SECRET"            # or --token <jwt>

The driver attaches the engine at 100% via the runtime-flag control
(``POST /internal/shadow-flags`` — the Fix-1 hot mechanism; pass
``--internal-key`` if ``VELDRIX_INTERNAL_API_KEY`` is set on core) and restores the
previous flags on exit. Dev-only tooling: minting a JWT from ``--jwt-secret``
matches core's simple HS256 ``sub`` check (``src/middlewares/auth.py``).
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import hashlib
import hmac
import json
import re
import statistics
import sys
import time

import httpx

HANDOFF = "veldrix_policy_shadow_dispatch_handoff_seconds"
OUTCOME = "veldrix_policy_shadow_outcome_total"
INFLIGHT = "veldrix_policy_shadow_worker_pool_inflight"


# ── minimal HS256 JWT (dev-only; avoids a python-jose dependency) ───────────────────

def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def mint_jwt(secret: str, sub: str = "shed-load-driver", ttl_s: int = 3600) -> str:
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = _b64url(json.dumps({"sub": sub, "exp": int(time.time()) + ttl_s}).encode())
    signing_input = f"{header}.{payload}".encode()
    sig = _b64url(hmac.new(secret.encode(), signing_input, hashlib.sha256).digest())
    return f"{header}.{payload}.{sig}"


# ── Prometheus text-format helpers ───────────────────────────────────────────────────

def parse_metrics(text: str) -> dict:
    """{metric_name{labels} : float} for the metrics we care about."""
    out = {}
    for line in text.splitlines():
        if line.startswith(("veldrix_policy_shadow", "veldrix_policy_shed")):
            m = re.match(r"^(\S+?)(\{[^}]*\})?\s+([0-9.eE+-]+|NaN)$", line)
            if m and m.group(3) != "NaN":
                out[f"{m.group(1)}{m.group(2) or ''}"] = float(m.group(3))
    return out


def outcome_delta(before: dict, after: dict) -> dict:
    deltas = {}
    for key, val in after.items():
        if key.startswith(OUTCOME):
            label = re.search(r'outcome="([^"]+)"', key)
            if label:
                deltas[label.group(1)] = val - before.get(key, 0.0)
    return {k: int(v) for k, v in deltas.items() if v}


def handoff_quantile(before: dict, after: dict, q: float) -> float | None:
    """Quantile (upper-bound bucket edge, seconds) of the handoff histogram DELTA."""
    buckets = []
    for key, val in after.items():
        if key.startswith(f"{HANDOFF}_bucket"):
            le = re.search(r'le="([^"]+)"', key).group(1)
            delta = val - before.get(key, 0.0)
            buckets.append((float("inf") if le == "+Inf" else float(le), delta))
    buckets.sort()
    total = buckets[-1][1] if buckets else 0.0
    if total <= 0:
        return None
    for edge, cum in buckets:
        if cum >= q * total:
            return edge
    return buckets[-1][0]


# ── the load ─────────────────────────────────────────────────────────────────────────

async def drive(base_url: str, token: str, n_requests: int, concurrency: int):
    """Fire n_requests at /trust/evaluate with `concurrency` true concurrent lanes."""
    latencies, failures = [], []
    counter = {"i": 0}
    headers = {"Authorization": f"Bearer {token}"}
    limits = httpx.Limits(max_connections=concurrency + 5)

    async with httpx.AsyncClient(timeout=30.0, limits=limits) as client:
        async def lane(lane_id: int):
            while True:
                i = counter["i"]
                if i >= n_requests:
                    return
                counter["i"] = i + 1
                payload = {
                    # Unique prompts defeat the response cache → every eval is real.
                    "prompt": f"shed-load probe {i} lane {lane_id}: summarize policy X",
                    "response": f"synthetic governed output {i}",
                    "model": "gpt-4",
                }
                t0 = time.perf_counter()
                try:
                    r = await client.post(
                        f"{base_url}/trust/evaluate", json=payload, headers=headers
                    )
                    latencies.append(time.perf_counter() - t0)
                    if r.status_code != 200:
                        failures.append((i, r.status_code, r.text[:200]))
                except Exception as exc:
                    latencies.append(time.perf_counter() - t0)
                    failures.append((i, "EXC", repr(exc)))

        await asyncio.gather(*[lane(k) for k in range(concurrency)])
    return latencies, failures


async def poll_inflight(base_url: str, stop: asyncio.Event, samples: list):
    """Continuously sample the (instantaneous) pool in-flight gauge during the run."""
    async with httpx.AsyncClient(timeout=5.0) as client:
        while not stop.is_set():
            try:
                r = await client.get(f"{base_url}/metrics")
                m = re.search(rf"^{INFLIGHT}\s+([0-9.eE+-]+)$", r.text, re.M)
                if m:
                    samples.append(float(m.group(1)))
            except Exception:
                pass
            await asyncio.sleep(0.1)


# ── main ─────────────────────────────────────────────────────────────────────────────

async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--base-url", default="http://localhost:8001")
    ap.add_argument("--requests", type=int, default=300)
    ap.add_argument("--concurrency", type=int, default=40)
    ap.add_argument("--pool-cap", type=int, default=5,
                    help="ENGINE_SHADOW_POOL_MAX_CONNECTIONS in effect on core")
    ap.add_argument("--token", help="Bearer JWT for /trust/evaluate")
    ap.add_argument("--jwt-secret", help="Mint a dev JWT from core's JWT_SECRET")
    ap.add_argument("--internal-key", default="",
                    help="X-Veldrix-Internal-Key for /internal/shadow-flags (if set on core)")
    ap.add_argument("--no-attach", action="store_true",
                    help="Do not touch the runtime flags (assume already attached at 100%%)")
    args = ap.parse_args()

    if not args.token and not args.jwt_secret:
        print("ERROR: provide --token or --jwt-secret", file=sys.stderr)
        return 2
    token = args.token or mint_jwt(args.jwt_secret)
    ikey = {"X-Veldrix-Internal-Key": args.internal_key} if args.internal_key else {}

    async with httpx.AsyncClient(timeout=10.0) as client:
        # Attach at 100% via the Fix-1 hot mechanism (restored afterwards).
        prev = None
        if not args.no_attach:
            r = await client.get(f"{args.base_url}/internal/shadow-flags", headers=ikey)
            r.raise_for_status()
            prev = r.json()
            r = await client.post(
                f"{args.base_url}/internal/shadow-flags",
                json={"enabled": True, "sample_pct": 100}, headers=ikey,
            )
            r.raise_for_status()
            print(f"[attach] runtime flags → {r.json()} (was enabled={prev['enabled']} "
                  f"pct={prev['sample_pct']} source={prev['source']})")
            await asyncio.sleep(prev["cache_ttl_s"] + 0.6)  # let every worker converge

        before = parse_metrics((await client.get(f"{args.base_url}/metrics")).text)

    stop = asyncio.Event()
    samples: list[float] = []
    poller = asyncio.create_task(poll_inflight(args.base_url, stop, samples))

    print(f"[drive] {args.requests} requests, {args.concurrency} concurrent lanes → "
          f"{args.base_url}/trust/evaluate")
    t0 = time.perf_counter()
    latencies, failures = await drive(args.base_url, token, args.requests, args.concurrency)
    wall = time.perf_counter() - t0

    await asyncio.sleep(2.0)  # let post-response workers finish + gauge settle
    stop.set()
    await poller

    async with httpx.AsyncClient(timeout=10.0) as client:
        after = parse_metrics((await client.get(f"{args.base_url}/metrics")).text)
        if prev is not None:
            # Restore the pre-run flags via the same hot mechanism (no restart).
            r = await client.post(
                f"{args.base_url}/internal/shadow-flags",
                json={"enabled": prev["enabled"], "sample_pct": prev["sample_pct"]},
                headers=ikey,
            )
            print(f"[restore] runtime flags → {r.json()}")

    # ── the report ────────────────────────────────────────────────────────────────
    deltas = outcome_delta(before, after)
    peak = max(samples) if samples else 0.0
    p99 = handoff_quantile(before, after, 0.99)
    lat_ms = sorted(x * 1000 for x in latencies)
    client_p50 = statistics.median(lat_ms) if lat_ms else 0.0
    client_p99 = lat_ms[int(0.99 * (len(lat_ms) - 1))] if lat_ms else 0.0

    print(f"\n── LIVE SHED PROOF ── ({args.requests} req in {wall:.1f}s, "
          f"{args.requests / wall:.0f} rps)")
    print(f"outcome deltas:            {deltas}")
    print(f"pool in-flight peak:       {peak:g} (cap {args.pool_cap}; "
          f"{len(samples)} gauge samples)")
    print(f"impact-guard p99 (delta):  {'<= ' + format(p99, 'g') + 's' if p99 else 'no data'}")
    print(f"client latency p50/p99:    {client_p50:.0f}ms / {client_p99:.0f}ms")
    print(f"request failures:          {len(failures)}")
    for f in failures[:5]:
        print(f"   {f}")

    ok = True
    def check(cond, label):
        nonlocal ok
        print(("  PASS  " if cond else "  FAIL  ") + label)
        ok = ok and cond

    print("\n── assertions ──")
    check(peak >= args.pool_cap,
          f"pool saturated live: in-flight peak {peak:g} >= cap {args.pool_cap}")
    check(deltas.get("write_failed", 0) >= 1,
          f"overflow shed + counted: write_failed +{deltas.get('write_failed', 0)}"
          + (f" (runtime-gate dropped_backpressure +{deltas['dropped_backpressure']})"
             if deltas.get("dropped_backpressure") else ""))
    check(p99 is not None and p99 <= 0.001,
          f"impact guard flat under saturation: handoff p99 <= {p99}s (sub-millisecond)")
    check(not failures, "no request failed/delayed by the shed (all 200)")
    check(deltas.get("dispatched", 0) >= args.requests * 0.9,
          f"engine actually attached during run: dispatched +{deltas.get('dispatched', 0)}")

    print("\nRESULT: " + ("LIVE SHED PROOF PASSED" if ok else
                          "FAILED — the shed path did NOT prove out live; investigate, do not close"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
