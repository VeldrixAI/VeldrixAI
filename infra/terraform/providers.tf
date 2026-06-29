# Provider configuration. All credentials arrive via variables (never hardcoded,
# never committed) — see variables.tf and terraform.tfvars.example.

provider "digitalocean" {
  token = var.do_token
}

provider "vercel" {
  api_token = var.vercel_api_token
  team      = var.vercel_team_id != "" ? var.vercel_team_id : null
}
