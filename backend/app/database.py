from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import StaticPool
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./test.db")

# For SQLite, use StaticPool to avoid threading issues
# For production databases (PostgreSQL, Azure SQL), this will be handled differently
connect_args = {}
poolclass = None

engine_kwargs = {}

if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
    poolclass = StaticPool
    engine_kwargs = {"connect_args": connect_args, "poolclass": poolclass}
else:
    # Production (Azure Database for PostgreSQL). pool_pre_ping avoids stale
    # connections after the DB closes idle ones; require TLS by default.
    engine_kwargs = {
        "pool_pre_ping": True,
        "pool_recycle": 1800,
    }

engine = create_engine(DATABASE_URL, **engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency for getting database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
