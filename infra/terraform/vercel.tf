# ─────────────────────────────────────────────────────────────────────────────
# Vercel — frontend project + dev preview wiring.
#
# CRITICAL (RECON bonus finding / Phase 5 §1.6): the public client SDK
# (frontend/lib/veldrix-api.ts:10-14) falls back to the PROD api host when
# NEXT_PUBLIC_VELDRIX_CORE_API_URL is unset. So we set ALL NEXT_PUBLIC_* URL vars
# explicitly to dev values here — the prod fallback can never fire in dev. The
# app-logic fail-closed fix is tracked as a one-line follow-up (PARITY-CHECKLIST).
# ─────────────────────────────────────────────────────────────────────────────

resource "vercel_project" "frontend" {
  name      = var.vercel_project_name
  framework = "nextjs"

  git_repository = {
    type              = "github"
    repo              = var.vercel_git_repo
    production_branch = var.vercel_production_branch
  }
}

locals {
  # Every public URL the frontend reads, pinned to the dev API host so the
  # veldrix-api.ts prod fallback is structurally unreachable.
  vercel_env = {
    NEXT_PUBLIC_API_BASE               = "https://${var.api_host}"
    NEXT_PUBLIC_APP_URL                = "https://${var.app_host}"
    NEXT_PUBLIC_ENV                    = var.environment
    NEXT_PUBLIC_VELDRIX_CORE_URL       = "https://${var.api_host}"
    NEXT_PUBLIC_VELDRIX_CORE_API_URL   = "https://${var.api_host}"
    NEXT_PUBLIC_VELDRIX_AUTH_URL       = "https://${var.api_host}/auth"
    NEXT_PUBLIC_VELDRIX_CONNECTORS_URL = "https://${var.api_host}"
    # Server-side (SSR) internal URLs also point at the dev API host.
    VELDRIX_AUTH_API_URL       = "https://${var.api_host}"
    VELDRIX_CORE_API_URL       = "https://${var.api_host}"
    VELDRIX_CONNECTORS_API_URL = "https://${var.api_host}"
  }
}

resource "vercel_project_environment_variable" "public_urls" {
  for_each   = local.vercel_env
  project_id = vercel_project.frontend.id
  key        = each.key
  value      = each.value
  # Apply to all targets so neither preview nor production deployment of the dev
  # project can silently inherit a prod URL.
  target = ["production", "preview", "development"]
}
