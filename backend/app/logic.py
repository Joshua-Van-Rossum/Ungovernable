"""Pure domain logic: finance rollups, 1RM estimation, goal pacing.

Kept free of FastAPI so it's easy to unit-test.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal


# --------------------------------------------------------------------------- #
# Strength
# --------------------------------------------------------------------------- #
def estimated_1rm(weight: float | None, reps: int | None) -> float | None:
    """Epley formula: 1RM = w * (1 + reps/30). Universal across lifts.

    For a single rep this returns the weight itself.
    """
    if not weight or not reps or reps <= 0:
        return None
    return round(weight * (1 + reps / 30.0), 1)


def infer_group(exercise: str) -> str:
    """Map an exercise to its training group for the entry default."""
    e = exercise.lower()
    if e == "bench":
        return "Push"
    if e == "pull-ups":
        return "Pull"
    if e == "squat":
        return "Legs"
    return "Run"


# --------------------------------------------------------------------------- #
# Finance
# --------------------------------------------------------------------------- #
def derive_networth(
    total_cash: Decimal, investments: Decimal, balance_401k: Decimal, debt: Decimal
) -> Decimal:
    """Net worth excludes home equity, per the owner's definition."""
    return (
        (total_cash or Decimal(0))
        + (investments or Decimal(0))
        + (balance_401k or Decimal(0))
        - (debt or Decimal(0))
    )


def apply_expense_to_month(month_row, amount: Decimal, category: str) -> None:
    """Mutate a MonthlyFinance row to reflect a new expense.

    - Every expense increases monthly_loss and lowers cash (and thus net worth).
    - Debt Payments additionally reduce debt.
    - Investments additionally increase investments holdings.
    - Home equity is never touched by an expense.
    """
    amount = Decimal(amount)
    month_row.monthly_loss = (month_row.monthly_loss or Decimal(0)) + amount
    month_row.total_cash = (month_row.total_cash or Decimal(0)) - amount

    if category == "Debt Payments":
        month_row.debt = (month_row.debt or Decimal(0)) - amount
    elif category == "Investments":
        month_row.investments = (month_row.investments or Decimal(0)) + amount


def apply_paycheck_to_month(month_row, amount: Decimal) -> None:
    """A paycheck raises this month's gain and cash."""
    amount = Decimal(amount)
    month_row.monthly_gain = (month_row.monthly_gain or Decimal(0)) + amount
    month_row.total_cash = (month_row.total_cash or Decimal(0)) + amount


HOME_VALUE = Decimal("145000")


def equity_percent(home_equity: Decimal) -> float:
    if not home_equity:
        return 0.0
    return round(float(Decimal(home_equity) / HOME_VALUE) * 100, 1)


# --------------------------------------------------------------------------- #
# Goal pacing
# --------------------------------------------------------------------------- #
def required_pace_value(
    start_value: float,
    target_value: float,
    start_date: date,
    target_date: date,
    at: date,
) -> float:
    """Linear interpolation of where a metric should be on `at` to hit target."""
    span = (target_date - start_date).days or 1
    elapsed = max(0, min(span, (at - start_date).days))
    return start_value + (target_value - start_value) * (elapsed / span)


def linear_fit(values: list[float]) -> dict | None:
    """Ordinary-least-squares line of best fit over evenly-spaced points.

    x is the point index (0, 1, 2, …), so the slope is "per step" — here, per
    month. Returns slope, intercept, and the fitted y at the first and last
    points (handy for drawing the trend line). None if fewer than 2 points.
    """
    n = len(values)
    if n < 2:
        return None
    xs = list(range(n))
    mean_x = sum(xs) / n
    mean_y = sum(values) / n
    denom = sum((x - mean_x) ** 2 for x in xs)
    if denom == 0:
        return None
    slope = sum((xs[i] - mean_x) * (values[i] - mean_y) for i in range(n)) / denom
    intercept = mean_y - slope * mean_x
    return {
        "slope_per_month": round(slope, 2),
        "intercept": round(intercept, 2),
        "y_start": round(intercept, 2),
        "y_end": round(intercept + slope * (n - 1), 2),
    }
