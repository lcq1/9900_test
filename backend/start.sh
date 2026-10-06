# Startup script for backend runtime service
#!/bin/sh
# Single-port start script for the publish sandbox.
#
# The sandbox exposes exactly one public HTTP port and injects it as $PORT,
# but it starts this command without a shell — so $PORT has to be expanded
# here rather than inline in the start command.
set -e

PORT_TO_USE="${PORT:-8000}"
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT_TO_USE"
