"""Dashboard aggregates: visit commit-grid, screen-time stats, top-line KPIs."""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app.database import get_db

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

SCREENTIME_HABIT = "Screen time"  # the number habit that stores daily hours


@router.post("/visit")
def record_visit(db: Session = Depends(get_db)):
    """Idempotent-per-day visit counter for the commit grid."""
    today = date.today()
    v = db.query(models.AppVisit).filter_by(date=today).one_or_none()
    if v is None:
        v = models.AppVisit(date=today, count=1)
        db.add(v)
    else:
        v.count += 1
    db.commit()
    return {"date": today.isoformat(), "count": v.count}


@router.get("/commit-grid")
def commit_grid(weeks: int = 53, db: Session = Depends(get_db)):
    """One year of daily visit intensity, like GitHub's contribution grid."""
    today = date.today()
    start = today - timedelta(days=weeks * 7)
    visits = {
        v.date: v.count
        for v in db.query(models.AppVisit).filter(models.AppVisit.date >= start).all()
    }
    cells = []
    day = start
    while day <= today:
        cells.append({"date": day.isoformat(), "count": visits.get(day, 0)})
        day += timedelta(days=1)
    total_days = sum(1 for c in cells if c["count"] > 0)
    return {"cells": cells, "active_days": total_days, "span_days": len(cells)}


@router.get("/screentime")
def screentime(db: Session = Depends(get_db)):
    """Total + average screen-time from the 'Screen time' number habit."""
    habit = (
        db.query(models.Habit)
        .filter(models.Habit.name == SCREENTIME_HABIT)
        .one_or_none()
    )
    if not habit:
        return {"total_hours": 0, "avg_week": 0, "avg_month": 0, "avg_year": 0}

    today = date.today()
    logs = (
        db.query(models.HabitLog)
        .filter(models.HabitLog.habit_id == habit.id)
        .filter(models.HabitLog.value.isnot(None))
        .all()
    )
    total = sum(l.value or 0 for l in logs)

    def avg_over(days: int) -> float:
        start = today - timedelta(days=days)
        vals = [l.value for l in logs if l.date >= start and l.value is not None]
        if not vals:
            return 0.0
        return round(sum(vals) / len(vals), 2)

    return {
        "total_hours": round(total, 1),
        "avg_week": avg_over(7),
        "avg_month": avg_over(30),
        "avg_year": avg_over(365),
    }
