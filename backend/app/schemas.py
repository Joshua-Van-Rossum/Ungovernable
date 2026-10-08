"""Pydantic schemas for request/response validation."""
from datetime import date as date_, datetime
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
    date: Optional[date_] = None


class ExpenseCreate(ExpenseBase):
    pass


class Expense(ExpenseBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    date: date_
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
# Workouts
# --------------------------------------------------------------------------- #
class WorkoutGoalIn(BaseModel):
    exercise: str
    target_weight: Optional[float] = None
    target_reps: Optional[int] = None
    target_seconds: Optional[int] = None
    target_date: Optional[date_] = None


class WorkoutGoal(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    exercise: str
    target_weight: Optional[float] = None
    target_reps: Optional[int] = None
    target_seconds: Optional[int] = None
    target_date: date_


class WorkoutEntryIn(BaseModel):
    exercise: str
    group: Optional[str] = None  # inferred if omitted
    date: Optional[date_] = None
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
    date: date_
    group: str
    exercise: str
    weight: Optional[float] = None
    reps: Optional[int] = None
    seconds: Optional[int] = None
    est_1rm: Optional[float] = None
