"""Workouts: goals (default 12/31), best-set entries, per-exercise progress.

Exercise names are free-form text (typed, not picked from a fixed list). An
entry's type — lift (weight x reps) or run (time) — is inferred from which
fields are populated on it, never from a hardcoded name list. For an
*exercise name as a whole* (e.g. for the progress/volume endpoints, where no
single entry is in hand yet), we infer from how its most recent entry was
logged.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import logic, models, schemas
from app.database import get_db

router = APIRouter(prefix="/api/workouts", tags=["workouts"])


def _year_end(year: int | None = None) -> date:
    return date(year or date.today().year, 12, 31)


def _entry_is_run(e: models.WorkoutEntry) -> bool:
    """A single entry is a run if it has a time and no weight/reps."""
    return e.seconds is not None


# --------------------------------------------------------------------------- #
# Catalog
# --------------------------------------------------------------------------- #
@router.get("/exercise-names")
def exercise_names(db: Session = Depends(get_db)):
    """Every exercise name ever logged, split by lift/run, for the combobox.

    An exercise's type is taken from its most recently logged entry, so if
    the owner starts logging an old lift-name with a time instead, future
    suggestions follow the newer usage.
    """
    rows = (
        db.query(models.WorkoutEntry)
        .order_by(models.WorkoutEntry.exercise.asc(), models.WorkoutEntry.date.desc())
        .all()
    )
    latest_is_run: dict[str, bool] = {}
    for e in rows:
        if e.exercise not in latest_is_run:
            latest_is_run[e.exercise] = _entry_is_run(e)

    lifts = sorted(ex for ex, is_run in latest_is_run.items() if not is_run)
    runs = sorted(ex for ex, is_run in latest_is_run.items() if is_run)
    return {"lifts": lifts, "runs": runs, "groups": ["Push", "Pull", "Legs", "Run", "Other"]}


# --------------------------------------------------------------------------- #
# Goals
# --------------------------------------------------------------------------- #
@router.get("/goals", response_model=list[schemas.WorkoutGoal])
def list_goals(db: Session = Depends(get_db)):
    return db.query(models.WorkoutGoal).order_by(models.WorkoutGoal.exercise.asc()).all()


@router.put("/goals", response_model=schemas.WorkoutGoal)
def upsert_goal(payload: schemas.WorkoutGoalIn, db: Session = Depends(get_db)):
    goal = (
        db.query(models.WorkoutGoal)
        .filter_by(exercise=payload.exercise)
        .one_or_none()
    )
    if goal is None:
        goal = models.WorkoutGoal(exercise=payload.exercise, target_date=_year_end())
        db.add(goal)
    goal.target_weight = payload.target_weight
    goal.target_reps = payload.target_reps
    goal.target_seconds = payload.target_seconds
    goal.target_date = payload.target_date or _year_end()
    db.commit()
    db.refresh(goal)
    return goal


# --------------------------------------------------------------------------- #
# Entries
# --------------------------------------------------------------------------- #
def _to_schema(e: models.WorkoutEntry) -> schemas.WorkoutEntry:
    return schemas.WorkoutEntry(
        id=e.id,
        date=e.date,
        group=e.group,
        exercise=e.exercise,
        weight=e.weight,
        reps=e.reps,
        seconds=e.seconds,
        est_1rm=logic.estimated_1rm(e.weight, e.reps),
    )


@router.get("/entries", response_model=list[schemas.WorkoutEntry])
def list_entries(limit: int = 200, db: Session = Depends(get_db)):
    rows = (
        db.query(models.WorkoutEntry)
        .order_by(models.WorkoutEntry.date.desc(), models.WorkoutEntry.id.desc())
        .limit(limit)
        .all()
    )
    return [_to_schema(e) for e in rows]


@router.post("/entries", response_model=schemas.WorkoutEntry)
def add_entry(payload: schemas.WorkoutEntryIn, db: Session = Depends(get_db)):
    # The client decides lift-vs-run by which fields it sends (a seconds
    # value means a run; weight+reps means a lift) — no fixed exercise list.
    is_run = payload.seconds is not None
    if is_run and not payload.seconds:
        raise HTTPException(400, "Runs require a time (seconds).")
    if not is_run and (not payload.weight or not payload.reps):
        raise HTTPException(400, "Lifts require weight and reps.")
    e = models.WorkoutEntry(
        date=payload.date or date.today(),
        group=payload.group or logic.infer_group(payload.exercise, is_run=is_run),
        exercise=payload.exercise,
        weight=payload.weight,
        reps=payload.reps,
        seconds=payload.seconds,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return _to_schema(e)


@router.delete("/entries/{entry_id}")
def delete_entry(entry_id: int, db: Session = Depends(get_db)):
    e = db.get(models.WorkoutEntry, entry_id)
    if not e:
        raise HTTPException(404, "Entry not found")
    db.delete(e)
    db.commit()
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Per-exercise progress (with pace-to-goal line)
# --------------------------------------------------------------------------- #
@router.get("/progress/{exercise}")
def exercise_progress(exercise: str, db: Session = Depends(get_db)):
    rows = (
        db.query(models.WorkoutEntry)
        .filter(models.WorkoutEntry.exercise == exercise)
        .order_by(models.WorkoutEntry.date.asc())
        .all()
    )
    is_run = _entry_is_run(rows[-1]) if rows else False
    series = []
    for e in rows:
        if is_run:
            series.append({"date": e.date.isoformat(), "value": e.seconds})
        else:
            series.append(
                {"date": e.date.isoformat(), "value": logic.estimated_1rm(e.weight, e.reps)}
            )

    goal = db.query(models.WorkoutGoal).filter_by(exercise=exercise).one_or_none()
    pace = None
    if goal and series:
        if is_run:
            target_val = goal.target_seconds
        else:
            target_val = logic.estimated_1rm(goal.target_weight, goal.target_reps)
        if target_val is not None:
            start = rows[0].date
            start_val = series[0]["value"] or 0
            # Where you should be *today* on the linear path to the goal.
            pace_today = logic.required_pace_value(
                start_val, target_val, start, goal.target_date, date.today()
            )
            pace = {
                "target_value": target_val,
                "target_date": goal.target_date.isoformat(),
                "start": {"date": start.isoformat(), "value": start_val},
                "pace_today": round(pace_today, 1),
            }

    return {
        "exercise": exercise,
        "is_run": is_run,
        "metric": "time_seconds" if is_run else "est_1rm",
        "series": series,
        "pace": pace,
    }


@router.get("/volume")
def volume_trends(limit: int = 6, db: Session = Depends(get_db)):
    """Monthly best-effort for the most-logged exercises, for the sparkline grid.

    For lifts: best estimated 1RM in the month. For runs: best (lowest) time
    in the month. Returns one series per exercise, bucketed by YYYY-MM, for
    the `limit` exercises with the most logged entries (so new free-form
    names show up here automatically once logged a few times).
    """
    rows = (
        db.query(models.WorkoutEntry)
        .order_by(models.WorkoutEntry.date.asc())
        .all()
    )

    # bucket[exercise][YYYY-MM] = best value; also track entry counts + type.
    bucket: dict[str, dict[str, float]] = defaultdict(dict)
    counts: dict[str, int] = defaultdict(int)
    is_run_by_ex: dict[str, bool] = {}
    for e in rows:
        month = e.date.strftime("%Y-%m")
        is_run = _entry_is_run(e)
        is_run_by_ex[e.exercise] = is_run  # last entry wins, like exercise-names
        counts[e.exercise] += 1
        if is_run:
            val = e.seconds
            if val is None:
                continue
            prev = bucket[e.exercise].get(month)
            bucket[e.exercise][month] = min(val, prev) if prev is not None else val
        else:
            val = logic.estimated_1rm(e.weight, e.reps)
            if val is None:
                continue
            prev = bucket[e.exercise].get(month)
            bucket[e.exercise][month] = max(val, prev) if prev is not None else val

    tracked = sorted(counts, key=lambda ex: counts[ex], reverse=True)[:limit]

    result = {}
    for ex in tracked:
        months_data = bucket.get(ex, {})
        result[ex] = {
            "is_run": is_run_by_ex.get(ex, False),
            "series": [
                {"month": m, "value": v}
                for m, v in sorted(months_data.items())
            ],
        }
    return result


# --------------------------------------------------------------------------- #
# Personal records — a permanent feed of every exercise's all-time best
# --------------------------------------------------------------------------- #
@router.get("/prs")
def personal_records(db: Session = Depends(get_db)):
    """The all-time best entry per exercise, newest PR first.

    Best = lowest time for a run, highest estimated 1RM for a lift. Ties
    (e.g. two entries with the same est-1RM) keep the earliest date the
    value was first achieved.
    """
    rows = (
        db.query(models.WorkoutEntry)
        .order_by(models.WorkoutEntry.date.asc(), models.WorkoutEntry.id.asc())
        .all()
    )
    best: dict[str, dict] = {}
    for e in rows:
        is_run = _entry_is_run(e)
        value = e.seconds if is_run else logic.estimated_1rm(e.weight, e.reps)
        if value is None:
            continue
        current = best.get(e.exercise)
        is_better = current is None or (
            value < current["value"] if is_run else value > current["value"]
        )
        if is_better:
            best[e.exercise] = {
                "exercise": e.exercise,
                "is_run": is_run,
                "value": value,
                "date": e.date.isoformat(),
                "weight": e.weight,
                "reps": e.reps,
            }
    return sorted(best.values(), key=lambda r: r["date"], reverse=True)


# --------------------------------------------------------------------------- #
# Push/Pull/Legs/Run balance radar
# --------------------------------------------------------------------------- #
@router.get("/balance")
def balance(window_days: int = 90, db: Session = Depends(get_db)):
    """Entry counts per training group over a trailing window, for a radar
    chart showing whether push/pull/legs/running are getting even attention."""
    start = date.today() - timedelta(days=window_days)
    rows = (
        db.query(models.WorkoutEntry)
        .filter(models.WorkoutEntry.date >= start)
        .all()
    )
    counts: dict[str, int] = defaultdict(int)
    for e in rows:
        counts[e.group or "Other"] += 1

    groups = ["Push", "Pull", "Legs", "Run"]
    return {
        "window_days": window_days,
        "groups": [{"group": g, "count": counts.get(g, 0)} for g in groups],
    }


# --------------------------------------------------------------------------- #
# Streak / consistency stats
# --------------------------------------------------------------------------- #
@router.get("/streaks")
def streaks(db: Session = Depends(get_db)):
    """Current + longest consecutive-day streak, and workouts/week over the
    last several weeks, mirroring the day-walking pattern the habit tracker
    used to use — but keyed off logged workout days instead."""
    rows = db.query(models.WorkoutEntry.date).distinct().all()
    days = sorted({r[0] for r in rows})
    day_set = set(days)

    today = date.today()
    current_streak = 0
    cursor = today
    # Allow "yesterday" to still count today's streak as alive if today has
    # no entry yet (don't zero out a streak just because it's morning).
    if cursor not in day_set:
        cursor -= timedelta(days=1)
    while cursor in day_set:
        current_streak += 1
        cursor -= timedelta(days=1)

    longest_streak = 0
    run = 0
    prev = None
    for d in days:
        if prev is not None and (d - prev).days == 1:
            run += 1
        else:
            run = 1
        longest_streak = max(longest_streak, run)
        prev = d

    # Workouts per week, last 8 weeks (Mon-start buckets), oldest first.
    weeks = []
    for w in range(7, -1, -1):
        week_start = today - timedelta(days=today.weekday() + w * 7)
        week_end_excl = week_start + timedelta(days=7)
        count = sum(1 for d in days if week_start <= d < week_end_excl)
        weeks.append({"week_start": week_start.isoformat(), "count": count})

    return {
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "total_workout_days": len(days),
        "weeks": weeks,
    }
