#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p state
source .venv/bin/activate

nohup uvicorn src.tradingview_webhook_server:app --host 0.0.0.0 --port 8080 > state/webhook.log 2>&1 &
nohup env STREAMLIT_BROWSER_GATHER_USAGE_STATS=false streamlit run src/dashboard.py --server.port 8501 --server.address 0.0.0.0 --server.headless true > state/dashboard.log 2>&1 &

echo "Started webhook on :8080 and dashboard on :8501"
