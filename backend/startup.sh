#!/usr/bin/env bash
# Azure App Service (Linux, Python) startup command.
set -euo pipefail

# Move into the backend directory so all paths resolve correctly.
cd "$(dirname "$0")"

# Install dependencies directly (Oryx venv isn't on PATH at runtime).
pip install -r requirements.txt --quiet

# /home is the only persistent volume on App Service Linux.
mkdir -p /home/data

# Seed habits/goals on first boot (idempotent).
python seed.py || true

# Bind to the port App Service provides.
exec gunicorn app.main:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --workers 2 \
  --bind 0.0.0.0:"${PORT:-8000}" \
  --timeout 120
