# Phase 01 — Foundation & Schema Prompts

## Objective
Establish the consolidated database schema that supports all planned functionality while preserving existing data.

## Prerequisites
- Phase 00 complete and gate approved
- Schema comparison report available
- Integration classification matrix available

## Prompt Sequence

### Prompt 01-01: Schema Consolidation Plan
```
Using the Phase 00 schema comparison report and domain model,
create a detailed schema consolidation plan.
For each table: source, action (keep/create/modify/merge),
migration steps, compatibility impact, rollback procedure.
Do NOT execute changes yet — plan only.
```

### Prompt 01-02: Drizzle Schema Implementation
```
Implement the consolidated Drizzle schema in src/db/schema.ts.
Follow the domain model in DOMAIN_MODEL.md.
Include provenance columns for all knowledge tables.
Ensure existing tables are preserved or extended, never dropped.
```

### Prompt 01-03: Schema Migration
```
Apply the schema changes using drizzle-kit push.
Verify: no data loss, existing queries still work,
new tables created correctly, indexes applied.
Report results.
```

### Prompt 01-04: Compatibility Verification
```
Verify that all existing API routes and queries
still function correctly with the updated schema.
Run existing tests if available.
Document any compatibility issues found.
```

## Deliverables Checklist
- [ ] Schema consolidation plan
- [ ] Consolidated Drizzle schema
- [ ] Schema applied successfully
- [ ] Existing queries verified
- [ ] Compatibility report
- [ ] Provenance model implemented
- [ ] Rollback procedure documented
