#!/usr/bin/env bash
#
# Build the React frontend and stage it into backend/static so that the
# FastAPI process can serve the API and the SPA from a single port.
#
# NOTE: the staged directory MUST be named `static`. The publish/deploy step
# excludes conventional build-output directories by name (`dist`, `build`),
# so staging into `backend/dist` would be stripped before deployment.
#
# Usage: ./build-and-stage.sh
set -euo pipefail

# Resolve the repository root from the script's own location (this file lives
# at <repo>/build-and-stage.sh, next to `frontend/` and `backend/`).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="${SCRIPT_DIR}/frontend"
BACKEND_DIR="${SCRIPT_DIR}/backend"
STAGE_DIR="${BACKEND_DIR}/static"

# Use the managed Node runtime so the build is reproducible outside an
# interactive shell.
NODE_BIN_DIR="/Users/hennessy/.workbuddy/binaries/node/versions/22.12.0/bin"
export PATH="${NODE_BIN_DIR}:${PATH}"
export NODE_OPTIONS="--max-old-space-size=640"

echo "==> Building frontend (${FRONTEND_DIR})"
(cd "${FRONTEND_DIR}" && npm run build)

echo "==> Staging build output into ${STAGE_DIR}"
rm -rf "${STAGE_DIR}"
mkdir -p "${BACKEND_DIR}"
cp -R "${FRONTEND_DIR}/dist" "${STAGE_DIR}"

echo "==> Done. Staged files:"
find "${STAGE_DIR}" -type f | sed "s|${STAGE_DIR}/||" | sort
