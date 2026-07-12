"""Pydantic schemas for request/response validation."""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


# --------------------------------------------------------------------------- #
# Finance
# --------------------------------------------------------------------------- #
class ExpenseBase(BaseModel):
    amount: Decimal = Field(..., gt=0)
    category: str
    subcategory: Optional[str] = None
    recurring: bool = False
    note: Optional[str] = None
    date: Optional[date] = None


class ExpenseCreate(ExpenseBase):
    pass


class Expense(ExpenseBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    date: date
    created_at: datetime


class MonthlyFinanceBase(BaseModel):
    month: int = Field(..., ge=1, le=12)
    year: int
    total_cash: Decimal = Decimal("0")
    investments: Decimal = Decimal("0")
    debt: Decimal = Decimal("0")
    monthly_gain: Decimal = Decimal("0")
    monthly_loss: Decimal = Decimal("0")
    balance_401k: Decimal = Decimal("0")
    home_equity: Decimal = Decimal("0")


class MonthlyFinanceCreate(MonthlyFinanceBase):
    pass


class MonthlyFinanceUpdate(BaseModel):
    total_cash: Optional[Decimal] = None
    investments: Optional[Decimal] = None
    debt: Optional[Decimal] = None
    monthly_gain: Optional[Decimal] = None
    monthly_loss: Optional[Decimal] = None
    balance_401k: Optional[Decimal] = None
    home_equity: Optional[Decimal] = None


class MonthlyFinance(MonthlyFinanceBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    networth: float


class PaycheckIn(BaseModel):
    amount: Decimal = Field(..., gt=0)
    # optional target month/year; defaults to current
    month: Optional[int] = None
    year: Optional[int] = None


# --------------------------------------------------------------------------- #
# Habits
# --------------------------------------------------------------------------- #
class Habit(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    kind: str
    unit: Optional[str] = None
    target: Optional[float] = None
    sort_order: int
    active: bool


class HabitLogIn(BaseModel):
    habit_id: int
    date: Optional[date] = None
    done: Optional[bool] = None
    value: Optional[float] = None


class HabitLog(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    habit_id: int
    date: date
    done: bool
    value: Optional[float] = None


class HabitWithToday(Habit):
    """A habit plus today's log state (for the dashboard tracker)."""
    today_done: bool = False
    today_value: Optional[float] = None
    streak: int = 0


# --------------------------------------------------------------------------- #
# Projects
# --------------------------------------------------------------------------- #
class ProjectBase(BaseModel):
    name: str
    notes: str = ""


class ProjectCreate(BaseModel):
    name: str


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    notes: Optional[str] = None
    archived: Optional[bool] = None


class Project(ProjectBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    archived: bool
    sort_order: int
    updated_at: datetime


# --------------------------------------------------------------------------- #
# Workouts
# --------------------------------------------------------------------------- #
class WorkoutGoalIn(BaseModel):
    exercise: str
    target_weight: Optional[float] = None
    target_reps: Optional[int] = None
    target_seconds: Optional[int] = None
    target_date: Optional[date] = None


class WorkoutGoal(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    exercise: str
    target_weight: Optional[float] = None
    target_reps: Optional[int] = None
    target_seconds: Optional[int] = None
    target_date: date


class WorkoutEntryIn(BaseModel):
    exercise: str
    group: Optional[str] = None  # inferred if omitted
    date: Optional[date] = None
    weight: Optional[float] = None
    reps: Optional[int] = None
    seconds: Optional[int] = None

    @field_validator("date", mode="before")
    @classmethod
    def _blank_date_to_none(cls, v):
        return v or None


class WorkoutEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    date: date
    group: str
    exercise: str
    weight: Optional[float] = None
    reps: Optional[int] = None
    seconds: Optional[int] = None
    est_1rm: Optional[float] = None


# --------------------------------------------------------------------------- #
# Dashboard / aggregate responses (loose shapes; built ad-hoc in routers)
# --------------------------------------------------------------------------- #
class CommitCell(BaseModel):
    date: date
    count: int


class KPISet(BaseModel):
    networth: float
    total_cash: float
    month_spend: float
