output "environment" {
  description = "The environment this state manages."
  value       = var.environment
}

output "droplet_ipv4" {
  description = "Public IPv4 of the droplet — target for the deploy (scp/ssh) step."
  value       = digitalocean_droplet.veldrix.ipv4_address
}

output "api_url" {
  description = "Public API gateway URL."
  value       = "https://${var.api_host}"
}

output "app_url" {
  description = "Public frontend URL."
  value       = "https://${var.app_host}"
}

output "vercel_project_id" {
  description = "Vercel project id for the frontend."
  value       = vercel_project.frontend.id
}

# Convenience: the exact deploy target the human uses in APPLY-RUNBOOK.md §3.
output "deploy_target" {
  description = "SSH deploy target (root@<droplet-ip>) for the Compose overlay push."
  value       = "root@${digitalocean_droplet.veldrix.ipv4_address}"
}
