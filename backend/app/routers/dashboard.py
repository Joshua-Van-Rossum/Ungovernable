"""Dashboard aggregates. Finance/workout KPIs live in their own routers;
this module is reserved for cross-cutting dashboard aggregates as they're
added."""
from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])
