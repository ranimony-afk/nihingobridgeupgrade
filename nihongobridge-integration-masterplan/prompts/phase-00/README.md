# Phase 00 — Discovery & Audit Prompts

## Objective
Complete audit of both repositories to understand what exists, what works, what conflicts, and what's missing.

## Prompt Sequence

Use the master Arena instruction as system-level context, then execute these prompts in order:

### Prompt 00-01: Repository 1 File Inventory
```
Perform a complete file inventory of the nihingobridgeupgrade repository.
For every file, record: path, type (component/route/service/config/test/type/style/other),
purpose, dependencies, and preliminary classification (KEEP/MODIFY/MERGE/MOVE/DEPRECATE/REPLACE/ARCHIVE).
Output as a structured table.
```

### Prompt 00-02: Repository 2 File Inventory
```
Perform a complete file inventory of the Knowledge-base-NihongoBridge repository.
For every file, record: path, type, purpose, dependencies, and integration classification.
Identify which files contain functionality that should be integrated vs. which are standalone.
Output as a structured table.
```

### Prompt 00-03: Database Schema Audit
```
Analyze the database schemas in both repositories.
Compare table definitions, column types, relationships, and constraints.
Identify overlaps, conflicts, and gaps.
Produce a schema comparison report.
```

### Prompt 00-04: API Route Inventory
```
Inventory all API routes in both repositories.
For each route: method, path, auth requirements, request/response shape, dependencies.
Identify conflicts and overlaps.
Produce an API comparison report.
```

### Prompt 00-05: Authentication Analysis
```
Analyze the authentication implementation in Repository 1.
Document: auth provider, session management, RBAC model, token format, middleware.
Identify any auth-related code in Repository 2 and classify it.
```

### Prompt 00-06: Conflict Analysis
```
Based on the file inventories, schema audit, and API inventory,
produce a comprehensive conflict analysis identifying every point
where Repository 2 functionality conflicts with Repository 1.
For each conflict: severity, recommended resolution, risk.
```

### Prompt 00-07: Integration Classification Matrix
```
Produce the final integration classification matrix.
For every significant component across both repositories:
classification (KEEP/MODIFY/MERGE/MOVE/DEPRECATE/REPLACE/ARCHIVE),
file path, symbol/component, reason, confidence, dependencies, migration risk.
```

## Deliverables Checklist
- [ ] Repository 1 file inventory
- [ ] Repository 2 file inventory
- [ ] Database schema comparison report
- [ ] API route comparison report
- [ ] Authentication analysis
- [ ] Conflict analysis
- [ ] Integration classification matrix
- [ ] Risk register updated
- [ ] Decision log updated
