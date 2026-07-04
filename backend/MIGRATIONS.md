# Migration guide for database

## Initial Setup

Before running migrations, ensure you have alembic installed:
```bash
pip install -r requirements.txt
```

## Create Initial Migration

```bash
alembic revision --autogenerate -m "Initial migration"
```

## Apply Migrations

```bash
alembic upgrade head
```

## Rollback

```bash
alembic downgrade -1
```

## View Migration History

```bash
alembic current
```

## Notes for Azure Migration

When migrating to Azure Database (PostgreSQL or SQL Server):
1. Update `DATABASE_URL` in `.env` to point to your Azure database
2. Run `alembic upgrade head` to apply schema changes
3. All migrations are tracked in the `versions/` directory for reproducibility
