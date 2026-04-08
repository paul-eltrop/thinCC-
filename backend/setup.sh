#!/bin/bash
# Installiert alle Abhaengigkeiten fuer den Tender Agent.
# Erstellt ein virtuelles Environment und installiert
# die Pakete aus requirements.txt.

python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
