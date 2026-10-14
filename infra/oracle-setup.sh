#!/usr/bin/env bash
# Bootstrap the CreatorOS control plane on a fresh Oracle Always Free
# Ubuntu (aarch64) VM. Run ON THE VM as the default user (not root):
#   bash oracle-setup.sh
# Safe to re-run. Installs: base tools, Docker, Node 22, uv, Tailscale.
# It does NOT log you in to Tailscale or store any keys; see the end.
set -euo pipefail

if [[ "$(uname -m)" != "aarch64" ]]; then
  echo "warning: expected aarch64 (Oracle Ampere A1), got $(uname -m)" >&2
fi
if [[ $EUID -eq 0 ]]; then
  echo "run as a normal sudo-capable user, not root" >&2
  exit 1
fi

echo "== base packages"
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl git gnupg jq tmux ufw unzip

echo "== docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi

echo "== node 22 (nodesource)"
if ! node --version 2>/dev/null | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "== uv (python manager)"
if ! command -v uv >/dev/null; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi

echo "== tailscale"
if ! command -v tailscale >/dev/null; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi

echo "== firewall: allow SSH only; reach everything else over Tailscale"
sudo ufw allow OpenSSH
sudo ufw --force enable

echo "== versions"
docker --version || true
node --version
"$HOME/.local/bin/uv" --version 2>/dev/null || uv --version || true
tailscale version | head -1

cat <<'EOF'

Next (manual, needs your login):
  1. sudo tailscale up           # open the printed URL to authorize this VM
  2. log out and back in so the docker group applies
  3. check the real Always Free allowance in the Oracle console
     (Compute > Instances > shape OCPU/memory) before sizing services
EOF
