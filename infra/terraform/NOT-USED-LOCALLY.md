# ⛔ NOT USED BY THE LOCAL DEV MIRROR — deferred cloud path

This `infra/terraform/` directory provisions a **DigitalOcean droplet + DNS (+ Vercel)**
for a future **funded cloud dev/staging** environment. It is the deferred cloud path
from the Phase 5 cloud design.

**The free local dev mirror does NOT use any of this.** Local dev is brought up entirely
with Docker Compose on your machine — see **`DEV_LOCAL.md`** and `make dev-up`.

## Do not apply it as part of local dev
- `terraform apply` here costs money (creates a real droplet) and needs DO/Vercel
  credentials. It is **human-run, when funded** — never from `make dev-*`.
- The definition is parameterized by `environment` (`environments/dev.tfvars`,
  `prod.tfvars.example`) so the SAME definition can later stand up a real dev droplet
  running the cloud overlay (`infra/compose/docker-compose.deploy.yml`).
- Apply steps, when the time comes, are in `APPLY-RUNBOOK.md`.

## Secrets / state hygiene
`*.tfstate`, `*.tfvars` (except `*.example`), `*.tfplan`, and `.terraform/` are
**gitignored** (`infra/terraform/.gitignore`) — they may contain sensitive values and
must never be committed. If you see any staged, unstage them.
