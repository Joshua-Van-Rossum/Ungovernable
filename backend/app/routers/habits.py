"""Daily habits tracker + per-habit progress drill-down."""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/api/habits", tags=["habits"])


def _is_complete(habit: models.Habit, log: models.HabitLog | None) -> bool:
    if log is None:
        return False
    if habit.kind == "number":
        if log.value is None:
            return False
        return log.value >= (habit.target or 0)
    return bool(log.done)


def _streak(db: Session, habit: models.Habit, upto: date) -> int:
    """Consecutive days (ending today) the habit was completed."""
    logs = {
        l.date: l
        for l in db.query(models.HabitLog).filter_by(habit_id=habit.id).all()
    }
    streak = 0
    day = upto
    while _is_complete(habit, logs.get(day)):
        streak += 1
        day -= timedelta(days=1)
    return streak


@router.get("", response_model=list[schemas.HabitWithToday])
def list_habits(db: Session = Depends(get_db)):
    today = date.today()
    habits = (
        db.query(models.Habit)
        .filter(models.Habit.active.is_(True))
        .order_by(models.Habit.sort_order.asc())
        .all()
    )
    out = []
    for h in habits:
        log = (
            db.query(models.HabitLog)
            .filter_by(habit_id=h.id, date=today)
            .one_or_none()
        )
        out.append(
            schemas.HabitWithToday(
                id=h.id,
                name=h.name,
                kind=h.kind,
                unit=h.unit,
                target=h.target,
                sort_order=h.sort_order,
                active=h.active,
                today_done=bool(log.done) if log else False,
                today_value=log.value if log else None,
                streak=_streak(db, h, today),
            )
        )
    return out


@router.post("/log", response_model=schemas.HabitLog)
def log_habit(payload: schemas.HabitLogIn, db: Session = Depends(get_db)):
    habit = db.get(models.Habit, payload.habit_id)
    if not habit:
        raise HTTPException(404, "Habit not found")
    when = payload.date or date.today()
    log = (
        db.query(models.HabitLog)
        .filter_by(habit_id=habit.id, date=when)
        .one_or_none()
    )
    if log is None:
        log = models.HabitLog(habit_id=habit.id, date=when)
        db.add(log)
    if payload.done is not None:
        log.done = payload.done
    if payload.value is not None:
        log.value = payload.value
        log.done = log.value >= (habit.target or 0)
    db.commit()
    db.refresh(log)
    return log


@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    """Avg habits completed per day: this month vs last month vs year average."""
    today = date.today()
    habits = db.query(models.Habit).filter(models.Habit.active.is_(True)).all()
    habit_by_id = {h.id: h for h in habits}
    n_active = len(habits) or 1

    logs = db.query(models.HabitLog).all()

    def avg_for(start: date, end_excl: date) -> float:
        per_day: dict[date, int] = {}
        for l in logs:
            if start <= l.date < end_excl and l.habit_id in habit_by_id:
                if _is_complete(habit_by_id[l.habit_id], l):
                    per_day[l.date] = per_day.get(l.date, 0) + 1
        if not per_day:
            return 0.0
        return round(sum(per_day.values()) / len(per_day), 2)

    tm_start = date(today.year, today.month, 1)
    tm_end = date(today.year + 1, 1, 1) if today.month == 12 else date(today.year, today.month + 1, 1)
    lm_y, lm_m = (today.year - 1, 12) if today.month == 1 else (today.year, today.month - 1)
    lm_start = date(lm_y, lm_m, 1)
    year_start = date(today.year, 1, 1)

    return {
        "active_habits": n_active,
        "this_month_avg": avg_for(tm_start, tm_end),
        "last_month_avg": avg_for(lm_start, tm_start),
        "year_avg": avg_for(year_start, tm_end),
    }


@router.get("/{habit_id}/progress")
def habit_progress(habit_id: int, days: int = 90, db: Session = Depends(get_db)):
    """Daily completion series for a single habit (drill-down)."""
    habit = db.get(models.Habit, habit_id)
    if not habit:
        raise HTTPException(404, "Habit not found")
    today = date.today()
    start = today - timedelta(days=days - 1)
    logs = {
        l.date: l
        for l in db.query(models.HabitLog)
        .filter(models.HabitLog.habit_id == habit_id)
        .filter(models.HabitLog.date >= start)
        .all()
    }
    series = []
    completed = 0
    day = start
    while day <= today:
        log = logs.get(day)
        done = _is_complete(habit, log)
        completed += int(done)
        series.append(
            {
                "date": day.isoformat(),
                "done": done,
                "value": (log.value if log else None),
            }
        )
        day += timedelta(days=1)
    return {
        "habit": {"id": habit.id, "name": habit.name, "kind": habit.kind, "target": habit.target, "unit": habit.unit},
        "series": series,
        "completion_rate": round(completed / len(series), 3) if series else 0,
        "current_streak": _streak(db, habit, today),
    }
