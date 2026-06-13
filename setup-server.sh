#!/usr/bin/env bash
# =============================================================================
# DXBmovies.Ai — one-time Oracle server setup
# Run this ONCE before the first deploy.
#
# Usage:
#   chmod +x setup-server.sh
#   ./setup-server.sh
# =============================================================================

ORACLE_IP="193.123.67.157"
ORACLE_USER="ubuntu"
SSH_KEY="${HOME}/Downloads/ssh-key-2026-06-10.key"

echo "▶  Setting up Oracle server ${ORACLE_IP}..."

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "${ORACLE_USER}@${ORACLE_IP}" bash << 'REMOTE'
  set -e

  echo "→ Updating packages..."
  sudo apt-get update -q

  echo "→ Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs

  echo "→ Installing pm2..."
  sudo npm install -g pm2

  echo "→ Opening port 3000 in Ubuntu firewall (iptables)..."
  # Oracle Ubuntu images use iptables, not ufw by default
  sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT
  sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
  sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT

  # Persist iptables rules across reboots
  sudo apt-get install -y iptables-persistent -q
  sudo netfilter-persistent save

  echo "→ Verifying Node.js..."
  node --version
  npm --version
  pm2 --version

  echo ""
  echo "✅  Server setup complete!"
REMOTE

echo ""
echo "✅  Server ready."
echo "    Now fill in .env.local and run: ./deploy.sh"
echo ""
echo "⚠️  IMPORTANT: Also open port 3000 in OCI Security List:"
echo "    OCI Console → Networking → Virtual Cloud Networks → vcn-20250711-0727"
echo "    → Security Lists → Default → Add Ingress Rule:"
echo "    Source CIDR: 0.0.0.0/0  |  Protocol: TCP  |  Port: 3000"
