# ─────────────────────────────────────────────────────────────────────────────
# Shared locals + naming. Environment-agnostic; everything that varies is read
# from variables so dev and prod come from one definition.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  name_prefix = "veldrix-${var.environment}"

  common_tags = [
    "veldrix",
    "env:${var.environment}",
    "managed-by:terraform",
  ]

  # The API + app hostnames as DNS record names relative to the root domain.
  # e.g. api.dev.veldrixai.ca with root veldrixai.ca -> record name "api.dev".
  api_record_name = trimsuffix(replace(var.api_host, ".${var.root_domain}", ""), ".")
  app_record_name = trimsuffix(replace(var.app_host, ".${var.root_domain}", ""), ".")
}
