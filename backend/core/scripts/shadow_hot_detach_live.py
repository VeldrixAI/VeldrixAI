#!/usr/bin/env python3
"""Phase-6 closeout Fix 1 — LIVE hot-detach proof (mid-stream flip, no restart).

Runs continuous governed traffic at the dev stack, then — while requests are in
flight — flips the shadow engine OFF via the runtime-flag control and verifies, from
the service's own metrics, all of the following (then flips back ON and verifies
re-attach), with the core process never restarting:

  1. **New dispatch halts** within the documented propagation bound
     (flag cache TTL + one Redis read): the `dispatched` counter stops moving and
     `skipped_kill_switch` starts climbing while traffic continues.
  2. **In-flight drains cleanly**: the dedicated-pool in-flight gauge returns to 0 and
     every pre-flip dispatch reaches a terminal outcome (written/shed) with zero
     `worker_exception` — completing is harmless (out-of-band, enforced:false).
  3. **No request is touched**: every request before, during, and after the flip
     returns 200.
  4. **Flip back ON re-attaches** within the same bound — still no restart.
  5. The core process uptime spans the whole exercise (proved via /metrics
     process_start_time_seconds — same process before and after).

Usage (dev stack up, from repo root):

    python backend/core/scripts/shadow_hot_detach_live.py \
        --jwt-secret "$JWT_SECRET_KEY" --internal-key "$VELDRIX_INTERNAL_API_KEY"
"""

from __future__ import annotations

import argparse
import asyncio
import re
import sys
import time

import httpx

from shadow_shed_load import mint_jwt, parse_metrics  # same-dir reuse

OUTCOME = "veldrix_policy_shadow_outcome_total"
INFLIGHT = "veldrix_policy_shadow_worker_pool_inflight"


def outcome(metrics: dict, name: str) -> float:
    return metrics.get(f'{OUTCOME}{{outcome="{name}"}}', 0.0)


async def scrape(client: httpx.AsyncClient, base_url: str) -> dict:
    m = parse_metrics((await client.get(f"{base_url}/metrics")).text)
    r = await client.get(f"{base_url}/metrics")
    st = re.search(r"^process_start_time_seconds\s+([0-9.eE+]+)$", r.text, re.M)
    m["process_start_time_seconds"] = float(st.group(1)) if st else -1.0
    return m


async def traffic(base_url: str, token: str, stop: asyncio.Event, results: list):
    """Continuous governed traffic, a few concurrent lanes, until told to stop."""
    headers = {"Authorization": f"Bearer {token}"}

    async def lane(lane_id: int):
        i = 0
        async with httpx.AsyncClient(timeout=30.0) as client:
            while not stop.is_set():
                i += 1
                try:
                    r = await client.post(
                        f"{base_url}/trust/evaluate",
                        json={
                            "prompt": f"hot-detach probe lane {lane_id} #{i}",
                            "response": f"synthetic output {i}",
                            "model": "gpt-4",
                        },
                        headers=headers,
                    )
                    results.append((time.monotonic(), r.status_code))
                except Exception as exc:
                    results.append((time.monotonic(), repr(exc)))

    await asyncio.gather(*[lane(k) for k in range(3)])


async def wait_for(predicate, client, base_url, timeout_s, poll_s=0.25):
    """Poll the metrics until predicate(metrics) is true; return (elapsed, metrics)."""
    t0 = time.monotonic()
    while True:
        m = await scrape(client, base_url)
        if predicate(m):
            return time.monotonic() - t0, m
        if time.monotonic() - t0 > timeout_s:
            return None, m
        await asyncio.sleep(poll_s)


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--base-url", default="http://localhost:8001")
    ap.add_argument("--token")
    ap.add_argument("--jwt-secret")
    ap.add_argument("--internal-key", default="")
    args = ap.parse_args()

    if not args.token and not args.jwt_secret:
        print("ERROR: provide --token or --jwt-secret", file=sys.stderr)
        return 2
    token = args.token or mint_jwt(args.jwt_secret)
    ikey = {"X-Veldrix-Internal-Key": args.internal_key} if args.internal_key else {}

    ok = True
    def check(cond, label):
        nonlocal ok
        print(("  PASS  " if cond else "  FAIL  ") + label)
        ok = ok and cond

    async with httpx.AsyncClient(timeout=10.0) as client:
        # Attach at 100% (hot), note the propagation bound + the process identity.
        r = await client.post(f"{args.base_url}/internal/shadow-flags",
                              json={"enabled": True, "sample_pct": 100}, headers=ikey)
        r.raise_for_status()
        bound = r.json()["max_propagation_s"] + 1.0  # + polling/scheduling slack
        m0 = await scrape(client, args.base_url)
        proc_t0 = m0["process_start_time_seconds"]
        await asyncio.sleep(r.json()["cache_ttl_s"] + 0.6)

        # Continuous traffic starts; give it a few seconds attached.
        stop = asyncio.Event()
        results: list = []
        traffic_task = asyncio.create_task(traffic(args.base_url, token, stop, results))
        await asyncio.sleep(6.0)

        pre = await scrape(client, args.base_url)
        check(outcome(pre, "dispatched") > outcome(m0, "dispatched"),
              "attached + dispatching under live traffic before the flip")

        # ── FLIP OFF, mid-stream ────────────────────────────────────────────────
        t_flip = time.monotonic()
        r = await client.post(f"{args.base_url}/internal/shadow-flags",
                              json={"enabled": False}, headers=ikey)
        r.raise_for_status()
        print(f"[flip] OFF at t=0 (bound: halt within {bound:.1f}s)")

        # 1. New dispatch halts: skipped_kill_switch starts climbing.
        elapsed, m_off = await wait_for(
            lambda m: outcome(m, "skipped_kill_switch") > outcome(pre, "skipped_kill_switch"),
            client, args.base_url, timeout_s=bound + 2,
        )
        check(elapsed is not None and elapsed <= bound,
              f"new dispatch halted {('%.2f' % elapsed) if elapsed else '>bound'}s after "
              f"flip (bound {bound:.1f}s), skipped_kill_switch climbing")

        # ...and stays halted: dispatched frozen over a full traffic window.
        d_frozen = outcome(m_off, "dispatched")
        await asyncio.sleep(4.0)
        m_check = await scrape(client, args.base_url)
        check(outcome(m_check, "dispatched") == d_frozen,
              f"dispatched frozen at {int(d_frozen)} while traffic continues detached")

        # 2. In-flight drained: gauge to 0, all pre-flip dispatches terminal, no faults.
        elapsed, m_drain = await wait_for(
            lambda m: m.get(INFLIGHT, -1) == 0, client, args.base_url, timeout_s=10,
        )
        check(elapsed is not None, "dedicated-pool in-flight drained to 0 after flip")
        terminal = (outcome(m_drain, "written") + outcome(m_drain, "write_failed")
                    + outcome(m_drain, "dropped_backpressure") + outcome(m_drain, "worker_exception"))
        check(terminal >= d_frozen,
              f"every pre-flip dispatch reached a terminal outcome ({int(terminal)} >= {int(d_frozen)})")
        check(outcome(m_drain, "worker_exception") == outcome(m0, "worker_exception"),
              "drain produced zero worker exceptions (in-flight completed harmlessly)")

        # ── FLIP BACK ON — re-attach, still no restart ─────────────────────────
        r = await client.post(f"{args.base_url}/internal/shadow-flags",
                              json={"enabled": True}, headers=ikey)
        r.raise_for_status()
        print("[flip] ON")
        elapsed, m_on = await wait_for(
            lambda m: outcome(m, "dispatched") > d_frozen,
            client, args.base_url, timeout_s=bound + 2,
        )
        check(elapsed is not None and elapsed <= bound,
              f"re-attached {('%.2f' % elapsed) if elapsed else '>bound'}s after flip-on "
              f"(bound {bound:.1f}s) — dispatching again")

        # Wind down traffic; verify the request path never noticed any of it.
        await asyncio.sleep(2.0)
        stop.set()
        await traffic_task
        statuses = [s for _, s in results]
        bad = [s for s in statuses if s != 200]
        check(len(statuses) > 0 and not bad,
              f"request path untouched across both flips: {len(statuses)} requests, all 200"
              + (f" (bad: {bad[:5]})" if bad else ""))

        m_end = await scrape(client, args.base_url)
        check(m_end["process_start_time_seconds"] == proc_t0,
              "same core process throughout (process_start_time_seconds unchanged — NO restart)")

        print(f"\n[traffic] {len(statuses)} requests across attach→detach→drain→re-attach")
        print("RESULT: " + ("LIVE HOT-DETACH PROOF PASSED" if ok
                            else "FAILED — hot-detach did not prove out live"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
