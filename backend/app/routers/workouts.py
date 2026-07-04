"""Workouts: goals (default 12/31), best-set entries, per-exercise progress."""
from __future__ import annotations

from collections import defaultdict
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import logic, models, schemas
from app.database import get_db

router = APIRouter(prefix="/api/workouts", tags=["workouts"])


def _year_end(year: int | None = None) -> date:
    return date(year or date.today().year, 12, 31)


# --------------------------------------------------------------------------- #
# Catalog
# --------------------------------------------------------------------------- #
@router.get("/exercises")
def exercises():
    return {
        "lifts": models.LIFT_EXERCISES,
        "runs": models.RUN_EXERCISES,
        "groups": ["Push", "Pull", "Legs", "Run"],
    }


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
    is_run = payload.exercise in models.RUN_EXERCISES
    if is_run and not payload.seconds:
        raise HTTPException(400, "Runs require a time (seconds).")
    if not is_run and (not payload.weight or not payload.reps):
        raise HTTPException(400, "Lifts require weight and reps.")
    e = models.WorkoutEntry(
        date=payload.date or date.today(),
        group=payload.group or logic.infer_group(payload.exercise),
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
    is_run = exercise in models.RUN_EXERCISES
    rows = (
        db.query(models.WorkoutEntry)
        .filter(models.WorkoutEntry.exercise == exercise)
        .order_by(models.WorkoutEntry.date.asc())
        .all()
    )
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
def volume_trends(db: Session = Depends(get_db)):
    """Monthly best-effort per exercise for the sparkline grid.

    For lifts: best estimated 1RM in the month.
    For runs: best (lowest) time in the month.
    Returns one series per tracked exercise, bucketed by YYYY-MM.
    """
    tracked = models.LIFT_EXERCISES + ["1mile", "5k"]
    rows = (
        db.query(models.WorkoutEntry)
        .filter(models.WorkoutEntry.exercise.in_(tracked))
        .order_by(models.WorkoutEntry.date.asc())
        .all()
    )

    # bucket[exercise][YYYY-MM] = best value
    bucket: dict[str, dict[str, float]] = defaultdict(dict)
    for e in rows:
        month = e.date.strftime("%Y-%m")
        is_run = e.exercise in models.RUN_EXERCISES
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

    result = {}
    for ex in tracked:
        months_data = bucket.get(ex, {})
        is_run = ex in models.RUN_EXERCISES
        result[ex] = {
            "is_run": is_run,
            "series": [
                {"month": m, "value": v}
                for m, v in sorted(months_data.items())
            ],
        }
    return result
