# DEV_LOCAL.md — Free Local Dev Mirror (WSL2 + Docker Desktop)

Stand up `dev` as a **faithful, free, local mirror of production** by running the same
service topology as a Docker Compose stack on your own machine. No cloud droplet, no
spend. Prod is untouched; this **adds** a local mirror only.

- **Builds every image from local source** (no private GHCR pulls).
- **Self-signed mkcert TLS** (locally trusted — green lock, no warnings).
- **Stub inference by default** — deterministic, free, network-free.
- **Synthetic data only**, written through the real audit hash chain.
- **Isolated**: all resources are namespaced `veldrix-localdev-*` — they can never
  touch prod, the cloud-dev droplet, or the legacy `docker-compose.yml` dev stack.

> Companion docs: `RECON-LOCAL.md` (why these choices), `DEV_ENVIRONMENT.md` (the
> deferred **cloud** droplet path), `infra/terraform/NOT-USED-LOCALLY.md`.

---

## 0. Prerequisites

| Need | Why |
|---|---|
| **Windows 11 + WSL2 (Ubuntu)** | The stack runs inside WSL2's Linux env (matches the prod droplet OS; avoids Windows path/network/arch foot-guns). |
| **Docker Desktop** with **WSL2 integration enabled** | Settings → Resources → WSL Integration → enable your distro. |
| **mkcert** (inside WSL2) | Locally-trusted self-signed certs. Install steps below. |
| **make, git, openssl, gettext** | `sudo apt-get install -y make git openssl gettext` |
| **~6–8 GB free RAM** (full) / **~3–4 GB** (lean) | Full = all services + Prometheus/Grafana. |

> ⚠️ **Clone into the WSL2 filesystem, NOT `/mnt/c`.** Running the stack off the
> Windows-mounted path is slow and breaks file-watch hot-reload (inotify).
> ```bash
> # inside WSL2:
> cd ~ && git clone <repo-url> VeldrixAI && cd ~/VeldrixAI
> ```

---

## 1. One-time setup

### 1a. Hosts file → map dev domains to localhost

The dev hostnames resolve to `127.0.0.1`. Add them in **both** places:

```bash
# WSL2 (for curl/verify inside Linux):
echo "127.0.0.1  dev.veldrixai.ca api.dev.veldrixai.ca" | sudo tee -a /etc/hosts
```

For a **Windows browser**, also add to `C:\Windows\System32\drivers\etc\hosts`
(edit as Administrator):
```
127.0.0.1  dev.veldrixai.ca api.dev.veldrixai.ca
```

### 1b. Install mkcert + generate the TLS cert

```bash
sudo apt-get update && sudo apt-get install -y libnss3-tools
curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
chmod +x mkcert-v*-linux-amd64 && sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert

make dev-certs   # runs `mkcert -install` + issues gateway/local/certs/dev-cert.pem(+key)
```

`mkcert -install` adds mkcert's local CA to your trust stores so
`https://dev.veldrixai.ca` shows a **green lock**. For the cert to be trusted in a
**Windows browser**, also run `mkcert -install` once on the Windows side (install the
Windows mkcert build), or import `"$(mkcert -CAROOT)/rootCA.pem"` into Windows'
*Trusted Root Certification Authorities*.

### 1c. Create `.env.dev` and generate DEV-SCOPED secrets

```bash
make dev-env          # copies .env.dev.example -> .env.dev (gitignored)
```

Generate **distinct** dev values (never reuse prod) and paste them into `.env.dev`:

```bash
echo "JWT_SECRET_KEY=$(openssl rand -hex 32)"
echo "VELDRIX_INTERNAL_API_KEY=$(openssl rand -hex 32)"
echo "INTERNAL_SERVICE_TOKEN=$(openssl rand -hex 32)"
echo "VELDRIX_VAULT_KEY=$(openssl rand -base64 32)"
echo "STRIPE_CUSTOMER_HASH_KEY=$(openssl rand -base64 32)"
echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)"
echo "GRAFANA_ADMIN_PASSWORD=$(openssl rand -hex 12)"
# CONNECTOR_ENCRYPTION_KEY is a Fernet key:
python3 -c "from cryptography.fernet import Fernet; print('CONNECTOR_ENCRYPTION_KEY='+Fernet.generate_key().decode())"
```

Stripe keys must be **test mode** (`sk_test_…`/`pk_test_…`); leave provider/OAuth/Resend
blank to run fully offline (those features are inert locally until you fill them).

---

## 2. Bring it up

```bash
make dev-up        # FULL: stub inference + Prometheus/Grafana   (~6-8 GB)
# or
make dev-up-lean   # LEAN: stub inference only (no observability) (~3-4 GB)

make dev-seed      # synthetic tenants/users/policies + audit rows (idempotent)
make dev-verify    # asserts health, isolation, TLS, stub, seed, chain, drift
```

`make dev-up` does, in order:
1. start **postgres** and wait healthy,
2. build + start the rest — the **services build the schema on boot exactly as prod
   does** (RECON-DEV Finding 4): SQLAlchemy `create_all()` materializes every table
   (incl. the 009/011 policy tables via the ORM models) and the connectors
   `_run_migrations()` boot hook applies the 010 audit hash-chain + append-only trigger.

> The numbered `.sql` files are canonical, human-readable artifacts — **prod never runs
> them**, and neither does `dev-up`. (`000_full_schema` is a consolidated baseline that
> overlaps `001`–`007`, so applying the incrementals on top double-creates.) `make
> dev-verify` runs `check-drift.sh` to assert the 009/010/011 objects actually landed.
> If you ever want to apply the canonical `.sql` by hand, `make dev-migrate` applies the
> baseline + post-baseline set (`000` + `008`/`009`/`010`/`011`) on a fresh DB.

Then visit:
- App: **https://dev.veldrixai.ca**
- API: **https://api.dev.veldrixai.ca** (e.g. `/health`)
- Grafana: http://localhost:3001 · Prometheus: http://localhost:9090 · Traefik: http://localhost:8080

### Ports

| Service | Host port | Service | Host port |
|---|---|---|---|
| Traefik (HTTP→HTTPS) | 80 / 443 | Postgres | 127.0.0.1:**55432** |
| Traefik dashboard | 127.0.0.1:**8081** | Redis | (internal) |
| auth | 8000 | Prometheus | 127.0.0.1:9090 |
| core | 8001 | Grafana | 127.0.0.1:3001 |
| connectors | 8002 | mock-inference | (internal :9009) |
| frontend (Next.js) | 5000 | | |

> **Port conflicts?** Every host port above is overridable via `.env.dev`
> (`POSTGRES_HOST_PORT`, `TRAEFIK_DASHBOARD_PORT`, `AUTH_HOST_PORT`, …). Postgres
> defaults to **55432** (dodges a native Postgres on 5432) and the Traefik dashboard
> to **8081** (dodges Apache on 8080). The stack's internal wiring is unaffected — it
> uses the docker network (`postgres:5432`, `veldrix-core:8001`, …) regardless.

---

## 3. Lean vs full (RAM)

Observability (Prometheus + Grafana + postgres-exporter) is gated behind the
`observability` Compose profile.

- **Full** (`make dev-up`) → `COMPOSE_PROFILES=stub,observability` — includes dashboards.
  Expect **~6–8 GB** resident.
- **Lean** (`make dev-up-lean`) → `COMPOSE_PROFILES=stub` — omits observability for
  **<16 GB** machines. Expect **~3–4 GB**.

The app, gateway, DB, Redis, and stub inference are identical in both.

---

## 4. Stub → live inference

Default is **stub**: `core` points `NVIDIA_API_BASE_URL` at the deterministic
`mock-inference` container (free, offline, returns a green "safe" assessment). The real
`route_inference()` / pillar code is **untouched** — stubbing is a boundary redirect.

To use real providers locally (high-fidelity phases):
1. In `.env.dev`: set `VELDRIX_INFERENCE_MODE=live`, set real **dev-scoped** keys
   (`NVIDIA_API_KEY`, `GROQ_API_KEY`, …) and the real `NVIDIA_API_BASE_URL`.
2. Bring up **without** the stub profile:
   ```bash
   COMPOSE_PROFILES=observability docker compose -f docker-compose.dev.yml \
     --env-file .env.dev up -d --build
   ```

---

## 5. Reset / teardown

```bash
make dev-down     # stop + remove containers (volumes/data KEPT)
make dev-reset    # DESTROY volumes (DB/Redis/Grafana), rebuild clean, re-seed
make dev-logs     # tail logs        make dev-ps  # status
```

`make clean` additionally prunes the legacy + prod-file stacks and dangling images.

---

## 6. Promote to cloud later (deferred)

When funded, the **same topology** can run on a real DigitalOcean dev droplet via the
already-written, parameterized definitions — nothing here is throwaway:
- `infra/terraform/` — droplet + DNS (+ Vercel), `environment`-parameterized.
  **Not used locally; human-run when funded.** See `infra/terraform/NOT-USED-LOCALLY.md`
  and `infra/terraform/APPLY-RUNBOOK.md`.
- `infra/compose/docker-compose.deploy.yml` — the cloud overlay (pulls GHCR images,
  LE-staging TLS) the droplet would run; `infra/scripts/dev-up.sh` ships it over SSH.
- `infra/gateway/render-gateway.sh` — renders LE-staging (dev) / LE (prod) gateway config.

Local self-signed and cloud LE are the **same gateway, two cert mechanisms**.

---

## 7. Known follow-up (tracked, not done here)

**`frontend/lib/veldrix-api.ts:10-14`** falls back to `?? "https://api.veldrixai.ca"`
(prod) when the `NEXT_PUBLIC_*` core URL is unset. This mirror **guards** it by setting
every `NEXT_PUBLIC_*` URL explicitly to the dev API host (see `docker-compose.dev.yml`),
so the prod fallback can never fire locally — `make dev-verify` step 8 asserts this.
The **fail-closed code fix** (make the fallback env-required instead of defaulting to
prod) is a separate one-line follow-up; Phase 5 does not modify application logic.

---

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `Missing TLS cert` on `make dev-up` | `make dev-certs` |
| Browser shows untrusted cert | Run `mkcert -install` on the **Windows** side too (1b). |
| `https://dev.veldrixai.ca` not resolving | Add the hosts-file entries (1a), both WSL2 + Windows. |
| Postgres `:?` var errors | `.env.dev` missing/blank — `make dev-env` then fill secrets. |
| Hot-reload not firing | You're running off `/mnt/c` — re-clone into `~/VeldrixAI`. |
| `mock-inference` not running | It's in the `stub` profile — use `make dev-up` (not raw `up`). |
| Slow first boot | Image builds + `npm install` on first run; subsequent boots are cached. |
