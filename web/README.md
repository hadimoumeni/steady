# Steady web (Next.js)

This is the UI for **Steady**. It talks to the FastAPI app in `../backend`.

## 1. Backend API + Anthropic key

From the repo root:

```bash
cd backend
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY (required for Plain English extract + Claude summary stream)
python3 -m pip install -r requirements.txt
python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Check [http://localhost:8000/health](http://localhost:8000/health) → `{"status":"ok"}`.

## 2. This app

```bash
cd web
cp .env.example .env.local
# Edit .env.local if the API is not at http://localhost:8000 (e.g. deployed URL)
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How calls fit together

- **Plain English**: `POST /extract` → `POST /simulate` → `POST /advise/stream` (SSE: metadata + streamed conclusion).
- **Manual numbers**: `POST /simulate` → `POST /advise/stream`.
- **Demo** button: loads `GET /demo` for the simulate payload, then runs `/advise/stream` on that curve.

`NEXT_PUBLIC_STEADY_API_URL` must point at the same host the browser can reach (CORS is wide open on the API). The Anthropic key stays **only** on the server in `backend/.env`.

## Legacy Vite folder

If you still have a `frontend/` directory from an older prototype, the supported UI is this **`web/`** Next app.
