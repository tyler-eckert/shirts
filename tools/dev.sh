#!/usr/bin/env bash
# Local preview for macOS. Usage: ./tools/dev.sh
# Serves the public/ folder. It talks to your real Supabase project, same as the live site.
set -euo pipefail
cd "$(dirname "$0")/../public"

PORT="${PORT:-8000}"
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"

echo
echo "  Local:   http://localhost:${PORT}"
[[ -n "$LAN_IP" ]] && echo "  iPhone:  http://${LAN_IP}:${PORT}   (same Wi-Fi)"
echo "  Stop with Ctrl+C"
echo
exec python3 -m http.server "$PORT" --bind 0.0.0.0
