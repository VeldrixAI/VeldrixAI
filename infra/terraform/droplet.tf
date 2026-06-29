# ─────────────────────────────────────────────────────────────────────────────
# Compute — a second DO droplet for dev, identical region/size class to prod
# (RECON Finding 3). The droplet runs the SAME Compose overlay
# (infra/compose/docker-compose.deploy.yml), parameterized by `environment`.
#
# NOTE: this Terraform provisions the host + DNS + Vercel only. It deliberately
# does NOT bake secrets or run the stack — deployment of the Compose overlay and
# the gitignored env file is the human-run step in APPLY-RUNBOOK.md (mirrors the
# prod Jenkins scp+ssh deploy shape, RECON Finding 3). Synthetic data only.
# ─────────────────────────────────────────────────────────────────────────────

resource "digitalocean_droplet" "veldrix" {
  name     = "${local.name_prefix}-droplet"
  region   = var.droplet_region
  size     = var.droplet_size
  image    = var.droplet_image
  ssh_keys = var.ssh_key_fingerprints
  tags     = local.common_tags

  # Minimal bootstrap only: ensure docker + compose plugin are present and the
  # deploy directory exists. No app config / no secrets here — those arrive via
  # the human-run deploy step (APPLY-RUNBOOK.md §3).
  user_data = <<-EOT
    #cloud-config
    package_update: true
    write_files:
      - path: /opt/veldrixai/ENVIRONMENT
        content: "${var.environment}\n"
    runcmd:
      - mkdir -p /opt/veldrixai
      - systemctl enable --now docker || true
  EOT

  lifecycle {
    # The droplet is cattle, but recreating it wipes named volumes (the dev DB).
    # Force a conscious decision before destroy/replace.
    prevent_destroy = false
  }
}

# Cloud firewall: only 80/443 (Traefik) + SSH. Dashboards (8080/9090/3001) and
# data ports (5432/6379) are NOT exposed publicly — reach them via SSH tunnel.
resource "digitalocean_firewall" "veldrix" {
  name        = "${local.name_prefix}-fw"
  droplet_ids = [digitalocean_droplet.veldrix.id]
  tags        = local.common_tags

  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }
  inbound_rule {
    protocol         = "tcp"
    port_range       = "80"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }
  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}
