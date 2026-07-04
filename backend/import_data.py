"""One-time import script: loads expenses and monthly finance from CSV exports.

Run from the backend/ directory:
    python import_data.py

CSV files must be in the backend/ directory:
    - expenses.csv
    - finance.csv
"""
from __future__ import annotations

import csv
import sys
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

from app.database import Base, SessionLocal, engine
from app import models

Base.metadata.create_all(bind=engine)


def parse_money(s: str) -> Decimal:
    """Parse '$1,234.56' or '1234.56' or '1,234.56' to Decimal."""
    return Decimal(s.replace(",", "").replace("$", "").strip())


def parse_date(s: str) -> date:
    """Parse M/D/YYYY to date."""
    return datetime.strptime(s.strip(), "%m/%d/%Y").date()


def import_expenses(db, path: Path):
    if not path.exists():
        print(f"  Skipping expenses — {path} not found.")
        return

    added = 0
    skipped = 0
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                amount = parse_money(row["Amount"])
                exp_date = parse_date(row["Date"])
                category = row["Category"].strip()
                subcategory = row.get("Subcategory", "").strip() or None
                recurring = row.get("Recurring", "False").strip().lower() == "true"

                # Skip rows with no category (malformed)
                if not category:
                    skipped += 1
                    continue

                # Avoid exact duplicates (same amount + date + category + subcategory)
                existing = (
                    db.query(models.Expense)
                    .filter_by(
                        amount=amount,
                        date=exp_date,
                        category=category,
                        subcategory=subcategory,
                    )
                    .first()
                )
                if existing:
                    skipped += 1
                    continue

                db.add(models.Expense(
                    amount=amount,
                    date=exp_date,
                    category=category,
                    subcategory=subcategory,
                    recurring=recurring,
                ))
                added += 1
            except (InvalidOperation, ValueError) as e:
                print(f"  Bad row skipped: {row} — {e}")
                skipped += 1

    db.commit()
    print(f"  Expenses: {added} imported, {skipped} skipped.")


def import_finance(db, path: Path):
    if not path.exists():
        print(f"  Skipping monthly finance — {path} not found.")
        return

    MONTH_MAP = {
        "january": 1, "february": 2, "march": 3, "april": 4,
        "may": 5, "june": 6, "july": 7, "august": 8,
        "september": 9, "october": 10, "november": 11, "december": 12,
    }

    added = 0
    updated = 0
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                month_name = row["Month"].strip().lower()
                month = MONTH_MAP.get(month_name)
                year = int(row["Year"].strip())
                if not month:
                    print(f"  Unknown month name: {row['Month']}, skipping.")
                    continue

                net_worth = parse_money(row["Net Worth"])
                cash = parse_money(row["Cash"])
                investments = parse_money(row["Investments"])
                debt = parse_money(row["Debt"])
                monthly_gain = parse_money(row["Monthly Gain"])
                monthly_loss = parse_money(row["Monthly Loss"])
                balance_401k = parse_money(row.get("401K", "0") or "0")
                home_equity = parse_money(row.get("Home Equity", "0") or "0")

                existing = (
                    db.query(models.MonthlyFinance)
                    .filter_by(year=year, month=month)
                    .one_or_none()
                )
                if existing:
                    # Overwrite with real data
                    existing.total_cash = cash
                    existing.investments = investments
                    existing.debt = debt
                    existing.monthly_gain = monthly_gain
                    existing.monthly_loss = monthly_loss
                    existing.balance_401k = balance_401k
                    existing.home_equity = home_equity
                    updated += 1
                else:
                    db.add(models.MonthlyFinance(
                        year=year,
                        month=month,
                        total_cash=cash,
                        investments=investments,
                        debt=debt,
                        monthly_gain=monthly_gain,
                        monthly_loss=monthly_loss,
                        balance_401k=balance_401k,
                        home_equity=home_equity,
                    ))
                    added += 1
            except (InvalidOperation, ValueError, KeyError) as e:
                print(f"  Bad row skipped: {row} — {e}")

    db.commit()
    print(f"  Monthly finance: {added} added, {updated} updated.")


def main():
    db = SessionLocal()
    try:
        print("Importing expenses...")
        import_expenses(db, Path("expenses.csv"))

        print("Importing monthly finance...")
        import_finance(db, Path("finance.csv"))

        print("Done.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
