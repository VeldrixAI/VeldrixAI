# ─────────────────────────────────────────────────────────────────────────────
# Input variables — the FULL dev/prod difference lives here.
#
# Everything that differs between environments is a variable. The .tf resource
# definitions are environment-agnostic; `environments/dev.tfvars` and
# `environments/prod.tfvars` are the only place the two diverge (Phase 5 §1.1,
# acceptance: "the dev/prod variable diff is the only difference").
# ─────────────────────────────────────────────────────────────────────────────

# ── Environment selector ──────────────────────────────────────────────────────
variable "environment" {
  description = "Deployment environment. Drives naming, tags, and which hosts/certs are emitted."
  type        = string
  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be one of: dev, prod."
  }
}

# ── Credentials (human-supplied, gitignored — NEVER committed) ────────────────
variable "do_token" {
  description = "DigitalOcean API token (PAT). Supplied via gitignored tfvars or TF_VAR_do_token."
  type        = string
  sensitive   = true
}

variable "vercel_api_token" {
  description = "Vercel API token for the frontend project. Gitignored / env-supplied."
  type        = string
  sensitive   = true
}

variable "vercel_team_id" {
  description = "Vercel team id (empty string for a personal account)."
  type        = string
  default     = ""
}

variable "ssh_key_fingerprints" {
  description = "DO SSH key fingerprints granted access to the droplet. At least one required."
  type        = list(string)
}

# ── DNS / domain ──────────────────────────────────────────────────────────────
variable "root_domain" {
  description = "Registrable apex domain managed in DigitalOcean DNS (e.g. veldrixai.ca)."
  type        = string
  default     = "veldrixai.ca"
}

variable "app_host" {
  description = "Frontend host. dev: dev.veldrixai.ca / prod: app.veldrixai.ca"
  type        = string
}

variable "api_host" {
  description = "API gateway host. dev: api.dev.veldrixai.ca / prod: api.veldrixai.ca (Host()-pinned Traefik routers)."
  type        = string
}

# ── Droplet sizing (same region/size class across envs per RECON Finding 3) ────
variable "droplet_region" {
  description = "DO region slug. Same as prod (NYC) for representative parity."
  type        = string
  default     = "nyc1"
}

variable "droplet_size" {
  description = "DO droplet size slug. Same class as prod."
  type        = string
  default     = "s-4vcpu-8gb"
}

variable "droplet_image" {
  description = "Base image slug for the droplet."
  type        = string
  default     = "docker-20-04"
}

# ── ACME / TLS (parameterized resolver — LE-staging in dev, LE-prod in prod) ──
variable "acme_email" {
  description = "Let's Encrypt contact. dev: a dev contact / prod: admin@veldrixai.ca"
  type        = string
}

variable "acme_ca_server" {
  description = <<-EOT
    ACME directory URL. Parameterizes the cert resolver so the SAME IaC uses
    LE-staging in dev and prod-LE in prod (Phase 5 locked decision #2).
      dev : https://acme-staging-v02.api.letsencrypt.org/directory
      prod: https://acme-v02.api.letsencrypt.org/directory
  EOT
  type        = string
}

# ── Application image tag (dev branch tag vs main) ────────────────────────────
variable "image_tag" {
  description = "Container image tag deployed to this environment (dev branch tag vs prod main tag)."
  type        = string
  default     = "latest"
}

variable "docker_registry" {
  description = "GHCR image prefix (matches Jenkins / prod compose)."
  type        = string
  default     = "ghcr.io/veldrixai/veldrixai"
}

# ── CORS / frontend public URLs (dev hosts only) ──────────────────────────────
variable "cors_origins" {
  description = "Comma-separated allowed CORS origins for this environment (dev hosts only in dev)."
  type        = string
}

# ── Vercel ────────────────────────────────────────────────────────────────────
variable "vercel_project_name" {
  description = "Vercel project name for the frontend."
  type        = string
}

variable "vercel_git_repo" {
  description = "GitHub repo (owner/name) backing the Vercel project."
  type        = string
  default     = "VeldrixAI/VeldrixAI"
}

variable "vercel_production_branch" {
  description = "Branch Vercel treats as the project's production deployment for THIS environment (dev env tracks a dev branch)."
  type        = string
}
