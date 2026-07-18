# RECOVERY_RUNBOOK.md — Prod Droplet Destruction Incident (2026-07-17)

> **Status: OPEN.** DigitalOcean support ticket **#12586488** filed 2026-07-18
> requesting restoration. This runbook holds the verified incident record and the
> three recovery paths, so execution starts the moment DO answers.

---

## 1. Incident record (verified via DO API action log, 2026-07-18)

| When (UTC) | Event |
|---|---|
| 2026-05-17 04:10 | Droplet `571409709` created (older Jan pair destroyed same hour — planned replacement) |
| 2026-05-17 15:01 | Droplet `571491028` created, **backups enabled** |
| 2026-05-26 05:45 | Droplet `573235890` created, **backups enabled** |
| weekly through 2026-07-17 08:09 | Backups completed for `571491028` + `573235890` (never for `571409709`) |
| 2026-07-16 10:05 | All three droplets **powered off** (account suspension, missed payment) |
| 2026-07-17 16:56 | All three droplets **destroyed** (`destroy` actions completed) |
| 2026-07-18 | Payment settled (balance −$65.80 credit, account `active`); **zero droplets, zero private images** remain via API/UI |

Key facts:
- Destroying a droplet deletes its retained backups — hence zero private images now.
- Last backup of `571491028` completed **~9 h before destruction** (2026-07-17 08:09).
- DNS (`veldrixai.ca`) is hosted at **IONOS** (`ns10xx.ui-dns.*`), NOT DigitalOcean —
  records still exist: `api.veldrixai.ca → 107.170.29.141`,
  `app.veldrixai.ca → 142.93.118.52 + 107.170.29.141` (both dead DO IPs).
- No DO volumes, no reserved IPs existed. Postgres data was **on-droplet**.

## 2. What survives (rebuild inventory)

| Asset | Where | State |
|---|---|---|
| Application code + infra defs | git (GitHub) — compose files, gateway, observability, seed, Phase 7 pipeline | SAFE |
| Container images | **GHCR** `ghcr.io/veldrixai/veldrixai-{auth,core,connectors,frontend}` — `:SHA` + `:latest` | SAFE (registry is GitHub, unaffected by DO) |
| Prod secrets (`.env.production`) | Jenkins credential store: `VELDRIX_ENV_FILE` (+ `DOCKER_HUB_CREDS` for GHCR pull) | SAFE (if the Jenkins host is intact — it is not a destroyed droplet… **verify**) |
| DNS zone | IONOS | SAFE — needs A-record updates on rebuild |
| TLS certs | Traefik acme.json lived on-droplet | LOST — Let's Encrypt will re-issue automatically on rebuild |
| **Prod Postgres data** (users, tenants, audit chains) | on-droplet volume | **LOST unless DO restores** — no off-provider dump known (**confirm with team**) |

## 3. Recovery paths (in order of preference)

### Path A — DO restores the droplets (best case)
1. Verify all three droplets reappear (`GET /v2/droplets`), note their IPs.
2. Power on (API `power_on` or control panel). Containers are `restart: unless-stopped` → stack self-starts.
3. If IPs changed: update IONOS A records (`api`, `app`, apex as applicable).
4. Verify: `/health` ×3, frontend, then connectors chain-health
   (`POST /api/audit-trails/internal/chain-health/refresh`) — the audit hash chain
   must be intact end-to-end.
5. Go to §4 hardening BEFORE anything else.

### Path B — DO restores backup images only
Covers `571491028` (backup of 2026-07-17) + `573235890` (backup of 2026-07-11);
`571409709` had no backups — its role must be rebuilt per Path C.
1. Create droplets from the restored images (same region/size: nyc, `s-4vcpu-8gb` class).
2. Boot; verify what each held (names in DO panel will match old roles); DB data
   state = as of backup date — up to ~9 h data loss on the newest, ~6 days on the older.
3. Update IONOS A records to the new IPs; LE re-issues via Traefik.
4. Verify as in Path A step 4; reconcile audit chain-health (a restored-from-backup
   DB should still self-verify; broken chains must be surfaced, not papered over).
5. §4 hardening.

### Path C — No restore: rebuild from scratch (infra is fully reproducible; data is not)
1. Provision droplet(s): `infra/terraform` with a prod tfvars (or manual `s-4vcpu-8gb`
   nyc + docker/compose bootstrap per `infra/terraform/APPLY-RUNBOOK.md` shape).
2. Place on the droplet: `docker-compose.prod.yml`, `gateway/`, `observability/`,
   `.env.production` (from Jenkins `VELDRIX_ENV_FILE`).
3. `docker login ghcr.io` (Jenkins `DOCKER_HUB_CREDS` or a fresh GHCR PAT) →
   `docker-compose pull` the last-good `:SHA` (see GHCR tags / Jenkins build history)
   → `up -d`.
4. Fresh DB: services build schema on boot (create_all + connectors migration hook);
   apply the 009 policy schema (`infra/db/apply-policy-schema.sh` pattern); engine
   posture stays OFF/0%/shadow by default.
5. Update IONOS A records; LE re-issues.
6. **Data**: restore from any off-provider dump if one exists; otherwise prod restarts
   with an empty database — communicate to affected users before DNS cutover.

## 4. Post-recovery hardening (MANDATORY — this incident's lessons)

1. **Off-provider DB backups**: nightly `pg_dump` shipped OFF DigitalOcean
   (e.g. object storage on another provider or encrypted to the repo runner).
   On-provider backups died with the account suspension — never again the only copy.
2. **Enable DO backups on every droplet** (571409709 never had them).
3. **Reserved IPs** on rebuild targets so DNS never needs emergency repointing.
4. **Billing safety**: verify the primary card, keep the backup card valid, set the
   DO spend alert, and add a calendar check — the suspension→destruction window
   was ~31 hours.
5. Rotate the DO API token used during recovery; update Jenkins `DIGITAL_OCEAN_PAT`.
6. Fold droplet provisioning into terraform (prod tfvars) so Path C is one command
   next time.

## 5. Open questions

- [ ] DO ticket #12586488 outcome — droplets, images, or nothing?
- [ ] Does ANY off-DO database dump exist? (determines Path C data loss)
- [ ] Where does Jenkins itself run? Confirm it was not one of the destroyed
  droplets — if it was, `VELDRIX_ENV_FILE` and `DOCKER_HUB_CREDS` need recovery
  from other sources (local `.env.production` copies, GHCR PAT re-issue).
- [ ] Payment timestamp vs 2026-07-17 16:56 UTC destruction (strengthens the ticket).
