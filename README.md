# ResearchPilot

ResearchPilot is a small paper-reading workspace built with React and Vite, a Python FastAPI API, and a browser installable PWA.

## Run locally

1. Create a Supabase project, then run [`supabase/schema.sql`](supabase/schema.sql) once in its SQL Editor. Copy the project URL and anon/publishable key from Supabase settings.

2. Set credentials in ignored local environment files. `backend/.env` is already created with the OpenRouter key; replace its Supabase placeholder values with your project URL and anon/publishable key. Copy `frontend/.env.example` to `frontend/.env` and add the same Supabase values there. Set `OPENROUTER_API_KEY` only in `backend/.env`; it is read by FastAPI and never included in the frontend bundle. The workspace `.gitignore` excludes these files.

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
