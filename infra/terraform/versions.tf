# ─────────────────────────────────────────────────────────────────────────────
# Provider & Terraform version pins.
#
# ONE definition emits BOTH dev and prod. The environment is selected purely by
# the tfvars file passed at plan/apply time (environments/dev.tfvars vs
# environments/prod.tfvars). There is no per-environment .tf fork — parity is
# structural and drift is impossible by construction (Phase 5 §1.1).
# ─────────────────────────────────────────────────────────────────────────────

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.43"
    }
    vercel = {
      source  = "vercel/vercel"
      version = "~> 1.14"
    }
  }

  # Local backend by default (state is gitignored — see .gitignore). Swap to a
  # remote backend (DO Spaces / TF Cloud) before any team apply; left local so
  # the first human apply needs zero extra setup.
}
