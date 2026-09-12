# Phase 01 — Foundation & Schema Checklist

## Gate Requirements

All mandatory items must pass before proceeding to Phase 02.

---

## Schema Design
- [ ] Consolidated schema plan reviewed and approved
- [ ] All domain entities represented
- [ ] Provenance columns present on knowledge tables
- [ ] Indexes defined for common queries
- [ ] Foreign key relationships correct
- [ ] No destructive changes to existing tables

## Implementation
- [ ] Drizzle schema file updated (src/db/schema.ts)
- [ ] Schema applied via drizzle-kit push
- [ ] No errors during schema application
- [ ] Existing data preserved (if any)

## Compatibility
- [ ] Existing API routes tested and functional
- [ ] Existing queries execute correctly
- [ ] No type errors from schema changes
- [ ] Application builds successfully

## Migration
- [ ] Migration plan documented
- [ ] Rollback procedure documented
- [ ] Rollback tested (can revert if needed)

## Documentation
- [ ] Decision log updated
- [ ] Risk register updated
- [ ] Schema documentation current

## Gate Approval
- [ ] All mandatory items pass
- [ ] No unresolved blockers
- [ ] Approved to proceed to Phase 02
