#!/usr/bin/env bash
# ================================================================
# VeldrixAI — Complete Droplet Setup
# Run as: deploy user with sudo access
# Droplet: Ubuntu 24.04 LTS | 2vCPU | 8GB | NYC3
# Services: Docker, nginx, Jenkins, certbot, Git, /opt/veldrixai
# ================================================================
set -euo pipefail

# ── CONFIGURATION — edit these before running ────────────────────
DOMAIN_API="api.veldrixai.ca"
DOMAIN_JENKINS="jenkins.veldrixai.ca"   # internal, optional
DEPLOY_USER="deploy"
VELDRIX_DIR="/opt/veldrixai"
GH_REPO="https://github.com/YOUR_ORG/YOUR_REPO.git"   # fill in
CERTBOT_EMAIL="your@email.com"                         # fill in
# ────────────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[⚠]${NC} $1"; }
info() { echo -e "${CYAN}[→]${NC} $1"; }
fail() { echo -e "${RED}[✗]${NC} $1"; exit 1; }
section() {
  echo ""
  echo -e "${BOLD}${CYAN}══════════════════════════════════════════${NC}"
  echo -e "${BOLD}${CYAN}  $1${NC}"
  echo -e "${BOLD}${CYAN}══════════════════════════════════════════${NC}"
}

# ── Verify running as deploy, not root ──────────────────────────
if [ "$EUID" -eq 0 ]; then
  fail "Run as deploy user with sudo, not as root directly"
fi

echo ""
echo -e "${BOLD}VeldrixAI — Complete Droplet Setup${NC}"
echo -e "Droplet: $(hostname) | $(date)"
echo ""


# ════════════════════════════════════════════════════════════════
section "1 / 9  System packages"
# ════════════════════════════════════════════════════════════════

sudo apt-get update -qq
sudo apt-get upgrade -y -qq

sudo apt-get install -y -qq \
  curl wget git unzip nano htop tmux jq \
  ca-certificates gnupg lsb-release \
  software-properties-common apt-transport-https \
  ufw fail2ban \
  build-essential \
  python3 python3-pip python3-venv \
  postgresql-client \
  net-tools dnsutils \
  logrotate

log "System packages installed"


# ════════════════════════════════════════════════════════════════
section "2 / 9  Docker Engine + Compose plugin"
# ════════════════════════════════════════════════════════════════

if command -v docker &>/dev/null; then
  warn "Docker already installed — $(docker --version) — skipping"
else
  info "Adding Docker GPG key and repository..."
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc

  echo \
    "deb [arch=$(dpkg --print-architecture) \
    signed-by=/etc/apt/keyrings/docker.asc] \
    https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

  sudo apt-get update -qq
  sudo apt-get install -y -qq \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin

  sudo systemctl enable docker
  sudo systemctl start docker
  log "Docker $(docker --version | cut -d' ' -f3 | tr -d ',') installed"
  log "Docker Compose $(docker compose version --short) installed"
fi

# Add deploy user to docker group
sudo usermod -aG docker $DEPLOY_USER
log "deploy user added to docker group"

# Docker daemon tuning for production
sudo tee /etc/docker/daemon.json > /dev/null << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "5"
  },
  "default-ulimits": {
    "nofile": {
      "Name": "nofile",
      "Hard": 65536,
      "Soft": 65536
    }
  },
  "live-restore": true
}
EOF

sudo systemctl restart docker
log "Docker daemon configured (log rotation + ulimits + live-restore)"


# ════════════════════════════════════════════════════════════════
section "3 / 9  nginx"
# ════════════════════════════════════════════════════════════════

sudo apt-get install -y -qq nginx
sudo systemctl enable nginx
sudo systemctl start nginx
log "nginx installed and running"

# Remove default site
sudo rm -f /etc/nginx/sites-enabled/default

# ── api.veldrixai.ca reverse proxy ──────────────────────────────
sudo tee /etc/nginx/sites-available/veldrix-api > /dev/null << EOF
# VeldrixAI API — reverse proxy to three FastAPI services
# auth → 8000 | core → 8001 | connectors → 8002

upstream aegisai_auth {
    server 127.0.0.1:8000;
    keepalive 32;
}
upstream aegisai_core {
    server 127.0.0.1:8001;
    keepalive 32;
}
upstream aegisai_connectors {
    server 127.0.0.1:8002;
    keepalive 32;
}

# HTTP → HTTPS redirect (certbot will manage this block)
server {
    listen 80;
    server_name ${DOMAIN_API};

    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://\$host\$request_uri; }
}

# HTTPS — main API server
server {
    listen 443 ssl http2;
    server_name ${DOMAIN_API};

    # SSL — certbot will populate these
    ssl_certificate     /etc/letsencrypt/live/${DOMAIN_API}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN_API}/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header X-Frame-Options           DENY;
    add_header X-Content-Type-Options    nosniff;
    add_header X-XSS-Protection          "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";
    add_header Referrer-Policy           "strict-origin-when-cross-origin";

    # CORS for Vercel frontend
    add_header Access-Control-Allow-Origin  "https://app.veldrixai.ca" always;
    add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Authorization, Content-Type, X-API-Key" always;

    # Preflight
    if (\$request_method = OPTIONS) { return 204; }

    # ── Auth service — /auth/* ────────────────────────────
    location /auth/ {
        proxy_pass         http://aegisai_auth/;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_set_header   Connection        "";
        proxy_read_timeout 30s;
    }

    # ── Core service — /evaluate /health /audit /reports ─
    location ~ ^/(evaluate|health|audit|reports|pillars|policy)/ {
        proxy_pass         http://aegisai_core;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_set_header   Connection        "";
        proxy_read_timeout 60s;

        # SSE — audit trail streaming needs long-lived connection
        proxy_buffering    off;
        proxy_cache        off;
    }

    # ── Connectors service — /connectors/* ───────────────
    location /connectors/ {
        proxy_pass         http://aegisai_connectors/;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_set_header   Connection        "";
        proxy_read_timeout 30s;
    }

    # ── Bare /health — hits core directly ────────────────
    location = /health {
        proxy_pass http://aegisai_core/health;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }

    # Timeouts
    client_max_body_size 10M;
    keepalive_timeout    65;
}
EOF

sudo ln -sf /etc/nginx/sites-available/veldrix-api \
            /etc/nginx/sites-enabled/veldrix-api

# ── Temporary HTTP-only config for certbot (before TLS exists) ──
sudo tee /etc/nginx/sites-available/veldrix-api-temp > /dev/null << EOF
server {
    listen 80;
    server_name ${DOMAIN_API};
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 200 "VeldrixAI pre-TLS OK"; }
}
EOF

# Validate nginx config
sudo nginx -t
log "nginx configured for ${DOMAIN_API}"


# ════════════════════════════════════════════════════════════════
section "4 / 9  Certbot (Let's Encrypt TLS)"
# ════════════════════════════════════════════════════════════════

sudo apt-get install -y -qq certbot python3-certbot-nginx
sudo mkdir -p /var/www/certbot

# Enable temp config so certbot can hit the ACME challenge
sudo ln -sf /etc/nginx/sites-available/veldrix-api-temp \
            /etc/nginx/sites-enabled/veldrix-api-temp 2>/dev/null || true
sudo nginx -t && sudo systemctl reload nginx

info "Requesting TLS certificate for ${DOMAIN_API}..."
info "IMPORTANT: DNS A record for ${DOMAIN_API} must point to this droplet IP"
info "If DNS is not propagated yet, skip with Ctrl+C and run manually later:"
info "  sudo certbot --nginx -d ${DOMAIN_API} --non-interactive --agree-tos -m ${CERTBOT_EMAIL}"

sudo certbot --nginx \
  -d "${DOMAIN_API}" \
  --non-interactive \
  --agree-tos \
  --email "${CERTBOT_EMAIL}" \
  --redirect || warn "Certbot failed — DNS may not be propagated yet. Run manually after DNS is live."

# Remove temp config, enable real config
sudo rm -f /etc/nginx/sites-enabled/veldrix-api-temp

# Auto-renewal cron
(sudo crontab -l 2>/dev/null; \
  echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") \
  | sudo crontab -
log "Certbot auto-renewal cron set (3AM daily)"


# ════════════════════════════════════════════════════════════════
section "5 / 9  Java 21 + Jenkins LTS"
# ════════════════════════════════════════════════════════════════

# Java 21
if java -version 2>&1 | grep -q "21"; then
  warn "Java 21 already installed — skipping"
else
  info "Installing Java 21..."
  sudo apt-get install -y -qq openjdk-21-jdk
  log "Java $(java -version 2>&1 | head -1)"
fi

# Jenkins LTS
if command -v jenkins &>/dev/null || systemctl list-units --type=service | grep -q jenkins; then
  warn "Jenkins already installed — skipping"
else
  info "Adding Jenkins repository..."
  sudo wget -O /usr/share/keyrings/jenkins-keyring.asc \
    https://pkg.jenkins.io/debian-stable/jenkins.io-2023.key
  echo "deb [signed-by=/usr/share/keyrings/jenkins-keyring.asc] \
    https://pkg.jenkins.io/debian-stable binary/" \
    | sudo tee /etc/apt/sources.list.d/jenkins.list > /dev/null

  sudo apt-get update -qq
  sudo apt-get install -y -qq jenkins

  sudo systemctl enable jenkins
  sudo systemctl start jenkins
  log "Jenkins LTS installed and running on port 8080"
fi

# Critical: add Jenkins to docker group so it can run docker commands
sudo usermod -aG docker jenkins

# Give Jenkins access to deploy directories
sudo usermod -aG deploy jenkins 2>/dev/null || true

log "Jenkins added to docker group"

# ── Jenkins nginx proxy (internal — not exposed publicly) ────────
sudo tee /etc/nginx/sites-available/veldrix-jenkins > /dev/null << EOF
# Jenkins — internal access at jenkins.${DOMAIN_API#api.}
# Restrict to your IP by adding: allow YOUR_IP; deny all;
server {
    listen 80;
    server_name ${DOMAIN_JENKINS};

    location / {
        proxy_pass         http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;

        # Jenkins CSRF requires this
        proxy_set_header   Referer           http://127.0.0.1:8080;
        proxy_read_timeout 90s;

        # WebSocket for Jenkins terminal
        proxy_set_header   Upgrade           \$http_upgrade;
        proxy_set_header   Connection        "upgrade";
    }
}
EOF

# UFW — block Jenkins port from internet, only nginx can reach it
sudo ufw deny 8080/tcp comment "Jenkins — internal only via nginx"
log "Jenkins port 8080 blocked from internet (nginx proxy only)"

info "Jenkins initial admin password:"
sudo cat /var/lib/jenkins/secrets/initialAdminPassword 2>/dev/null \
  || warn "Password file not ready yet — check: sudo cat /var/lib/jenkins/secrets/initialAdminPassword"


# ════════════════════════════════════════════════════════════════
section "6 / 9  /opt/veldrixai directory structure"
# ════════════════════════════════════════════════════════════════

sudo mkdir -p ${VELDRIX_DIR}/{secrets,logs,data,backups,nginx}

# Ownership — deploy user runs docker compose
sudo chown -R $DEPLOY_USER:$DEPLOY_USER ${VELDRIX_DIR}

# Permissions — secrets dir locked down
chmod 750 ${VELDRIX_DIR}
chmod 700 ${VELDRIX_DIR}/secrets
chmod 755 ${VELDRIX_DIR}/logs
chmod 755 ${VELDRIX_DIR}/data
chmod 755 ${VELDRIX_DIR}/backups

log "Directory structure created at ${VELDRIX_DIR}"

# ── Stub out .env files ──────────────────────────────────────────
# Fill in real values after this script completes

tee ${VELDRIX_DIR}/secrets/auth.env > /dev/null << 'ENVEOF'
# aegisai-auth environment
DATABASE_URL=postgresql://veldrix_user:CHANGE_ME@localhost:5433/veldrix_auth
SECRET_KEY=CHANGE_ME_32_CHAR_MINIMUM
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7
STRIPE_SECRET_KEY=sk_live_CHANGE_ME
STRIPE_WEBHOOK_SECRET=whsec_CHANGE_ME
ENVIRONMENT=production
ENVEOF

tee ${VELDRIX_DIR}/secrets/core.env > /dev/null << 'ENVEOF'
# aegisai-core environment
DATABASE_URL=postgresql://veldrix_user:CHANGE_ME@localhost:5433/veldrix_core
AUTH_SERVICE_URL=http://aegisai-auth:8000
NVIDIA_API_KEY=nvapi-CHANGE_ME
GROQ_API_KEY=gsk_CHANGE_ME
GROQ_MODEL=llama-3.3-70b-versatile
NIM_BASE_URL=https://integrate.api.nvidia.com/v1
CIRCUIT_BREAKER_TIMEOUT=3.0
REALTIME_SLA_MS=200
STANDARD_SLA_MS=600
ENVIRONMENT=production
ENVEOF

tee ${VELDRIX_DIR}/secrets/connectors.env > /dev/null << 'ENVEOF'
# aegisai-connectors environment
DATABASE_URL=postgresql://veldrix_user:CHANGE_ME@localhost:5433/veldrix_connectors
AUTH_SERVICE_URL=http://aegisai-auth:8000
CORE_SERVICE_URL=http://aegisai-core:8001
ENVIRONMENT=production
ENVEOF

tee ${VELDRIX_DIR}/secrets/frontend.env > /dev/null << 'ENVEOF'
# Frontend environment (Vercel — keep in sync)
NEXT_PUBLIC_VELDRIX_CORE_API_URL=https://api.veldrixai.ca
NEXT_PUBLIC_VELDRIX_AUTH_URL=https://api.veldrixai.ca/auth
ENVIRONMENT=production
ENVEOF

chmod 600 ${VELDRIX_DIR}/secrets/*.env
log "Secret stubs created in ${VELDRIX_DIR}/secrets/ — fill in real values now"


# ════════════════════════════════════════════════════════════════
section "7 / 9  Git configuration"
# ════════════════════════════════════════════════════════════════

git config --global user.name  "VeldrixAI Deploy"
git config --global user.email "deploy@veldrixai.ca"
git config --global init.defaultBranch main
git config --global pull.rebase false

# Generate deploy SSH key for GitHub Actions / Jenkins pulls
if [ ! -f /home/$DEPLOY_USER/.ssh/id_ed25519_deploy ]; then
  ssh-keygen -t ed25519 \
    -C "deploy@veldrixai.ca" \
    -f /home/$DEPLOY_USER/.ssh/id_ed25519_deploy \
    -N ""
  log "Deploy SSH keypair generated"
  echo ""
  warn "Add this public key to GitHub → Settings → Deploy Keys:"
  echo "────────────────────────────────────────────────────────"
  cat /home/$DEPLOY_USER/.ssh/id_ed25519_deploy.pub
  echo "────────────────────────────────────────────────────────"
  echo ""
else
  warn "Deploy SSH key already exists — skipping"
fi

# Configure SSH to use deploy key for GitHub
tee /home/$DEPLOY_USER/.ssh/config > /dev/null << 'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_deploy
  StrictHostKeyChecking accept-new
EOF
chmod 600 /home/$DEPLOY_USER/.ssh/config

# Clone or update the repo
if [ -d "${VELDRIX_DIR}/repo/.git" ]; then
  warn "Repo already exists — pulling latest"
  cd ${VELDRIX_DIR}/repo && git pull origin main
else
  info "Cloning VeldrixAI repository..."
  git clone "${GH_REPO}" ${VELDRIX_DIR}/repo || \
    warn "Clone failed — update GH_REPO variable or add deploy key to GitHub first"
fi

log "Git configured"


# ════════════════════════════════════════════════════════════════
section "8 / 9  Jenkins SSH deploy credential setup instructions"
# ════════════════════════════════════════════════════════════════

# Generate the Jenkins → droplet deploy SSH key
# Jenkins uses this to SSH back into the droplet for deploy stage
if [ ! -f /home/$DEPLOY_USER/.ssh/id_ed25519_jenkins ]; then
  ssh-keygen -t ed25519 \
    -C "jenkins-deploy@veldrixai.ca" \
    -f /home/$DEPLOY_USER/.ssh/id_ed25519_jenkins \
    -N ""

  # Trust this key for deploy user login (Jenkins SSHing to localhost)
  cat /home/$DEPLOY_USER/.ssh/id_ed25519_jenkins.pub \
    >> /home/$DEPLOY_USER/.ssh/authorized_keys
  chmod 600 /home/$DEPLOY_USER/.ssh/authorized_keys

  log "Jenkins deploy SSH keypair generated"
fi

echo ""
info "══ Jenkins setup steps (do these in the Jenkins UI) ══════"
echo ""
echo "  1. Open:  http://<droplet-ip>:8080"
echo "     OR after DNS: http://${DOMAIN_JENKINS}"
echo ""
echo "  2. Unlock Jenkins with the admin password shown above"
echo "     (or: sudo cat /var/lib/jenkins/secrets/initialAdminPassword)"
echo ""
echo "  3. Install suggested plugins + these additional ones:"
echo "     - Pipeline"
echo "     - Git"
echo "     - GitHub Integration"
echo "     - SSH Agent"
echo "     - Docker Pipeline"
echo "     - Credentials Binding"
echo "     - Blue Ocean (optional but recommended)"
echo ""
echo "  4. Add the Jenkins deploy private key as a credential:"
echo "     Manage Jenkins → Credentials → Global → Add Credential"
echo "     Kind:        SSH Username with Private Key"
echo "     ID:          veldrix-deploy-key   ← must match Jenkinsfile"
echo "     Username:    deploy"
echo "     Private Key: paste contents of:"
echo ""
echo "     $(cat /home/$DEPLOY_USER/.ssh/id_ed25519_jenkins)"
echo ""
echo "  5. Add secret text credentials for API keys:"
echo "     ID: nvidia-api-key     → your NVIDIA NIM key"
echo "     ID: groq-api-key       → your Groq API key"
echo "     ID: pypi-api-token     → PyPI token for SDK publish"
echo ""
echo "  6. Create a Pipeline job:"
echo "     New Item → Pipeline → Pipeline from SCM"
echo "     SCM: Git"
echo "     Repo URL: ${GH_REPO}"
echo "     Credentials: (the deploy SSH key above)"
echo "     Branch: */main"
echo "     Script Path: Jenkinsfile"
echo ""
echo "  7. Add GitHub webhook:"
echo "     GitHub repo → Settings → Webhooks → Add webhook"
echo "     Payload URL: http://<droplet-ip>:8080/github-webhook/"
echo "     Content type: application/json"
echo "     Trigger: Just the push event"
echo ""


# ════════════════════════════════════════════════════════════════
section "9 / 9  Log rotation + health cron + final checks"
# ════════════════════════════════════════════════════════════════

# Logrotate for Docker container logs
sudo tee /etc/logrotate.d/veldrix-docker > /dev/null << 'EOF'
/opt/veldrixai/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
EOF

# Health check cron — pings all three services every 5 min
# Writes to log, can be wired to alerting later
tee /home/$DEPLOY_USER/healthcheck.sh > /dev/null << 'EOF'
#!/bin/bash
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
LOG="/opt/veldrixai/logs/healthcheck.log"
SERVICES=("8000:auth" "8001:core" "8002:connectors")
ALL_OK=true

for entry in "${SERVICES[@]}"; do
  PORT="${entry%%:*}"
  NAME="${entry##*:}"
  STATUS=$(curl -sf -o /dev/null -w "%{http_code}" http://localhost:$PORT/health 2>/dev/null || echo "000")
  if [ "$STATUS" = "200" ]; then
    echo "$TIMESTAMP ✓ $NAME (:$PORT) OK" >> "$LOG"
  else
    echo "$TIMESTAMP ✗ $NAME (:$PORT) FAILED (HTTP $STATUS)" >> "$LOG"
    ALL_OK=false
  fi
done

if [ "$ALL_OK" = false ]; then
  echo "$TIMESTAMP ALERT: one or more services unhealthy" >> "$LOG"
fi
EOF
chmod +x /home/$DEPLOY_USER/healthcheck.sh

# Install health cron (every 5 minutes)
(crontab -l 2>/dev/null; \
  echo "*/5 * * * * /home/$DEPLOY_USER/healthcheck.sh") \
  | crontab -
log "Health check cron installed (every 5 min → /opt/veldrixai/logs/healthcheck.log)"

# Reload nginx with final config
sudo nginx -t && sudo systemctl reload nginx
log "nginx reloaded with final configuration"

# UFW final state
sudo ufw status verbose


# ════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  Setup Complete — Post-install checklist              ${NC}"
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${YELLOW}Fill in secrets (do this now):${NC}"
echo "  nano ${VELDRIX_DIR}/secrets/auth.env"
echo "  nano ${VELDRIX_DIR}/secrets/core.env"
echo "  nano ${VELDRIX_DIR}/secrets/connectors.env"
echo ""
echo -e "  ${YELLOW}Add deploy public key to GitHub:${NC}"
echo "  cat ~/.ssh/id_ed25519_deploy.pub"
echo "  GitHub → repo → Settings → Deploy Keys → Add"
echo ""
echo -e "  ${YELLOW}If certbot failed (DNS not ready):${NC}"
echo "  sudo certbot --nginx -d ${DOMAIN_API} --agree-tos -m ${CERTBOT_EMAIL}"
echo ""
echo -e "  ${YELLOW}Jenkins UI:${NC}"
echo "  http://$(curl -sf ifconfig.me 2>/dev/null || echo '<droplet-ip>'):8080"
echo "  Password: sudo cat /var/lib/jenkins/secrets/initialAdminPassword"
echo ""
echo -e "  ${YELLOW}First deploy (run after secrets are filled in):${NC}"
echo "  cd ${VELDRIX_DIR}/repo"
echo "  docker compose -f docker-compose.prod.yml pull"
echo "  docker compose -f docker-compose.prod.yml up -d --no-deps aegisai-auth"
echo "  sleep 10 && curl -sf http://localhost:8000/health"
echo "  docker compose -f docker-compose.prod.yml up -d --no-deps aegisai-core"
echo "  sleep 10 && curl -sf http://localhost:8001/health"
echo "  docker compose -f docker-compose.prod.yml up -d --no-deps aegisai-connectors"
echo "  sleep 10 && curl -sf http://localhost:8002/health"
echo ""
echo -e "  ${YELLOW}Smoke test URLs:${NC}"
echo "  curl -sf https://${DOMAIN_API}/health"
echo "  curl -sf https://app.veldrixai.ca"
echo ""
echo -e "${BOLD}${GREEN}  VeldrixAI droplet is ready for deployment${NC}"
echo ""
