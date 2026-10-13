#!/bin/zsh
# Start the P13 backend (FastAPI :8000) and frontend (Vite :5173) together.
# Usage: ./run-dev.sh   (Ctrl+C stops both)
set -e
cd "$(dirname "$0")"
PYTHON=/Users/hennessy/.workbuddy/binaries/python/envs/default/bin/python
export PATH="/Users/hennessy/.workbuddy/binaries/node/versions/22.12.0/bin:$PATH"
trap 'kill $(jobs -p) 2>/dev/null' EXIT INT TERM
(cd backend && $PYTHON -m uvicorn app.main:app --reload --port 8000) &
cd frontend && exec npx vite
