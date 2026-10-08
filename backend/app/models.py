"""SQLAlchemy models for Ungovernable — personal goals & finance tracker.

Single-user app: identity is enforced by Azure App Service Easy Auth at the
edge, so we don't model multiple users. Every table is "the owner's".
"""
from datetime import date

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.database import Base


# ---------------------------------------------------------------------------
# Finance
# ---------------------------------------------------------------------------

# Allowed expense categories. Subcategories are free-form, suggested from history.
EXPENSE_CATEGORIES = [
    "Car",
    "Dates",
    "Debt Payments",
    "Food",
    "Home",
    "Investments",
    "Miscellaneous",
    "Pet",
    "Subscriptions",
]


class Expense(Base):
    """A single expense line. `date` is when it was added."""

    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    date = Column(Date, nullable=False, default=date.today, index=True)
    category = Column(String(40), nullable=False, index=True)
    subcategory = Column(String(80), nullable=True, index=True)
    recurring = Column(Boolean, nullable=False, default=False)
    note = Column(String(200), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class MonthlyFinance(Base):
    """One row per month: the audited financial snapshot.

    Net worth is derived (cash + investments + 401k - debt); home equity is
    tracked but intentionally excluded from net worth.
    """

    __tablename__ = "monthly_finance"
    __table_args__ = (UniqueConstraint("year", "month", name="uq_year_month"),)

    id = Column(Integer, primary_key=True, index=True)
    month = Column(Integer, nullable=False)  # 1-12
    year = Column(Integer, nullable=False)
    total_cash = Column(Numeric(14, 2), nullable=False, default=0)
    investments = Column(Numeric(14, 2), nullable=False, default=0)  # outside 401k
    debt = Column(Numeric(14, 2), nullable=False, default=0)
    monthly_gain = Column(Numeric(14, 2), nullable=False, default=0)  # paychecks etc
    monthly_loss = Column(Numeric(14, 2), nullable=False, default=0)  # sum of expenses
    balance_401k = Column(Numeric(14, 2), nullable=False, default=0)
    home_equity = Column(Numeric(14, 2), nullable=False, default=0)  # NOT in networth
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    @property
    def networth(self) -> float:
        return float(
            (self.total_cash or 0)
            + (self.investments or 0)
            + (self.balance_401k or 0)
            - (self.debt or 0)
        )


# ---------------------------------------------------------------------------
# Workouts
# ---------------------------------------------------------------------------

# Starter exercise names, used only to seed goals/demo data. The exercise
# field itself is free-form text now — these are not an enforced allow-list.
# An entry's type (lift vs run) is inferred from which fields are populated:
# `seconds` set -> run; `weight`/`reps` set -> lift.
LIFT_EXERCISES = ["bench", "squat", "pull-ups"]  # weight x reps -> est 1RM
RUN_EXERCISES = ["1mile", "2mile", "3mile", "4mile", "5mile", "5k", "10k", "15k"]


class WorkoutGoal(Base):
    """A target for an exercise, defaulting to 12/31 of the current year."""

    __tablename__ = "workout_goals"

    id = Column(Integer, primary_key=True, index=True)
    exercise = Column(String(80), nullable=False, index=True)
    # lifts: target_weight x target_reps. runs: target_seconds.
    target_weight = Column(Float, nullable=True)
    target_reps = Column(Integer, nullable=True)
    target_seconds = Column(Integer, nullable=True)
    target_date = Column(Date, nullable=False)


class WorkoutEntry(Base):
    """A logged best-set (lift) or time (run). `exercise` is free-form text;
    whether it's a lift or a run is inferred from which fields are set."""

    __tablename__ = "workout_entries"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, default=date.today, index=True)
    group = Column(String(10), nullable=False)  # Push | Pull | Legs | Run | Other
    exercise = Column(String(80), nullable=False, index=True)
    weight = Column(Float, nullable=True)  # lifts
    reps = Column(Integer, nullable=True)  # lifts
    seconds = Column(Integer, nullable=True)  # runs (total seconds)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
