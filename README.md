# ResearchPilot

ResearchPilot is a small paper-reading workspace built with React and Vite, a Python FastAPI API, and a browser installable PWA.

## Run locally

1. Create a Supabase project, then run [`supabase/schema.sql`](supabase/schema.sql) once in its SQL Editor. Copy the project URL and anon/publishable key from Supabase settings.

2. Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env`. Set the backend Supabase URL/key and OpenRouter key in the backend file; set the Supabase URL/key in the frontend file. Keep `OPENROUTER_API_KEY` only in `backend/.env`; it is read by FastAPI and never included in the frontend bundle. The workspace `.gitignore` excludes these files.

3. Start the API from the project root:

   ```powershell
   cd backend
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   uvicorn app.main:app --reload
   ```

4. In another terminal, start the website:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

The website expects the API at `http://localhost:8000`. Set `VITE_API_URL` if it runs elsewhere. Authentication uses Supabase email/password auth with persistent browser sessions. Papers and extracted text, conversations, report metadata, and PDF files are scoped to each user through Row Level Security. Paper Q&A retrieves relevant excerpts and sends them to the configured OpenRouter model; the API key stays on the server.

## Project map

- `frontend/` - React screens, styles, PWA manifest, and service worker.
- `backend/app/` - FastAPI routes, Supabase persistence, PDF extraction, retrieval, and OpenRouter calls.
- `supabase/schema.sql` - tables, account profile trigger, private file bucket, and Row Level Security policies.
- `docs/` - supplied UI wireframe.

The PWA install prompt displays “DOWNLOAD OUR WEB APP” when installation is available. On iPhone/iPad, use Share > Add to Home Screen. Browser notifications are optional and only requested when you press Enable notifications.

## Search metadata

The landing page includes a descriptive title and summary, Open Graph and Twitter metadata, and SoftwareApplication structured data. Set `VITE_SITE_URL` to the real deployed origin before a production build to generate a canonical URL, absolute social-card URLs, `robots.txt` sitemap reference, and `sitemap.xml`. No production domain was provided, so the project does not publish a guessed canonical domain.

## OpenRouter (backend only)

All LLM features are routed through the backend OpenRouter adapter (`backend/app/openrouter.py`). Set OPENROUTER_API_KEY only in `backend/.env` (never in frontend code, browser requests, logs, API responses, or Git commits). The API uses https://openrouter.ai/api/v1 and sends HTTP-Referer and X-OpenRouter-Title: ResearchPilot.

Config variables (see `backend/.env.example`): OPENROUTER_API_KEY, OPENROUTER_BASE_URL, OPENROUTER_ANALYSIS_MODEL, OPENROUTER_CHAT_MODEL, OPENROUTER_FALLBACK_MODEL, OPENROUTER_TIMEOUT_SECONDS, OPENROUTER_MAX_RETRIES, OPENROUTER_SITE_URL, OPENROUTER_APP_TITLE.

Model selection inspects GET /api/v1/models and prefers currently available, high-context, structured-output-capable models when env model IDs are unset. Defaults: analysis google/gemini-2.5-pro, chat google/gemini-2.5-flash, fallback openai/gpt-4.1-mini (overridden by catalog/availability/config). The backend logs model IDs/status/usage metadata only and never logs API keys or sensitive document contents.

Reliability: configurable timeout, bounded retries, no retries for permanent auth/billing/model errors, and explicit handling for rate limits, malformed responses, and unavailable models. Research answers are grounded in extracted/page-tagged passages; page references are returned where available; the adapter instructs the model not to fabricate page numbers/citations/datasets/findings and to distinguish paper claims from AI interpretation.

Health checks (no key returned): GET /api/health, GET /api/health/openrouter.


## Production deployment

### Vercel frontend

- Root directory: `frontend`
- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: `dist`
- Set `VITE_API_URL` to the public Render API origin, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the Supabase project URL and publishable/anon key, and `VITE_SITE_URL` to the final public frontend origin. The frontend Supabase key is intended to be public; database access must remain protected by RLS.

### Render API

- Create a Python web service with root directory `backend`.
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Configure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_SITE_URL`, and `CORS_ORIGINS` in Render. Set `CORS_ORIGINS` to the exact deployed Vercel origin (comma-separated only if additional trusted origins are needed). The OpenRouter key belongs only in Render's backend environment. `OPENROUTER_BASE_URL`, model, timeout, retry, and app-title settings are optional/configurable as shown in `backend/.env.example`.
- Configure Supabase Auth's Site URL and redirect allowlist for the production Vercel origin.
- Health endpoint: `/api/health`.

Never copy real `.env` files into deployment artifacts or Git. `backend/app/_patch_chunks.txt` is an unreferenced scratch copy of parsing code and `frontend/public/Dark Mode Ribbon Document Icon.png` is an unreferenced dark-background source image; neither is required at runtime. They are retained in the working tree and should be excluded from the deployment commit unless intentionally needed as source material.
