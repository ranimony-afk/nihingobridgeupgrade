# 00 — READ THIS FIRST

## What Is This Repository?

This is the **NihongoBridge Integration Control Repository**.

It does **not** contain the application itself.

It is the **control tower** for safely integrating and completing the NihongoBridge Japanese-learning platform across two source repositories.

---

## Repository Map

| Repository | Purpose | Authority |
|---|---|---|
| `nihingobridgeupgrade` | Canonical application repository | PRIMARY — all production code lives here |
| `Knowledge-base-NihongoBridge` | Knowledge, ETL, UI, CMS, test, mobile source | SECONDARY — verified components only |
| `nihongobridge-integration-masterplan/` (this) | Integration control, planning, prompts, reports | CONTROL — no application code |

---

## How To Use This Repository

### 1. Before Starting Any Phase

1. Read `MASTER_ROADMAP.md` to understand the full integration plan
2. Read `TARGET_ARCHITECTURE.md` to understand the target system
3. Read `DOMAIN_MODEL.md` to understand the domain entities
4. Read `API_CONTRACT.md` to understand the API surface
5. Check `DECISION_LOG.md` for any prior decisions that affect your phase
6. Check `RISK_REGISTER.md` for known risks

### 2. When Starting a Phase

1. Navigate to `prompts/phase-NN/` for the phase-specific Arena prompts
2. Navigate to `checklists/` for the phase completion checklist
3. Use the master Arena instruction (embedded in MASTER_ROADMAP.md) as your system-level context

### 3. During a Phase

1. Log every significant decision in `DECISION_LOG.md`
2. Update `RISK_REGISTER.md` if new risks emerge
3. Place audit/analysis reports in the appropriate `reports/` subdirectory
4. Complete the phase checklist before requesting gate approval

### 4. After Completing a Phase

1. Verify the phase checklist is fully complete
2. Ensure all reports are filed
3. Ensure all decisions are logged
4. Confirm no regressions in existing functionality
5. Document rollback procedure
6. Request gate approval before proceeding

---

## Absolute Rules

1. **DO NOT** rebuild NihongoBridge from scratch
2. **DO NOT** perform destructive database operations without explicit authorization
3. **DO NOT** replace Repository 1 authentication with Repository 2 authentication
4. **DO NOT** silently start future phases
5. **DO NOT** claim something exists without evidence
6. **DO NOT** guess when uncertain — STOP and report

---

## Directory Structure

```
nihongobridge-integration-masterplan/
├── 00_READ_FIRST.md          ← You are here
├── MASTER_ROADMAP.md         ← Full integration roadmap with all phases
├── TARGET_ARCHITECTURE.md    ← Target system architecture
├── DOMAIN_MODEL.md           ← Domain entities and relationships
├── API_CONTRACT.md           ← API surface and contracts
├── DECISION_LOG.md           ← All integration decisions
├── RISK_REGISTER.md          ← Known risks and mitigations
│
├── prompts/                  ← Arena AI prompts per phase
│   ├── phase-00/             ← Phase 0: Discovery & Audit
│   ├── phase-01/             ← Phase 1: Foundation & Schema
│   ├── phase-02/             ← Phase 2: Knowledge ETL
│   ├── phase-03/             ← Phase 3: Search & Retrieval
│   ├── phase-04/             ← Phase 4: Learning Engine
│   ├── phase-05/             ← Phase 5: SRS & Review
│   ├── phase-06/             ← Phase 6: AI Integration
│   ├── phase-07/             ← Phase 7: Gamification
│   ├── phase-08/             ← Phase 8: Mobile (Flutter)
│   └── phase-09/             ← Phase 9: Production & Deploy
│
├── reports/                  ← Analysis and audit reports
│   ├── audits/               ← Code and architecture audits
│   ├── database/             ← Database analysis reports
│   ├── etl/                  ← ETL pipeline reports
│   ├── search/               ← Search infrastructure reports
│   ├── ai/                   ← AI integration reports
│   ├── mobile/               ← Mobile/Flutter reports
│   ├── testing/              ← Test coverage and results
│   └── deployment/           ← Deployment and infrastructure reports
│
└── checklists/               ← Phase completion checklists
```

---

## Contact & Ownership

This control repository is maintained by the NihongoBridge integration team.

All phase work must reference this repository as the source of truth for planning, decisions, and verification.
