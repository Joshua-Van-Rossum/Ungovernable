#!/usr/bin/env bash
# Azure App Service (Linux, Python) startup command.
# Set this as the App Service "Startup Command":  bash startup.sh
set -euo pipefail

# /home is the only persistent volume on App Service Linux.
# Create the data directory if it doesn't exist yet.
mkdir -p /home/data

# Seed habits/goals on first boot (idempotent). Safe to run every deploy.
python seed.py || true

# Bind to the port App Service provides. gunicorn + uvicorn workers for async.
exec gunicorn app.main:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --workers 2 \
  --bind 0.0.0.0:"${PORT:-8000}" \
  --timeout 120
