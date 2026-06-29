# ─────────────────────────────────────────────────────────────────────────────
# DNS — A records for the API gateway + frontend hosts, pointing at the droplet.
#
# Dev uses the mirrored subdomain scheme api.dev.veldrixai.ca / dev.veldrixai.ca
# (Phase 5 locked decision #1) so the Host()-pinned Traefik router contract is
# structurally identical to prod; only the host strings change.
#
# The DO DNS domain (the apex zone) is assumed to already exist for prod. We do
# NOT manage the apex `digitalocean_domain` here to avoid touching the prod zone
# resource — we only add records into it. (RECON constraint: do not modify prod.)
# ─────────────────────────────────────────────────────────────────────────────

# API gateway host -> droplet (e.g. api.dev.veldrixai.ca)
resource "digitalocean_record" "api" {
  domain = var.root_domain
  type   = "A"
  name   = local.api_record_name
  value  = digitalocean_droplet.veldrix.ipv4_address
  ttl    = 300
}

# Frontend host. In dev this points at the droplet too (the dev frontend can run
# on the droplet); when the frontend is served from Vercel instead, repoint this
# to a CNAME in the human apply step. Kept as an A record for parity with prod.
resource "digitalocean_record" "app" {
  domain = var.root_domain
  type   = "A"
  name   = local.app_record_name
  value  = digitalocean_droplet.veldrix.ipv4_address
  ttl    = 300
}
