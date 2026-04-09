#!/bin/bash
# Startet Backend (FastAPI) und Frontend (Next.js) parallel.
# Backend laeuft auf Port 8000, Frontend auf Port 3000.
# Beendet beide Prozesse wenn das Skript gestoppt wird.

trap 'kill 0' EXIT

DIR="$(cd "$(dirname "$0")" && pwd)"

kill -9 $(lsof -ti :8000) 2>/dev/null
kill -9 $(lsof -ti :3000) 2>/dev/null
sleep 1

echo "Starting backend on http://localhost:8000 ..."
(cd "$DIR/backend" && [ -f .venv/bin/activate ] && source .venv/bin/activate; uvicorn api.main:app --reload --reload-dir api --reload-dir tender --reload-dir company --reload-dir chat --reload-dir team --port 8000) &

echo "Starting frontend on http://localhost:3000 ..."
(cd "$DIR/web" && npx next dev) &

wait
