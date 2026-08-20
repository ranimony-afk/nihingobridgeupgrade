# Phase 09 — Production & Deployment Prompts

## Objective
Production readiness: CI/CD, monitoring, security, backups, disaster recovery.

## Prerequisites
- All previous phases complete
- All feature tests passing
- Security review planned

## Prompt Sequence

### Prompt 09-01: Production Readiness Audit
```
Perform a production readiness audit.
Check: error handling, logging, security headers,
input validation, rate limiting, CORS,
environment variables, secrets management.
Identify gaps and create remediation plan.
```

### Prompt 09-02: CI/CD Pipeline
```
Implement CI/CD pipeline (GitHub Actions or equivalent).
Stages: lint, typecheck, test, build, deploy.
Include: database migration in deploy step,
rollback capability, environment-specific configs.
```

### Prompt 09-03: Testing Infrastructure
```
Establish comprehensive testing:
- Unit tests for domain services
- Integration tests for API routes
- E2E tests for critical user flows
- Database tests for schema and queries
Set up test database and fixtures.
```

### Prompt 09-04: Monitoring & Logging
```
Implement monitoring and logging infrastructure.
Application metrics, error tracking, performance monitoring.
Database monitoring, API response time tracking.
Alert configuration for critical failures.
```

### Prompt 09-05: Security Hardening
```
Perform security hardening:
- Input sanitization audit
- SQL injection prevention verification
- XSS prevention
- CSRF protection
- Rate limiting verification
- Authentication/authorization audit
- Dependency vulnerability scan
```

### Prompt 09-06: Backup & Disaster Recovery
```
Implement backup and disaster recovery:
- Database backup strategy (automated)
- Backup verification (restore testing)
- Disaster recovery procedure
- RTO/RPO targets
- Runbook documentation
```

### Prompt 09-07: Deployment Documentation
```
Create deployment documentation:
- Environment setup guide
- Configuration reference
- Deployment procedure
- Rollback procedure
- Troubleshooting guide
- Operational runbook
```

## Deliverables Checklist
- [ ] Production readiness audit
- [ ] CI/CD pipeline
- [ ] Test automation
- [ ] Monitoring setup
- [ ] Logging infrastructure
- [ ] Security audit complete
- [ ] Backup strategy implemented
- [ ] Disaster recovery plan
- [ ] Deployment documentation
- [ ] Operational runbook
