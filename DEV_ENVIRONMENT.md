# DEV_ENVIRONMENT.md — VeldrixAI development environment (Phase 5)

A faithful, isolated replica of production at `dev.veldrixai.ca` /
`api.dev.veldrixai.ca`, built from one environment-parameterized IaC definition.
Same topology and mechanisms as prod; the only difference is the variable diff
(`PARITY-CHECKLIST.md`). **Synthetic data only. Never derived from production.**

> The agent authored + validated this. It did **not** run `terraform apply` and
> did **not** create cloud resources — you light it up with your own credentials.

---

## Layout

```
infra/
  terraform/        # parameterized IaC (droplet, DNS, Vercel) — dev+prod from one def
    environments/   # dev.tfvars.example / prod.tfvars.example  ← the whole diff
    APPLY-RUNBOOK.md
  compose/          # docker-compose.deploy.yml (+ .env.deploy.example)
  gateway/          # traefik + routes TEMPLATES + render-gateway.sh (LE-staging)
  mock-inference/   # deterministic OpenAI-compatible inference STUB
  db/               # bootstrap-migrations.sh (009/011) + check-drift.sh
  seed/             # seed_dev.py — synthetic, chain-respecting
  scripts/          # dev-up / verify-dev / dev-reset / dev-teardown / run-seed
frontend/.env.dev.example     # all NEXT_PUBLIC_* set to dev (drift guard)
PARITY-CHECKLIST.md
```

## Parity statement

Topology, image versions, the Traefik router/service graph, the middleware chain,
the network/volume shape, the Compose-on-droplet deploy shape, and the
`create_all()` + `_run_migrations()` schema mechanism are **identical** to prod.
Hosts, ACME (LE-staging + separate cert store), CORS, all secrets, Stripe (test
mode), inference (stub), the Postgres/Redis instances, and the image tag are
**deliberately different** and live entirely in the env/tfvars files. See
`PARITY-CHECKLIST.md` for the full table and the four tracked follow-ups.

---

## 1. Provision (human-run — see `infra/terraform/APPLY-RUNBOOK.md`)

```bash
cd infra/terraform
cp terraform.tfvars.example secrets.auto.tfvars         # DO/Vercel creds, gitignored
cp environments/dev.tfvars.example environments/dev.tfvars
terraform init && terraform validate
terraform plan  -var-file=environments/dev.tfvars -out=dev.tfplan
terraform apply dev.tfplan                              # creates droplet + DNS + Vercel
```

## 2. Deploy + migrate + seed (one command)

```bash
# Fill the gitignored dev env file first (DISTINCT dev secrets):
cp infra/compose/.env.deploy.example infra/compose/.env.dev.deploy
$EDITOR infra/compose/.env.dev.deploy

DROPLET=$(cd infra/terraform && terraform output -raw droplet_ipv4) \
DEPLOY_ENV_FILE=infra/compose/.env.dev.deploy \
  bash infra/scripts/dev-up.sh
```

`dev-up.sh` renders the dev gateway (LE-staging, dev hosts), ships compose +
config + seed + migrations to the droplet, `pull`s + `up`s with the **stub**
profile, applies the **full ordered migration set incl. 009/011**, then seeds.

Generate distinct dev secret values:
```bash
python -c "import secrets; print(secrets.token_hex(32))"                       # JWT / tokens
python -c "import base64,secrets; print(base64.b64encode(secrets.token_bytes(32)).decode())"  # vault / hash keys
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"     # CONNECTOR_ENCRYPTION_KEY
```

## 3. Verify (isolation is the critical check)

```bash
DROPLET=...; ssh root@$DROPLET 'cd /opt/veldrixai && \
  DEV_API_HOST=api.dev.veldrixai.ca DEV_APP_HOST=dev.veldrixai.ca \
  bash infra/scripts/verify-dev.sh'
```

Green ⇒ services healthy (8000/8001/8002/5000), TLS resolving on **LE-staging**,
**dev DB/Redis provably NOT prod**, migrations at expected version incl. 009/011,
seed present, chain-health intact, inference mode `stub`, frontend → dev API.

## 4. Re-seed / reset / teardown

```bash
ssh root@$DROPLET 'cd /opt/veldrixai && bash infra/scripts/run-seed.sh'      # idempotent re-seed
ssh root@$DROPLET 'cd /opt/veldrixai && bash infra/scripts/dev-reset.sh'     # wipe volumes → clean rebuild + seed
ssh root@$DROPLET 'cd /opt/veldrixai && bash infra/scripts/dev-teardown.sh'  # stop stack + remove volumes
cd infra/terraform && terraform destroy -var-file=environments/dev.tfvars     # release cloud resources (stop the meter)
```

`dev-reset.sh` / `dev-teardown.sh` refuse to run unless `ENVIRONMENT=dev`, and
volume/network names are `veldrix-dev-*` — they can never touch the prod stack.

## 5. Frontend (Vercel dev preview)

`infra/terraform/vercel.tf` creates a `veldrixai-dev` project tracking the `dev`
branch and sets **every** `NEXT_PUBLIC_*` URL var to the dev API host, so the
`veldrix-api.ts` prod fallback (`PARITY-CHECKLIST.md` C1) can never fire. For
local frontend dev, `cp frontend/.env.dev.example frontend/.env.local`.

---

## Flipping inference: stub → live

Dev defaults to the deterministic **stub** (free, makes verify reliable). The
real-key seam is already built. To use real **dev-scoped** provider keys (e.g.
for engine-integration or Hydro-Okta fidelity phases):

1. In `infra/compose/.env.dev.deploy`:
   ```
   VELDRIX_INFERENCE_MODE=live
   NVIDIA_API_BASE_URL=https://integrate.api.nvidia.com/v1
   NVIDIA_API_KEY=<DEV-scoped NVIDIA key>
   GROQ_API_KEY=<DEV-scoped Groq key>
   # optionally BEDROCK_PROXY_URL / OSS_INFERENCE_URL
   ```
2. Restart **without** the stub profile so the mock isn't started:
   ```bash
   ssh root@$DROPLET 'cd /opt/veldrixai && \
     docker compose -f docker-compose.deploy.yml up -d veldrix-core veldrix-connectors'
   ```
3. Flip back to stub by restoring `VELDRIX_INFERENCE_MODE=stub` +
   `NVIDIA_API_BASE_URL=http://mock-inference:9009/v1` and `up -d --profile stub`.

`verify-dev.sh` §7 reports the current mode; in `live` it will note the base URL
no longer points at the stub (expected).

---

## Cost

`s-4vcpu-8gb` droplet ≈ **US$48/mo** (~US$0.07/hr) — `terraform destroy` when
idle. DNS records, Vercel hobby project, LE-staging certs, and the inference stub
are **free**. Flipping inference to `live` starts spending on provider API calls.

## Constraints honored

Authored + `validate`/`plan` only (no `apply`, no live resources, no spend by the
agent). Synthetic data only. Zero changes to prod infra/config or application
logic — including the untouched `frontend/lib/veldrix-api.ts` (guarded via env,
fix tracked as `PARITY-CHECKLIST.md` C2). No real secret values committed;
`e2e-test/.env` is not referenced.
