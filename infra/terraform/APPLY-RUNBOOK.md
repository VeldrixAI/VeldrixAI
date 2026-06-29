# APPLY-RUNBOOK.md — Human-run apply for the VeldrixAI dev environment

> **The agent authored + validated this IaC but did NOT run `terraform apply`.**
> `apply` provisions live cloud resources and spends real money with your DO /
> Vercel credentials, so it is yours to run. This runbook is the exact sequence.
>
> **Two hard boundaries carried from Phase 5:**
> 1. Synthetic data ONLY — never copy/scrub/derive anything from production.
> 2. Nothing here touches prod infra, prod config, or live traffic. It ADDS a dev env.

---

## 0. Prerequisites (one-time)

- `terraform >= 1.6`, `doctl`, `docker` + `docker compose` plugin locally.
- A DigitalOcean account with the `veldrixai.ca` DNS zone already present (prod's).
- A Vercel account/team with access to the `VeldrixAI/VeldrixAI` GitHub repo.
- An SSH key uploaded to DO (`doctl compute ssh-key list` → note the fingerprint).
- The dev branch images pushed to GHCR (tag `dev`) — or build+push them first.

## 1. Credentials + variables

```bash
cd infra/terraform

# Credentials (gitignored — *.tfvars is ignored, *.example is not)
cp terraform.tfvars.example secrets.auto.tfvars
$EDITOR secrets.auto.tfvars       # do_token, vercel_api_token, ssh fingerprints

# Per-environment values
cp environments/dev.tfvars.example environments/dev.tfvars
$EDITOR environments/dev.tfvars    # usually fine as-is for dev
```

## 2. Validate + plan (no resources created yet)

```bash
terraform init
terraform fmt -check
terraform validate
terraform plan -var-file=environments/dev.tfvars -out=dev.tfplan
```

Review the plan. Expect: 1 droplet, 1 firewall, 2 DNS A records, 1 Vercel project,
and the Vercel env vars. **Confirm every host is a `*.dev.veldrixai.ca` value and
no prod resource is referenced.**

## 3. Apply (creates live resources — spends money)

```bash
terraform apply dev.tfplan
terraform output            # note droplet_ipv4, deploy_target, api_url, app_url
```

DNS may take a few minutes to propagate before LE-staging issuance succeeds.

## 4. Deploy the stack to the droplet (mirrors prod's scp+ssh shape)

```bash
DROPLET=$(terraform output -raw droplet_ipv4)

# 4a. Prepare the gitignored dev env file from the template.
cd ../compose
cp .env.deploy.example .env.dev.deploy
$EDITOR .env.dev.deploy           # fill DEV-SCOPED secrets (distinct from prod)

# 4b. Render the parameterized Traefik config for dev (LE-staging, dev hosts).
cd ../gateway
ENVIRONMENT=dev ./render-gateway.sh

# 4c. Ship compose + rendered gateway + env file to the droplet.
cd ../..
scp infra/compose/docker-compose.deploy.yml          root@$DROPLET:/opt/veldrixai/
scp infra/compose/.env.dev.deploy                    root@$DROPLET:/opt/veldrixai/.env
scp -r infra/gateway/rendered/traefik.yml            root@$DROPLET:/opt/veldrixai/gateway/traefik.yml
scp -r infra/gateway/rendered/dynamic                root@$DROPLET:/opt/veldrixai/gateway/dynamic

# 4d. Pull + start.
ssh root@$DROPLET 'cd /opt/veldrixai && docker compose -f docker-compose.deploy.yml pull && docker compose -f docker-compose.deploy.yml up -d'
```

## 5. Migrate + seed (fresh dev DB)

```bash
# Apply the full ordered migration set incl. 009/011 on the fresh dev DB.
ssh root@$DROPLET 'cd /opt/veldrixai && bash infra/db/bootstrap-migrations.sh'   # if shipped
# or run locally against the droplet DB over an SSH tunnel — see DEV_ENVIRONMENT.md.

# Seed minimal synthetic data (chain-respecting).
ssh root@$DROPLET 'cd /opt/veldrixai && docker compose -f docker-compose.deploy.yml exec veldrix-connectors python /seed/seed_dev.py'
```

## 6. Verify (isolation is the critical check)

```bash
DEV_API_HOST=api.dev.veldrixai.ca DEV_APP_HOST=dev.veldrixai.ca \
  bash infra/scripts/verify-dev.sh
```

Green = three services healthy, TLS resolving (LE-staging accepted), **dev DB/Redis
provably NOT prod**, migrations at expected version incl. 009/011, seed present,
chain-health intact, inference mode = `stub`, frontend resolves to the dev API.

## 7. Teardown (stop the meter)

```bash
cd infra/terraform
terraform destroy -var-file=environments/dev.tfvars
```

---

## Cost note

A `s-4vcpu-8gb` droplet is ~US$48/mo (~US$0.07/hr) — destroy it when idle. DNS
records and the Vercel hobby project are free. LE-staging certs are free. The
inference stub is free and deterministic; flipping to `live` (DEV_ENVIRONMENT.md)
starts spending on provider API calls.

## If apply fails

- **DNS zone not found** → the apex `veldrixai.ca` zone must exist in DO first.
- **LE-staging cert pending** → wait for DNS propagation; check Traefik logs.
- **Vercel project name taken** → change `vercel_project_name` in dev.tfvars.
