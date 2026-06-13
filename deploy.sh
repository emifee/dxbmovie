#!/usr/bin/env bash
# =============================================================================
# DXBmovies.Ai — deploy to Oracle Cloud (emyAI)
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh
#
# Requirements (local):
#   - Node.js + npm installed
#   - SSH key that has access to the Oracle server
#   - .env.local filled in with real values
#
# What it does:
#   1. Builds the Next.js standalone output locally
#   2. rsyncs .next/standalone + static + public to the server
#   3. Copies .env.local to the server
#   4. Installs pm2 (if needed) and restarts the app
# =============================================================================

set -e

ORACLE_IP="193.123.67.157"
ORACLE_USER="ubuntu"
SSH_KEY="${HOME}/Downloads/ssh-key-2026-06-10.key"
REMOTE_DIR="/home/ubuntu/dxbmovies"

echo "▶  Building Next.js standalone output..."
npm run build

echo "▶  Syncing to Oracle ${ORACLE_IP}..."

# Create remote directory
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "${ORACLE_USER}@${ORACLE_IP}" \
  "mkdir -p ${REMOTE_DIR}/.next/static ${REMOTE_DIR}/public"

# Sync standalone server
rsync -az --delete -e "ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no" \
  .next/standalone/ "${ORACLE_USER}@${ORACLE_IP}:${REMOTE_DIR}/"

# Sync static assets (Next.js standalone doesn't include these)
rsync -az --delete -e "ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no" \
  .next/static/ "${ORACLE_USER}@${ORACLE_IP}:${REMOTE_DIR}/.next/static/"

# Sync public folder
rsync -az --delete -e "ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no" \
  public/ "${ORACLE_USER}@${ORACLE_IP}:${REMOTE_DIR}/public/"

# Copy env file
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no \
  .env.local "${ORACLE_USER}@${ORACLE_IP}:${REMOTE_DIR}/.env.local"

echo "▶  Restarting app on server..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "${ORACLE_USER}@${ORACLE_IP}" bash << 'REMOTE'
  set -e
  cd /home/ubuntu/dxbmovies

  # Install Node.js if missing
  if ! command -v node &>/dev/null; then
    echo "Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi

  # Install pm2 globally if missing
  if ! command -v pm2 &>/dev/null; then
    echo "Installing pm2..."
    sudo npm install -g pm2
  fi

  # Load env vars and start/restart
  export $(grep -v '^#' .env.local | xargs)

  # Stop existing process if running
  pm2 delete dxbmovies 2>/dev/null || true

  # Start fresh
  PORT=3000 pm2 start server.js --name dxbmovies \
    --env production \
    -- --env-file .env.local


  # Save pm2 list so it survives reboots
  pm2 save

  # Enable pm2 startup (only needed once, may prompt for sudo)
  pm2 startup systemd -u ubuntu --hp /home/ubuntu 2>/dev/null || true

  # ── Sonia push cron ────────────────────────────────────────────────────────
  # Runs daily at 18:00 UTC (20:00 Dubai time) — calls the secured cron endpoint.
  # Load CRON_SECRET from .env.local for the curl command.
  CRON_SECRET_VAL=$(grep '^CRON_SECRET=' /home/ubuntu/dxbmovies/.env.local | cut -d'=' -f2)
  CRON_CMD="curl -s -X GET http://localhost:3000/api/cron/sonia-push -H \"Authorization: Bearer ${CRON_SECRET_VAL}\" >> /home/ubuntu/dxbmovies/cron.log 2>&1"
  CRON_SCHEDULE="0 18 * * *"
  # Add to crontab only if not already there
  ( crontab -l 2>/dev/null | grep -v 'sonia-push'; echo "${CRON_SCHEDULE} ${CRON_CMD}" ) | crontab -
  echo "✅  Sonia push cron set for 18:00 UTC daily"

  echo "✅  App deployed at http://${ORACLE_IP}:3000"
REMOTE

echo ""
echo "✅  Deployment complete!"
echo "    App: http://${ORACLE_IP}:3000"
echo "    Logs: ssh ubuntu@${ORACLE_IP} 'pm2 logs dxbmovies'"
