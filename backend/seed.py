"""Seed the database with the owner's habits, workout goals, and starter data.

Idempotent: safe to run repeatedly. Run from backend/:  python seed.py
Pass --demo to also generate ~6 months of sample finance/workout/habit history
so the charts and grids have something to draw immediately.
"""
from __future__ import annotations

import random
import sys
from datetime import date, timedelta
from decimal import Decimal

from app.database import Base, SessionLocal, engine
from app import models

Base.metadata.create_all(bind=engine)

HABITS = [
    # name, kind, unit, target, order
    ("Read 20m", "check", None, None, 0),
    ("Personal Project (1h)", "check", None, None, 1),
    ("Upskilling", "check", None, None, 2),
    ("Daily Quiz", "check", None, None, 3),
    ("Stretch Routine", "check", None, None, 4),
    ("Screen time", "number", "hours", None, 5),
]

# Goals -> default target_date is 12/31 of the current year (set below).
GOALS = [
    {"exercise": "bench", "target_weight": 225, "target_reps": 2},
    {"exercise": "squat", "target_weight": 255, "target_reps": 3},
    {"exercise": "pull-ups", "target_weight": 0, "target_reps": 12},
    {"exercise": "1mile", "target_seconds": 7 * 60},          # 7:00
    {"exercise": "5k", "target_seconds": 24 * 60 + 30},        # 24:30
]


def seed_habits(db):
    for name, kind, unit, target, order in HABITS:
        if not db.query(models.Habit).filter_by(name=name).first():
            db.add(models.Habit(name=name, kind=kind, unit=unit, target=target, sort_order=order))
    db.commit()


def seed_goals(db):
    ye = date(date.today().year, 12, 31)
    for g in GOALS:
        if not db.query(models.WorkoutGoal).filter_by(exercise=g["exercise"]).first():
            db.add(models.WorkoutGoal(target_date=ye, **g))
    db.commit()


def seed_starter_finance(db):
    """One current-month snapshot so KPIs and the equity house render."""
    today = date.today()
    if db.query(models.MonthlyFinance).filter_by(year=today.year, month=today.month).first():
        return
    db.add(
        models.MonthlyFinance(
            year=today.year,
            month=today.month,
            total_cash=Decimal("8500"),
            investments=Decimal("12000"),
            debt=Decimal("18000"),
            monthly_gain=Decimal("0"),
            monthly_loss=Decimal("0"),
            balance_401k=Decimal("24000"),
            home_equity=Decimal("14500"),  # ~10% of 145k
        )
    )
    db.commit()


def seed_demo_history(db):
    """Optional: backfill realistic-ish history for charts."""
    today = date.today()
    rng = random.Random(42)

    # 6 months of monthly finance, trending up.
    cash, inv, debt, k401, equity = 5000, 6000, 24000, 16000, 9000
    for i in range(6, 0, -1):
        idx = today.year * 12 + (today.month - 1) - i
        y, m = divmod(idx, 12)
        m += 1
        if db.query(models.MonthlyFinance).filter_by(year=y, month=m).first():
            continue
        cash += rng.randint(200, 900)
        inv += rng.randint(300, 1200)
        debt -= rng.randint(400, 1100)
        k401 += rng.randint(500, 1500)
        equity += rng.randint(300, 900)
        db.add(
            models.MonthlyFinance(
                year=y, month=m,
                total_cash=Decimal(cash), investments=Decimal(inv),
                debt=Decimal(max(debt, 0)), balance_401k=Decimal(k401),
                home_equity=Decimal(equity),
                monthly_gain=Decimal(rng.randint(3800, 4600)),
                monthly_loss=Decimal(rng.randint(1800, 2800)),
            )
        )

    # Expenses across the last 180 days.
    cats = {
        "Food": ["Groceries", "Restaurants", "Coffee"],
        "Car": ["Gas", "Insurance"],
        "Subscriptions": ["Streaming", "Gym", "Software"],
        "Home": ["Rent", "Utilities"],
        "Dates": ["Dinner", "Movie"],
        "Debt Payments": ["Card", "Loan"],
        "Investments": ["Brokerage"],
        "Pet": ["Food", "Vet"],
        "Miscellaneous": ["Misc"],
    }
    if db.query(models.Expense).count() == 0:
        for d in range(180):
            day = today - timedelta(days=d)
            for _ in range(rng.randint(0, 2)):
                cat = rng.choice(list(cats))
                db.add(models.Expense(
                    amount=Decimal(rng.randint(8, 220)),
                    date=day, category=cat,
                    subcategory=rng.choice(cats[cat]),
                    recurring=cat in ("Subscriptions", "Home") and rng.random() < 0.5,
                ))

    # Workout entries trending up over the year.
    if db.query(models.WorkoutEntry).count() == 0:
        for wk in range(26, 0, -1):
            day = today - timedelta(weeks=wk)
            db.add(models.WorkoutEntry(date=day, group="Push", exercise="bench",
                                       weight=155 + (26 - wk) * 2, reps=rng.randint(3, 5)))
            db.add(models.WorkoutEntry(date=day, group="Legs", exercise="squat",
                                       weight=185 + (26 - wk) * 2, reps=rng.randint(3, 5)))
            db.add(models.WorkoutEntry(date=day, group="Pull", exercise="pull-ups",
                                       weight=0, reps=6 + (26 - wk) // 4))
            db.add(models.WorkoutEntry(date=day, group="Run", exercise="1mile",
                                       seconds=8 * 60 + 30 - (26 - wk) * 3))

    # App visits + habit logs for the commit grid.
    if db.query(models.AppVisit).count() == 0:
        habits = db.query(models.Habit).all()
        for d in range(120):
            day = today - timedelta(days=d)
            if rng.random() < 0.75:
                db.add(models.AppVisit(date=day, count=rng.randint(1, 4)))
                for h in habits:
                    if h.kind == "number":
                        db.add(models.HabitLog(habit_id=h.id, date=day,
                                               value=round(rng.uniform(2.5, 7.5), 1)))
                    elif rng.random() < 0.6:
                        db.add(models.HabitLog(habit_id=h.id, date=day, done=True))
    db.commit()


def main():
    db = SessionLocal()
    try:
        seed_habits(db)
        seed_goals(db)
        seed_starter_finance(db)
        if "--demo" in sys.argv:
            seed_demo_history(db)
            print("Seeded habits, goals, finance + demo history.")
        else:
            print("Seeded habits, goals, and starter finance. (Use --demo for sample charts.)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
