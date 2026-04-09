#!/bin/bash
# Startet Backend (FastAPI) und Frontend (Next.js) parallel.
# Backend laeuft auf Port 8000, Frontend auf Port 3000.
# Beendet beide Prozesse wenn das Skript gestoppt wird.

trap 'kill 0' EXIT

kill -9 $(lsof -ti :8000) 2>/dev/null
kill -9 $(lsof -ti :3000) 2>/dev/null
sleep 1

echo "Starting backend on http://localhost:8000 ..."
cd backend && uvicorn api:app --reload --port 8000 &

echo "Starting frontend on http://localhost:3000 ..."
cd web && npx next dev &

wait
