#!/bin/bash
# ============================================
# WaZhop DXB Cinema — deploy to Oracle Cloud
#
# Replaces deploy.sh for any machine without rsync (Git Bash on Windows has
# none, which is every machine the agent team runs on). Same destination, same
# pm2 processes, same result — the transport is tar over ssh instead.
#
#   ./scripts/deploy-cinema.sh            # interactive, prompts before acting
#   ./scripts/deploy-cinema.sh --yes      # no prompts
#   CINEMA_AUTO_DEPLOY=1 ./scripts/deploy-cinema.sh
#
# Goes unattended automatically when stdin is not a TTY, so an agent or CI job
# does not have to know to pass a flag. Exits non-zero if the deploy fails or
# the site does not come back healthy, and restores the previous release from
# the backup it takes first.
#
# WHY IT DOES NOT SHIP .env.local, unlike deploy.sh. That file holds production
# secrets and the server's copy is authoritative. Overwriting it from a
# developer machine is how a stale local copy silently reverts live config —
# and it is exactly what reverted NEXTAUTH_URL during the domain move. Change
# server config on the server.
#
# WHY IT RECREATES pm2 RATHER THAN RESTARTING. deploy.sh exports every key from
# .env.local into the shell before `pm2 start`, so pm2 stores those values in
# its own process env. `pm2 restart --update-env` re-reads THAT store, not the
# file, so a config change plus a restart leaves the old value running. Delete
# and start is the only thing that reliably picks up .env.local.
# ============================================

set -euo pipefail

SSH_HOST="${CINEMA_SSH_HOST:-cinema-server}"
REMOTE_DIR="${CINEMA_REMOTE_DIR:-/home/ubuntu/dxbmovies}"
HEALTH_URL="${CINEMA_HEALTH_URL:-https://cinema.wazhop.com/}"
HEALTH_ATTEMPTS="${CINEMA_HEALTH_ATTEMPTS:-6}"
HEALTH_WAIT="${CINEMA_HEALTH_WAIT:-10}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

# No TTY means nobody can answer a prompt; blocking forever is the worst outcome.
ASSUME_YES=0
if [ "${1:-}" = "--yes" ] || [ "${CINEMA_AUTO_DEPLOY:-}" = "1" ] || [ ! -t 0 ]; then
    ASSUME_YES=1
fi

confirm() {
    [ "$ASSUME_YES" = "1" ] && return 0
    read -r -p "$1 [y/N] " reply
    case "$reply" in [yY]*) return 0 ;; *) echo "Aborted."; exit 1 ;; esac
}

# Fail early with an actionable message rather than a raw ssh error deep in the run.
echo -e "${YELLOW}🔑 Checking SSH access to ${SSH_HOST}...${NC}"
if ! ssh -o BatchMode=yes -o ConnectTimeout=15 "$SSH_HOST" 'true' 2>/dev/null; then
    echo -e "${RED}✖ Cannot reach ${SSH_HOST} over SSH.${NC}"
    echo "  Expected a Host entry named '${SSH_HOST}' in ~/.ssh/config pointing at"
    echo "  the Oracle box with IdentityFile ~/.ssh/cinema-key."
    exit 1
fi

# The build needs .env.local present because NEXT_PUBLIC_* values are inlined at
# build time. It is NOT uploaded — see the header.
if [ ! -f .env.local ]; then
    echo -e "${RED}✖ .env.local is missing.${NC}"
    echo "  next build inlines NEXT_PUBLIC_* at build time, so building without it"
    echo "  ships a bundle with those values empty (push notifications break)."
    exit 1
fi

confirm "Deploy $(git rev-parse --short HEAD) to ${SSH_HOST}:${REMOTE_DIR}?"

echo -e "${YELLOW}🏗  Step 1: Building standalone output...${NC}"
npm run build

if [ ! -d .next/standalone ]; then
    echo -e "${RED}✖ .next/standalone missing — next.config.js must set output:'standalone'.${NC}"
    exit 1
fi

# The rollback target. Taken before anything changes, or there is nothing to
# roll back to. node_modules is excluded: it is reinstalled on the box anyway
# and would make the archive enormous.
echo -e "${YELLOW}💾 Step 2: Backing up the current release...${NC}"
BACKUP=$(ssh -o BatchMode=yes "$SSH_HOST" "
    set -e
    TS=\$(date +%Y%m%d-%H%M%S)
    tar --exclude=node_modules -czf /home/ubuntu/cinema-backup-\$TS.tar.gz -C /home/ubuntu \$(basename ${REMOTE_DIR}) 2>/dev/null
    echo /home/ubuntu/cinema-backup-\$TS.tar.gz
")
echo "   Backup: $BACKUP"

echo -e "${YELLOW}📦 Step 3: Uploading build...${NC}"
tar -czf - --exclude=node_modules -C .next/standalone . \
    | ssh -o BatchMode=yes "$SSH_HOST" "tar -xzf - -C ${REMOTE_DIR}"
tar -czf - -C .next/static . \
    | ssh -o BatchMode=yes "$SSH_HOST" "mkdir -p ${REMOTE_DIR}/.next/static && tar -xzf - -C ${REMOTE_DIR}/.next/static"
tar -czf - -C public . \
    | ssh -o BatchMode=yes "$SSH_HOST" "mkdir -p ${REMOTE_DIR}/public && tar -xzf - -C ${REMOTE_DIR}/public"
tar -czf - -C scripts . \
    | ssh -o BatchMode=yes "$SSH_HOST" "mkdir -p ${REMOTE_DIR}/scripts && tar -xzf - -C ${REMOTE_DIR}/scripts"
scp -o BatchMode=yes package.json package-lock.json "${SSH_HOST}:${REMOTE_DIR}/" >/dev/null

echo -e "${YELLOW}🔄 Step 4: Installing dependencies and recreating pm2...${NC}"
ssh -o BatchMode=yes "$SSH_HOST" "
    set -e
    cd ${REMOTE_DIR}
    npm install --production --force 2>&1 | tail -3
    set -a; . ./.env.local; set +a
    pm2 delete dxbmovies 2>/dev/null || true
    pm2 delete dxbmovies-worker 2>/dev/null || true
    PORT=3000 HOSTNAME=0.0.0.0 pm2 start server.js --name dxbmovies --node-args='--env-file=.env.local'
    pm2 start scripts/worker.js --name dxbmovies-worker --node-args='--env-file=.env.local'
    pm2 save >/dev/null
"

echo -e "${YELLOW}🌐 Step 5: Health check (${HEALTH_ATTEMPTS} attempts, ${HEALTH_WAIT}s apart)...${NC}"
HEALTHY=0
for i in $(seq 1 "$HEALTH_ATTEMPTS"); do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$HEALTH_URL" || echo "000")
    if [ "$CODE" = "200" ]; then HEALTHY=1; echo "   attempt $i: 200 OK"; break; fi
    echo "   attempt $i: $CODE"
    sleep "$HEALTH_WAIT"
done

if [ "$HEALTHY" != "1" ]; then
    echo -e "${RED}✖ Health check failed — rolling back to ${BACKUP}${NC}"
    ssh -o BatchMode=yes "$SSH_HOST" "
        set -e
        cd /home/ubuntu
        tar -xzf ${BACKUP} -C /home/ubuntu
        cd ${REMOTE_DIR}
        set -a; . ./.env.local; set +a
        pm2 delete dxbmovies 2>/dev/null || true
        PORT=3000 HOSTNAME=0.0.0.0 pm2 start server.js --name dxbmovies --node-args='--env-file=.env.local'
        pm2 save >/dev/null
    "
    echo -e "${RED}Rolled back. Deploy failed.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Deployed and healthy: ${HEALTH_URL}${NC}"
echo "   Backup kept at ${BACKUP}"
