#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "  _    _ _             ___  "
echo " | |  | (_)           / _ \ "
echo " | |__| |_ _ __  _ __| | | |"
echo " |  __  | | '_ \| '_ \ | | |"
echo " | |  | | | |_) | |_) | |_| |"
echo " |_|  |_|_| .__/| .__/ \___/ "
echo "           | |   | |          "
echo "           |_|   |_|          "
echo -e "${NC}"
echo "Hipp0 Installer v1.0"
echo "================================"
echo ""

echo -e "${BLUE}Checking prerequisites...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed.${NC}"
    echo "Install Docker first: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not installed.${NC}"
    echo "Install Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

if ! command -v git &> /dev/null; then
    echo -e "${RED}Error: Git is not installed.${NC}"
    echo "Install Git: sudo apt install git"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}Warning: jq is not installed. Installing...${NC}"
    sudo apt-get install -y jq 2>/dev/null || sudo yum install -y jq 2>/dev/null || true
fi

echo -e "${GREEN}All prerequisites met${NC}"
echo ""

INSTALL_DIR="${HIPP0_INSTALL_DIR:-/opt/hipp0}"
echo -e "${BLUE}Install directory: ${INSTALL_DIR}${NC}"

if [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}Directory already exists. Updating...${NC}"
    cd "$INSTALL_DIR"
    git pull origin main
else
    echo "Cloning Hipp0..."
    git clone https://github.com/perlantir/Hipp0.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

echo ""

echo -e "${BLUE}Configuration${NC}"
echo "============="
echo ""

if [ -f .env ] && grep -q "HIPP0" .env; then
    echo -e "${GREEN}Existing .env found — keeping current config${NC}"
    source .env 2>/dev/null || true
else
    cat > .env << ENVEOF
# Hipp0 Configuration
POSTGRES_PASSWORD=$(openssl rand -hex 16)
NODE_ENV=production
HIPP0_AUTH_REQUIRED=true
ENVEOF

    echo "Hipp0 can use an LLM for semantic search and auto-extraction."
    echo "This is optional — Hipp0 works without it."
    echo ""
    echo "Enter your OpenRouter API key (or press Enter to skip):"
    read -r OPENROUTER_KEY

    if [ -n "$OPENROUTER_KEY" ]; then
        echo "OPENROUTER_API_KEY=${OPENROUTER_KEY}" >> .env
    fi

    echo ""
    echo -e "${GREEN}Configuration saved to .env${NC}"
fi

echo ""

echo -e "${BLUE}Starting Hipp0...${NC}"
docker compose up -d --build 2>&1 | tail -5

echo ""
echo "Waiting for Hipp0 to start..."
MAX_WAIT=120
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if curl -s http://localhost:3100/api/health | grep -q '"ok"' 2>/dev/null; then
        break
    fi
    sleep 2
    WAITED=$((WAITED + 2))
    echo -n "."
done
echo ""

if [ $WAITED -ge $MAX_WAIT ]; then
    echo -e "${RED}Hipp0 did not start within ${MAX_WAIT}s${NC}"
    echo "Check logs: docker compose logs server"
    exit 1
fi

echo -e "${GREEN}Retrieving auto-generated API key...${NC}"
sleep 5
HIPP0_KEY=$(docker logs hipp0-server 2>&1 | grep "h0_live_" | head -1 | grep -o "h0_live_[a-f0-9]*")
if [ -n "$HIPP0_KEY" ]; then
  echo -e "  Your API key: ${YELLOW}${HIPP0_KEY}${NC}"
  echo -e "  ${RED}Save this key — it will NOT be shown again${NC}"
else
  echo -e "  ${YELLOW}API key generated. Retrieve it with:${NC}"
  echo "    docker logs hipp0-server 2>&1 | grep h0_live_"
fi

echo ""
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}  Hipp0 is running!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""

HEALTH=$(curl -s http://localhost:3100/api/health)
VERSION=$(echo "$HEALTH" | jq -r .version 2>/dev/null || echo "unknown")

echo -e "  API:        ${GREEN}http://localhost:3100${NC}"
echo -e "  Dashboard:  ${GREEN}http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'localhost'):3200${NC}"
echo -e "  Version:    ${VERSION}"

LOGS=$(docker compose logs server 2>/dev/null | tail -10)
if echo "$LOGS" | grep -q "Embeddings:.*via"; then
    EMB=$(echo "$LOGS" | grep "Embeddings:" | tail -1 | sed 's/.*Embeddings: //')
    echo -e "  Embeddings: ${GREEN}${EMB}${NC}"
else
    echo -e "  Embeddings: ${YELLOW}disabled (text search fallback)${NC}"
fi
if echo "$LOGS" | grep -q "Distillery:.*via"; then
    DIST=$(echo "$LOGS" | grep "Distillery:" | tail -1 | sed 's/.*Distillery: //')
    echo -e "  Distillery: ${GREEN}${DIST}${NC}"
else
    echo -e "  Distillery: ${YELLOW}disabled (manual recording only)${NC}"
fi

echo ""
echo -e "  ${BLUE}Open the dashboard to set up your first project:${NC}"
echo -e "  ${GREEN}http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'localhost'):3200${NC}"
echo ""
echo ""
echo "  Docs:  https://github.com/perlantir/Hipp0/blob/main/docs/getting-started.md"
echo ""
