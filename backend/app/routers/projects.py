"""Projects: a list + a notes editor per project."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=list[schemas.Project])
def list_projects(include_archived: bool = False, db: Session = Depends(get_db)):
    q = db.query(models.Project)
    if not include_archived:
        q = q.filter(models.Project.archived.is_(False))
    return q.order_by(models.Project.sort_order.asc(), models.Project.id.asc()).all()


@router.post("", response_model=schemas.Project)
def create_project(payload: schemas.ProjectCreate, db: Session = Depends(get_db)):
    n = db.query(models.Project).count()
    proj = models.Project(name=payload.name, notes="", sort_order=n)
    db.add(proj)
    db.commit()
    db.refresh(proj)
    return proj


@router.patch("/{project_id}", response_model=schemas.Project)
def update_project(
    project_id: int, payload: schemas.ProjectUpdate, db: Session = Depends(get_db)
):
    proj = db.get(models.Project, project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(proj, field, value)
    db.commit()
    db.refresh(proj)
    return proj


@router.delete("/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    proj = db.get(models.Project, project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    db.delete(proj)
    db.commit()
    return {"ok": True}
