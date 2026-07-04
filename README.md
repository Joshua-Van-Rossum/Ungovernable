# Ungovernable

A personal goals, habits, finance, and fitness command center. Single-user,
dark "personal terminal" UI, built to run and look good on both **laptop** and
**phone (vertical)**. Hosted on **Azure App Service** with **Azure Database for
PostgreSQL**, access controlled by **Azure App Service Easy Auth**.

## What's in it

- **Dashboard** — net worth / cash / monthly-spend KPIs, screen-time stats,
  daily habits tracker (checks + screen-time hours), GitHub-style sign-in
  commit grid with consistency stats and per-habit drill-down, projects list,
  rotating top stocks (Caterpillar always first), weather, date, and a
  recommended-watching strip pulled live from YouTube.
- **Finance** — expense entry (category → history-aware subcategory dropdown,
  recurring flag), paycheck entry, expenses table, monthly finance table,
  expense-report bar chart with category drill-down and a window scrubber,
  progress line chart with a dashed average trend line, an SVG **home-equity
  house**, a full KPI grid (this month / last month / vs last year / YTD /
  rolling 365), and a **new-month audit popup**.
- **Workouts** — editable goals (default 12/31), best-set / run-time logging,
  per-exercise progress charts with estimated 1RM (Epley) and a dashed
  **pace-to-goal** line, and a scrollable history.
- **Projects** — a list with a per-project autosaving notes editor.
- **Upskilling** — daily-habit streak + curated learning tracks.

## Tech

- **Backend**: FastAPI + SQLAlchemy. SQLite locally, PostgreSQL in production.
- **Frontend**: React + Vite + React Router + Recharts.
- **External data**: Yahoo Finance (stocks), Open-Meteo (weather), YouTube RSS
  (videos) — all key-less, cached server-side.

## Project structure

```
Ungovernable/
├── backend/
│   ├── app/
│   │   ├── main.py            # app, routers, SPA serving, /api/me (Easy Auth)
│   │   ├── database.py        # SQLite (dev) / Postgres (prod) engine
│   │   ├── models.py          # all tables
│   │   ├── schemas.py         # Pydantic models
│   │   ├── logic.py           # finance rollups, 1RM, goal pacing
│   │   └── routers/           # finance, habits, workouts, projects, dashboard, external
│   ├── seed.py                # habits + goals + starter finance (--demo for charts)
│   ├── startup.sh             # Azure App Service startup command
│   ├── requirements.txt       # runtime deps (SQLite-friendly)
│   └── requirements-prod.txt  # + psycopg2 for Postgres
├── frontend/                  # Vite SPA (built to frontend/dist, served by FastAPI in prod)
├── PRODUCT.md / DESIGN.md     # design foundation
└── docker-compose.yml
```

## Local development

Two terminals. **Backend** (SQLite, auto-creates tables):

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python seed.py --demo             # seeds habits/goals + sample history for charts
python run.py                     # http://localhost:8000  (docs at /docs)
```

**Frontend** (Vite dev server proxies `/api` → :8000):

```bash
cd frontend
npm install
npm run dev                       # http://localhost:5173
```

Open http://localhost:5173.

## Production build

```bash
cd frontend && npm run build      # outputs frontend/dist
```

When `frontend/dist` exists, the FastAPI app serves it same-origin (so Easy Auth
protects the whole app) and falls back to `index.html` for client-side routes.

## Deploy to Azure

### 1. Database — Azure Database for PostgreSQL (Flexible Server)

Create a flexible server + a database named `ungovernable`. Grab the connection
string and set it on the App Service as `DATABASE_URL`:

```
postgresql://USER:PASSWORD@SERVER.postgres.database.azure.com:5432/ungovernable?sslmode=require
```

### 2. App Service (Linux, Python 3.11)

- Deploy the repo (the `backend/` folder is the app root). Build the frontend
  first so `frontend/dist` ships with it, or run `npm run build` in a CI step.
- **App settings**:
  - `DATABASE_URL` = the Postgres string above
  - `SCM_DO_BUILD_DURING_DEPLOYMENT` = `true` (installs `requirements.txt`)
  - Also `pip install -r requirements-prod.txt` to add the Postgres driver
    (add it to your build step or a `requirements.txt` include).
- **Startup Command**: `bash startup.sh` (runs `seed.py` then gunicorn).

### 3. Azure OpenAI — daily lessons + flashcards

The Upskilling page generates a new AI lesson and 5 flashcards each day. Without
a key the app falls back to static placeholder content, so everything still works.

1. In the Azure portal, create an **Azure OpenAI** resource in your subscription.
2. Deploy a model inside it (recommended: **gpt-4o**). Note the deployment name.
3. Add these four App Settings to your App Service:

| Setting | Example value |
|---|---|
| `AZURE_OPENAI_ENDPOINT` | `https://my-resource.openai.azure.com/` |
| `AZURE_OPENAI_API_KEY` | *(key from Azure portal → Keys and Endpoint)* |
| `AZURE_OPENAI_DEPLOYMENT` | `gpt-4o` |
| `AZURE_OPENAI_API_VERSION` | `2024-08-01-preview` |

For local dev, add the same four lines to `backend/.env`.

### 4. Authentication — Easy Auth (this is your "controlled through Azure")

In the App Service → **Authentication** → Add identity provider → **Microsoft**
(Entra ID). Set **"Require authentication"** and **"Restrict access:
Authenticated only"**. To keep it just you, restrict the app registration to
your tenant / your account. After this, every request — laptop or phone — hits
the Microsoft sign-in first; the app reads your identity from the
`X-MS-CLIENT-PRINCIPAL-NAME` header (surfaced at `/api/me`, shown in the nav).

No auth code lives in the app; Azure does it all at the edge. Because the SPA is
served same-origin by FastAPI, the API is protected too.

## API surface

`/api/finance/*` · `/api/habits/*` · `/api/workouts/*` · `/api/projects/*` ·
`/api/dashboard/*` · `/api/external/{stocks,weather,youtube}` · `/api/me` ·
`/api/health`. Interactive docs at `/docs`.

## Notes

- `seed.py` is idempotent. `--demo` backfills ~6 months of finance, workouts,
  expenses, and visits so every chart and the commit grid render immediately.
- Home value is fixed at $145,000; equity is tracked but excluded from net worth
  (net worth = cash + investments + 401k − debt).
