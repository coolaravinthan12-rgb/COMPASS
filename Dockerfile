# ---------- Stage 1: build the React + TS HUD ----------
FROM node:20-slim AS ui
WORKDIR /ui
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# ---------- Stage 2: Python API + model + built HUD + demo data ----------
FROM python:3.11-slim
WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY --from=ui /ui/dist ./static
COPY data/demo ./data/demo

ENV PORT=7860 \
    DATA_DIR=/app/data \
    PUBLIC_DATA_URL=/data \
    PYTHONUNBUFFERED=1

EXPOSE 7860
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
