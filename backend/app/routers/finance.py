"""Finance: expenses, monthly snapshots, paychecks, graph aggregates, KPIs."""
from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import logic, models, schemas
from app.database import get_db

router = APIRouter(prefix="/api/finance", tags=["finance"])


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _get_or_create_month(db: Session, year: int, month: int) -> models.MonthlyFinance:
    row = (
        db.query(models.MonthlyFinance)
        .filter_by(year=year, month=month)
        .one_or_none()
    )
    if row is None:
        # Carry forward balances from the most recent prior month, if any.
        prior = (
            db.query(models.MonthlyFinance)
            .order_by(models.MonthlyFinance.year.desc(), models.MonthlyFinance.month.desc())
            .first()
        )
        row = models.MonthlyFinance(
            year=year,
            month=month,
            total_cash=prior.total_cash if prior else Decimal(0),
            investments=prior.investments if prior else Decimal(0),
            debt=prior.debt if prior else Decimal(0),
            balance_401k=prior.balance_401k if prior else Decimal(0),
            home_equity=prior.home_equity if prior else Decimal(0),
        )
        db.add(row)
        db.flush()
    return row


# --------------------------------------------------------------------------- #
# Expenses
# --------------------------------------------------------------------------- #
@router.get("/categories")
def categories():
    return models.EXPENSE_CATEGORIES


@router.get("/subcategories")
def subcategories(category: str, db: Session = Depends(get_db)):
    """Distinct subcategories already used for a category (for the dropdown)."""
    rows = (
        db.query(models.Expense.subcategory)
        .filter(models.Expense.category == category)
        .filter(models.Expense.subcategory.isnot(None))
        .distinct()
        .all()
    )
    return sorted({r[0] for r in rows if r[0]})


@router.get("/expenses", response_model=list[schemas.Expense])
def list_expenses(
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    return (
        db.query(models.Expense)
        .order_by(models.Expense.date.desc(), models.Expense.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.post("/expenses", response_model=schemas.Expense)
def add_expense(payload: schemas.ExpenseCreate, db: Session = Depends(get_db)):
    if payload.category not in models.EXPENSE_CATEGORIES:
        raise HTTPException(400, f"Unknown category: {payload.category}")
    when = payload.date or date.today()
    exp = models.Expense(
        amount=payload.amount,
        date=when,
        category=payload.category,
        subcategory=(payload.subcategory or None),
        recurring=payload.recurring,
        note=payload.note,
    )
    db.add(exp)
    # Roll the expense into the relevant month's snapshot.
    month_row = _get_or_create_month(db, when.year, when.month)
    logic.apply_expense_to_month(month_row, payload.amount, payload.category)
    db.commit()
    db.refresh(exp)
    return exp


@router.delete("/expenses/{expense_id}")
def delete_expense(expense_id: int, db: Session = Depends(get_db)):
    exp = db.get(models.Expense, expense_id)
    if not exp:
        raise HTTPException(404, "Expense not found")
    # Reverse its effect on the month snapshot.
    month_row = (
        db.query(models.MonthlyFinance)
        .filter_by(year=exp.date.year, month=exp.date.month)
        .one_or_none()
    )
    if month_row:
        month_row.monthly_loss = (month_row.monthly_loss or Decimal(0)) - exp.amount
        month_row.total_cash = (month_row.total_cash or Decimal(0)) + exp.amount
        if exp.category == "Debt Payments":
            month_row.debt = (month_row.debt or Decimal(0)) + exp.amount
        elif exp.category == "Investments":
            month_row.investments = (month_row.investments or Decimal(0)) - exp.amount
    db.delete(exp)
    db.commit()
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Monthly finance table
# --------------------------------------------------------------------------- #
@router.get("/months", response_model=list[schemas.MonthlyFinance])
def list_months(db: Session = Depends(get_db)):
    return (
        db.query(models.MonthlyFinance)
        .order_by(models.MonthlyFinance.year.asc(), models.MonthlyFinance.month.asc())
        .all()
    )


@router.post("/months", response_model=schemas.MonthlyFinance)
def upsert_month(payload: schemas.MonthlyFinanceCreate, db: Session = Depends(get_db)):
    row = _get_or_create_month(db, payload.year, payload.month)
    for field in (
        "total_cash",
        "investments",
        "debt",
        "monthly_gain",
        "monthly_loss",
        "balance_401k",
        "home_equity",
    ):
        setattr(row, field, getattr(payload, field))
    db.commit()
    db.refresh(row)
    return row


@router.patch("/months/{month_id}", response_model=schemas.MonthlyFinance)
def update_month(
    month_id: int, payload: schemas.MonthlyFinanceUpdate, db: Session = Depends(get_db)
):
    row = db.get(models.MonthlyFinance, month_id)
    if not row:
        raise HTTPException(404, "Month not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return row


@router.get("/audit-due")
def audit_due(db: Session = Depends(get_db)):
    """Has the current month been entered into the monthly finance table?"""
    today = date.today()
    exists = (
        db.query(models.MonthlyFinance)
        .filter_by(year=today.year, month=today.month)
        .first()
        is not None
    )
    return {"due": not exists, "year": today.year, "month": today.month}


# --------------------------------------------------------------------------- #
# Paycheck
# --------------------------------------------------------------------------- #
@router.post("/paycheck", response_model=schemas.MonthlyFinance)
def add_paycheck(payload: schemas.PaycheckIn, db: Session = Depends(get_db)):
    today = date.today()
    row = _get_or_create_month(db, payload.year or today.year, payload.month or today.month)
    logic.apply_paycheck_to_month(row, payload.amount)
    db.commit()
    db.refresh(row)
    return row


# --------------------------------------------------------------------------- #
# Graph aggregates
# --------------------------------------------------------------------------- #
@router.get("/expense-report")
def expense_report(
    months: int = Query(12, ge=1, le=60),
    end_year: Optional[int] = None,
    end_month: Optional[int] = None,
    category: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Totals by category (or by subcategory if a category is given) over a window.

    `total` excludes Investments and Debt Payments.
    """
    today = date.today()
    ey = end_year or today.year
    em = end_month or today.month
    # window start
    start_index = (ey * 12 + (em - 1)) - (months - 1)
    sy, sm = divmod(start_index, 12)
    sm += 1
    start = date(sy, sm, 1)
    # end = last day of end month -> use first day of next month as exclusive bound
    end_excl_index = ey * 12 + em
    eey, eem = divmod(end_excl_index, 12)
    eem += 1
    end_excl = date(eey, eem, 1)

    q = (
        db.query(models.Expense)
        .filter(models.Expense.date >= start)
        .filter(models.Expense.date < end_excl)
    )
    if category:
        q = q.filter(models.Expense.category == category)

    buckets: dict[str, Decimal] = defaultdict(lambda: Decimal(0))
    excluded_total = Decimal(0)
    grand_total = Decimal(0)
    for e in q.all():
        key = (e.subcategory or "—") if category else e.category
        buckets[key] += e.amount
        grand_total += e.amount
        if e.category in ("Investments", "Debt Payments"):
            excluded_total += e.amount

    data = [
        {"label": k, "amount": float(v)}
        for k, v in sorted(buckets.items(), key=lambda kv: kv[1], reverse=True)
    ]
    return {
        "window": {"start": start.isoformat(), "endExclusive": end_excl.isoformat()},
        "drilldown": category,
        "data": data,
        "total_excluding_inv_debt": float(grand_total - excluded_total),
    }


_METRIC_FIELDS = {
    "networth": None,  # computed
    "debt": "debt",
    "expenses": "monthly_loss",
    "income": "monthly_gain",
    "investments": "investments",
    "401k": "balance_401k",
    "home_equity": "home_equity",
    "cash": "total_cash",
}


# Flow metrics use a flat average line; stock/balance metrics use a best-fit line.
_AVERAGE_METRICS = {"expenses", "income"}


@router.get("/progress")
def progress(
    metric: str = Query("networth"),
    months: int = Query(12, ge=0, le=600),  # 0 = all available history
    db: Session = Depends(get_db),
):
    """Monthly time-series for a metric, plus a trend line.

    The trend is a flat average for flow metrics (expenses, income) and an
    OLS line of best fit for balances (net worth, debt, investments, 401k,
    home equity). For the best-fit case the callout reports the slope ($/month).
    """
    if metric not in _METRIC_FIELDS:
        raise HTTPException(400, f"Unknown metric: {metric}")
    rows = (
        db.query(models.MonthlyFinance)
        .order_by(models.MonthlyFinance.year.asc(), models.MonthlyFinance.month.asc())
        .all()
    )
    if months:  # 0 means "all"
        rows = rows[-months:]

    series = []
    for r in rows:
        if metric == "networth":
            val = r.networth
        else:
            val = float(getattr(r, _METRIC_FIELDS[metric]) or 0)
        series.append({"label": f"{r.year}-{r.month:02d}", "value": val})

    values = [p["value"] for p in series]
    avg = round(sum(values) / len(values), 2) if values else 0

    if metric in _AVERAGE_METRICS:
        trend = {"type": "average", "average": avg}
    else:
        fit = logic.linear_fit(values)
        trend = {"type": "fit", **fit} if fit else {"type": "average", "average": avg}

    return {"metric": metric, "series": series, "average": avg, "trend": trend}


@router.get("/savings-rate")
def savings_rate_history(months: int = Query(12, ge=1, le=60), db: Session = Depends(get_db)):
    """Monthly savings rates for the bar chart. (gain - loss) / gain per month."""
    rows = (
        db.query(models.MonthlyFinance)
        .filter(models.MonthlyFinance.monthly_gain > 0)
        .order_by(models.MonthlyFinance.year.asc(), models.MonthlyFinance.month.asc())
        .all()
    )[-months:]
    series = []
    for r in rows:
        gain = float(r.monthly_gain)
        loss = float(r.monthly_loss)
        rate = (gain - loss) / gain if gain else 0.0
        series.append({
            "label": f"{r.year}-{r.month:02d}",
            "short": f"{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][r.month-1]} {str(r.year)[2:]}",
            "rate": round(rate * 100, 1),
            "gain": gain,
            "loss": loss,
        })
    return {"series": series}


@router.get("/equity")
def equity(db: Session = Depends(get_db)):
    row = (
        db.query(models.MonthlyFinance)
        .order_by(models.MonthlyFinance.year.desc(), models.MonthlyFinance.month.desc())
        .first()
    )
    eq = row.home_equity if row else Decimal(0)
    return {
        "home_value": float(logic.HOME_VALUE),
        "home_equity": float(eq or 0),
        "percent": logic.equity_percent(eq or Decimal(0)),
    }


# --------------------------------------------------------------------------- #
# KPIs (this month / last month / this-month-last-year / running & rolling year)
# --------------------------------------------------------------------------- #
def _expense_sum(db: Session, start: date, end_excl: date) -> float:
    total = (
        db.query(func.coalesce(func.sum(models.Expense.amount), 0))
        .filter(models.Expense.date >= start)
        .filter(models.Expense.date < end_excl)
        .scalar()
    )
    return float(total or 0)


@router.get("/kpis")
def kpis(db: Session = Depends(get_db)):
    today = date.today()
    latest = (
        db.query(models.MonthlyFinance)
        .order_by(models.MonthlyFinance.year.desc(), models.MonthlyFinance.month.desc())
        .first()
    )

    def month_bounds(y: int, m: int) -> tuple[date, date]:
        nxt = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)
        return date(y, m, 1), nxt

    tm_start, tm_end = month_bounds(today.year, today.month)
    lm_y, lm_m = (today.year - 1, 12) if today.month == 1 else (today.year, today.month - 1)
    lm_start, lm_end = month_bounds(lm_y, lm_m)
    ly_start, ly_end = month_bounds(today.year - 1, today.month)

    # YTD (running year from Jan 1) and rolling 365.
    ytd_start = date(today.year, 1, 1)
    ytd_prev_start = date(today.year - 1, 1, 1)
    ytd_prev_end = date(today.year - 1, today.month, today.day)
    roll_start = date(today.year - 1, today.month, today.day)
    roll_prev_start = date(today.year - 2, today.month, today.day)

    balances = {
        "networth": latest.networth if latest else 0,
        "total_cash": float(latest.total_cash) if latest else 0,
        "debt": float(latest.debt) if latest else 0,
        "investments": float(latest.investments) if latest else 0,
        "balance_401k": float(latest.balance_401k) if latest else 0,
        "home_equity": float(latest.home_equity) if latest else 0,
    }

    # Savings rate for the most recent audited month that has gain data.
    # Formula: (gain - loss) / gain. Null if no gain recorded.
    latest_with_gain = (
        db.query(models.MonthlyFinance)
        .filter(models.MonthlyFinance.monthly_gain > 0)
        .order_by(models.MonthlyFinance.year.desc(), models.MonthlyFinance.month.desc())
        .first()
    )
    if latest_with_gain:
        gain = float(latest_with_gain.monthly_gain)
        loss = float(latest_with_gain.monthly_loss)
        savings_rate = (gain - loss) / gain if gain else None
        savings_month = {"year": latest_with_gain.year, "month": latest_with_gain.month}
    else:
        savings_rate = None
        savings_month = None

    return {
        "balances": balances,
        "spend": {
            "this_month": _expense_sum(db, tm_start, tm_end),
            "last_month": _expense_sum(db, lm_start, lm_end),
            "this_month_last_year": _expense_sum(db, ly_start, ly_end),
            "ytd": _expense_sum(db, ytd_start, tm_end),
            "ytd_last_year": _expense_sum(db, ytd_prev_start, ytd_prev_end),
            "rolling_year": _expense_sum(db, roll_start, tm_end),
            "rolling_year_prev": _expense_sum(db, roll_prev_start, roll_start),
        },
        "savings_rate": savings_rate,
        "savings_month": savings_month,
    }
