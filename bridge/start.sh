#!/bin/bash
# Chạy cầu nối + mở đường vào bằng Cloudflare Tunnel. Dùng: bash bridge/start.sh
cd "$(dirname "$0")" || exit 1
ENV_FILE="bridge.env"

if [ ! -f "$ENV_FILE" ]; then
  KEY=$(openssl rand -hex 16)
  {
    echo "BRIDGE_KEY=$KEY"
    echo "ALLOWED_ORIGINS=https://clipflow-hva.lovable.app,https://clear-calm-web-experience.lovable.app"
  } > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi
set -a; . "./$ENV_FILE"; set +a

echo "Khóa cầu nối (nhập vào web, đừng gửi cho ai): $BRIDGE_KEY"
echo "Đang mở cầu nối. Đợi dòng https://....trycloudflare.com rồi dán vào web."
node server.mjs &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null' EXIT
cloudflared tunnel --url "http://127.0.0.1:${BRIDGE_PORT:-8787}"
