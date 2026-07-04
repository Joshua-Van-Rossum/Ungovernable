# Backend Development Guide

FastAPI + SQLAlchemy. SQLite locally (auto-created on startup), PostgreSQL in
production. Tables are created via `Base.metadata.create_all` on startup — no
migration step is required for this single-user app (Alembic is available if you
later want versioned migrations; see `MIGRATIONS.md`).

## Layout

```
app/
├── main.py          # FastAPI app, router wiring, SPA serving, /api/me
├── database.py      # engine (SQLite dev / Postgres prod) + get_db
├── models.py        # SQLAlchemy models (see below)
├── schemas.py       # Pydantic request/response models
├── logic.py         # pure domain logic (finance rollups, 1RM, goal pacing)
└── routers/
    ├── finance.py      # expenses, monthly snapshots, paycheck, graphs, KPIs
    ├── habits.py       # daily habits, logs, streaks, stats, drill-down
    ├── workouts.py     # goals, entries, per-exercise progress + pace
    ├── projects.py     # project list + notes
    ├── dashboard.py    # visit commit-grid, screen-time stats
    └── external.py     # stocks (Yahoo), weather (Open-Meteo), YouTube (RSS)
```

## Models

- **Expense** — amount, date, category (fixed list), subcategory (free-form),
  recurring, note.
- **MonthlyFinance** — one row per (year, month): cash, investments, debt,
  monthly gain/loss, 401k, home_equity. `networth` is a computed property
  (cash + investments + 401k − debt; home equity excluded).
- **Habit / HabitLog** — habit definitions (`check` or `number`) and one log per
  (habit, day).
- **AppVisit** — per-day visit count; powers the commit grid.
- **Project** — name + notes.
- **WorkoutGoal / WorkoutEntry** — targets (default 12/31) and logged best sets
  / run times.

## Finance derivation rules (logic.py)

- An expense increases that month's `monthly_loss` and lowers `total_cash`
  (and therefore net worth). `Debt Payments` also reduce `debt`; `Investments`
  also increase `investments`. Home equity is never touched by an expense.
- A paycheck increases `monthly_gain` and `total_cash`.
- Deleting an expense reverses its effect.

## Seeding

`python seed.py` — idempotent; creates the owner's habits, workout goals, and a
starter current-month finance row. `python seed.py --demo` additionally backfills
~6 months of finance, expenses, workouts, and visits so the charts populate.

## Running

`python run.py` (auto-reload) → http://localhost:8000, docs at `/docs`.
