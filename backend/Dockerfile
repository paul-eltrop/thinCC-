# Production Dockerfile fuer den FastAPI-Backend. Pre-warmed Docling-Models
# liegen im Image, damit der erste PDF-Upload nicht 5 Minuten lang im Docling-
# Modell-Download haengt. Lokales Dev (start.sh) bleibt unveraendert.

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libssl-dev \
        libffi-dev \
        curl \
        libgl1 \
        libglib2.0-0 \
        libxcb1 \
        libsm6 \
        libxext6 \
        libxrender1 \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt /app/requirements.txt
RUN pip install -r /app/requirements.txt

RUN python -c "from docling.document_converter import DocumentConverter; DocumentConverter()"

COPY backend/ /app/backend/
WORKDIR /app/backend

EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
