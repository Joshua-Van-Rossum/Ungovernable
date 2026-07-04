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
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
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
# Habits & daily tracking
# ---------------------------------------------------------------------------


class Habit(Base):
    """A daily habit definition. `kind` is 'check' (boolean) or 'number' (hours)."""

    __tablename__ = "habits"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(80), nullable=False)
    kind = Column(String(10), nullable=False, default="check")  # check | number
    unit = Column(String(20), nullable=True)  # e.g. "hours"
    target = Column(Float, nullable=True)  # e.g. 1.0 hour, 0.33 (20m)
    sort_order = Column(Integer, nullable=False, default=0)
    active = Column(Boolean, nullable=False, default=True)

    logs = relationship("HabitLog", back_populates="habit", cascade="all, delete-orphan")


class HabitLog(Base):
    """One row per (habit, day). `done` for checks, `value` for numbers."""

    __tablename__ = "habit_logs"
    __table_args__ = (UniqueConstraint("habit_id", "date", name="uq_habit_date"),)

    id = Column(Integer, primary_key=True, index=True)
    habit_id = Column(Integer, ForeignKey("habits.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, default=date.today, index=True)
    done = Column(Boolean, nullable=False, default=False)
    value = Column(Float, nullable=True)  # for number habits (e.g. screen-time hrs)

    habit = relationship("Habit", back_populates="logs")


class AppVisit(Base):
    """Records each day the owner opens the app — powers the commit grid."""

    __tablename__ = "app_visits"
    __table_args__ = (UniqueConstraint("date", name="uq_visit_date"),)

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, default=date.today, index=True)
    count = Column(Integer, nullable=False, default=1)


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    notes = Column(Text, nullable=False, default="")
    archived = Column(Boolean, nullable=False, default=False)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


# ---------------------------------------------------------------------------
# Workouts
# ---------------------------------------------------------------------------

# Exercises grouped for the dropdown.
LIFT_EXERCISES = ["bench", "squat", "pull-ups"]  # weight x reps -> est 1RM
RUN_EXERCISES = ["1mile", "2mile", "3mile", "4mile", "5mile", "5k", "10k", "15k"]


class WorkoutGoal(Base):
    """A target for an exercise, defaulting to 12/31 of the current year."""

    __tablename__ = "workout_goals"

    id = Column(Integer, primary_key=True, index=True)
    exercise = Column(String(20), nullable=False, index=True)
    # lifts: target_weight x target_reps. runs: target_seconds.
    target_weight = Column(Float, nullable=True)
    target_reps = Column(Integer, nullable=True)
    target_seconds = Column(Integer, nullable=True)
    target_date = Column(Date, nullable=False)


class WorkoutEntry(Base):
    """A logged best-set (lift) or time (run)."""

    __tablename__ = "workout_entries"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, default=date.today, index=True)
    group = Column(String(10), nullable=False)  # Push | Pull | Legs | Run
    exercise = Column(String(20), nullable=False, index=True)
    weight = Column(Float, nullable=True)  # lifts
    reps = Column(Integer, nullable=True)  # lifts
    seconds = Column(Integer, nullable=True)  # runs (total seconds)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ---------------------------------------------------------------------------
# Upskilling — daily lessons + spaced-repetition flashcards
# ---------------------------------------------------------------------------

UPSKILL_DOMAINS = [
    "Data Science",
    "Statistics & Probability",
    "Linear Algebra",
    "Calculus & Optimization",
    "Database Administration",
    "SQL & Query Optimization",
    "Python Programming",
    "AI Engineering",
    "Machine Learning",
    "Deep Learning & Neural Networks",
    "Cloud Engineering",
    "Systems Design",
    "Software Engineering Fundamentals",
    "Data Structures & Algorithms",
    "DevOps & CI/CD",
]


class DailyLesson(Base):
    """One AI-generated lesson per calendar day. Same lesson shown all day."""

    __tablename__ = "daily_lessons"
    __table_args__ = (UniqueConstraint("date", name="uq_lesson_date"),)

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, default=date.today, index=True)
    domain = Column(String(60), nullable=False)
    topic = Column(String(120), nullable=False)
    level = Column(String(20), nullable=False, default="intermediate")  # intro/intermediate/advanced
    summary = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    cards = relationship("Flashcard", back_populates="lesson", cascade="all, delete-orphan")


class Flashcard(Base):
    """A single Q&A card tied to a daily lesson.

    SRS fields follow a simplified SM-2 variant:
      - interval: days until next review
      - ease: ease factor (starts at 2.5, adjusted per review)
      - due_date: next scheduled review date
      - reps: total reviews completed
    """

    __tablename__ = "flashcards"

    id = Column(Integer, primary_key=True, index=True)
    lesson_id = Column(Integer, ForeignKey("daily_lessons.id"), nullable=False, index=True)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    # SRS scheduling
    interval = Column(Integer, nullable=False, default=1)   # days
    ease = Column(Float, nullable=False, default=2.5)
    due_date = Column(Date, nullable=False, default=date.today)
    reps = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    lesson = relationship("DailyLesson", back_populates="cards")
    reviews = relationship("FlashcardReview", back_populates="card", cascade="all, delete-orphan")


class FlashcardReview(Base):
    """Records each time the user rates a card.

    rating: 0=Again, 1=Hard, 2=Good, 3=Easy
    """

    __tablename__ = "flashcard_reviews"

    id = Column(Integer, primary_key=True, index=True)
    card_id = Column(Integer, ForeignKey("flashcards.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, default=date.today, index=True)
    rating = Column(Integer, nullable=False)  # 0-3
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    card = relationship("Flashcard", back_populates="reviews")
