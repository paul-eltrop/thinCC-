#!/bin/bash
# Startet den FastAPI Dev-Server mit Hot-Reload auf Port 8000.
# Wechselt ins backend-Verzeichnis und aktiviert das venv automatisch.

cd "$(dirname "$0")"
source .venv/bin/activate
uvicorn api.main:app --reload --port 8000
