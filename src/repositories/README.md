# Repositories

Data access for the canonical PostgreSQL schema. One repository per table
group, owned by exactly one domain (`docs/architecture/DATABASE_OWNERSHIP.md`).

## Rules

1. Only a repository issues Drizzle queries for its own tables.
2. Never read or write another domain's tables — call that domain's service.
3. No HTTP, no framework types, no business rules — just typed persistence.
4. ETL-facing repositories implement `UpsertRepository` and must be
   idempotent on `(source, source_id)` with a checksum skip.

`base.ts` defines the shared contracts. Concrete repositories arrive with the
phase that creates their tables.
