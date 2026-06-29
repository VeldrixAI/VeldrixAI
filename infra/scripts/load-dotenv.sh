#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# load-dotenv.sh — safely load KEY=VALUE pairs from a dotenv file into the env.
#
# A .env file is DATA, not a shell script: values may contain spaces (e.g.
# EMAIL_FROM_NAME=VeldrixAI Dev), or +,/,= (base64 secrets). `source`-ing it runs
# such values as commands ("Dev: command not found"). This loader assigns each
# value literally — no word-splitting, globbing, or command execution.
#
#   source "$REPO_ROOT/infra/scripts/load-dotenv.sh"; load_dotenv "$ENV_FILE"
# ─────────────────────────────────────────────────────────────────────────────
load_dotenv() {
  local f="$1" line key val
  [[ -f "$f" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"                       # strip a trailing CR (CRLF files)
    [[ "$line" =~ ^[[:space:]]*# ]] && continue # comment
    [[ "$line" != *=* ]] && continue            # not a KEY=VALUE line
    key="${line%%=*}"; val="${line#*=}"
    key="${key//[[:space:]]/}"                  # trim whitespace around the key
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    val="${val%\"}"; val="${val#\"}"            # strip optional surrounding quotes
    val="${val%\'}"; val="${val#\'}"
    export "$key=$val"
  done < "$f"
}
