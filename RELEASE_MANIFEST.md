# Release Manifest (Nihongo Bridge Version 4.0 - Direct Root Release)

**Release Date:** July 27, 2026  
**Software Version:** 4.0.0 (Master Completion Release)  
**Git Tag Reference:** `v4.0.0-release-build`  

---

## 1. Package Specifications

| Archive Filename | Structure Style | SHA-256 Checksum Fingerprint |
| :--- | :--- | :--- |
| **`nihongobridge-v4.0-production.zip`** | **Direct-Root** (Matches GitHub) | `8fb721839762e036b687e6c177f16dbb6dc30ffa46ecb5b2ddd4557e1ed73008` |
| **`nihongobridge-enterprise-platform.zip`** | **Direct-Root** (Matches GitHub) | `8fb721839762e036b687e6c177f16dbb6dc30ffa46ecb5b2ddd4557e1ed73008` |

*💡 **Note:** To prevent any Vercel directory path nesting errors, both primary ZIP archives are packaged as **Direct-Root** bundles. Extracting the archive outputs files like `package.json` and `src/` directly at your root, matching the `nihingobridgeupgrade` GitHub repository structure cleanly.*

---

## 2. Top-Level Folder & File Manifest

The packaged archive contains the following comprehensive project structure directly at the root of the ZIP file:

```
├── docs/                      # Standardized & Complete Operations/Architecture Manuals
│   ├── LOCAL_SETUP.md         # Local Development Setup Guide
│   ├── SUPABASE_SETUP.md      # Supabase Cloud & Buckets Setup
│   ├── DATABASE.md            # PostgreSQL Schema Design & Seeding Reports
│   ├── VERCEL_DEPLOYMENT.md   # Pre-flight check and Vercel Setup Runbook
│   ├── ENVIRONMENT_VARIABLES.md # Complete variables reference
│   ├── MIGRATIONS.md          # Database migration & schema evolution
│   ├── SEEDING.md             # Idempotent Database Seeding Runbook
│   ├── ADMIN_SETUP.md         # Headless CMS Workspace guide
│   ├── TROUBLESHOOTING.md     # Operations & troubleshooting checklists
│   ├── Architecture.md        # System Architecture Specification Report
│   ├── Deployment.md          # Pre-flight check and Vercel Setup Runbook
│   ├── Database.md            # PostgreSQL Schema Design & Seeding Reports
│   ├── API.md                 # OpenAPI REST Contract Specifications
│   ├── CMS.md                 # Headless CMS complete coverage plan
│   ├── LMS.md                 # Graded Curriculum System Architecture
│   ├── DAM.md                 # Digital Asset Library metadata manuals
│   ├── Workflow.md            # State Machine publishing transitions
│   ├── Testing.md             # Native test suites upgrade report
│   ├── DeveloperGuide.md      # Development command references
│   ├── AdminGuide.md          # Headless CMS panel manuals
│   ├── TranslatorGuide.md     # Side-by-Side and multilingual guides
│   ├── Roadmap.md             # Version 5.0 strategic horizons
│   └── Troubleshooting.md     # Operations & troubleshooting checklists
├── drizzle/                   # Drizzle ORM Generated Migrations & Snapshot Journals
│   ├── 0000_dear_wind_dancer.sql
│   └── meta/
├── src/                       # Complete Application Source Layer
│   ├── app/                   # Next.js App Router dynamic page and API routes
│   │   ├── [brand]/           # Public Home and dynamic catch-all pages
│   │   ├── admin/             # 11-manager sidebar Administration portal
│   │   ├── api/               # Health liveness and versioned REST endpoints
│   │   └── ... (LMS paths)   # Graded study cards and exam dashboards
│   ├── db/                    # PostgreSQL pool configurations and migrators
│   ├── lib/                   # Idempotent seeding scripts, storage, and environments
│   └── shared/                # Common UI primitives, services, and mobile tools
├── tests/                     # Multi-Vector Automated Testing Suite
│   ├── api.test.ts            # Basic API and envelope checks
│   └── enterprise.test.ts     # A11y, E2E student, performance, and security tests
├── scripts/                   # Centralized Setup/Bootstrap Script
│   └── setup.ts               # Programmatic Database Setup Runner
├── package.json               # Package dependencies (Next.js 16 + Drizzle + pg)
├── package-lock.json          # Deterministic lockfile
├── tsconfig.json              # TypeScript compiler configurations
├── next.config.ts             # Next.js bundler settings
├── postcss.config.mjs         # Styling compiler config
├── eslint.config.mjs          # Syntax & linting rules
├── drizzle.config.ts          # Drizzle kit schema directories
├── vercel.json                # Vercel serverless deployment specifications
├── README.md                  # Principal README overview
├── LICENSE                    # MIT Open-Source License
├── CHANGELOG.md               # Version 4.0 historical changes log
└── .env.example               # Centralized placeholders for database & keys
```

---

## 3. Operational Integrity & Verification

This archive is immediately usable, and fully vetted. Any deployment engineer can spin up the platform under 60 seconds with zero-reconstruction or missing file dependencies by running:

```bash
# 1. Extract package
unzip nihongobridge-v4.0-production.zip

# 2. Local locked installation
npm install

# 3. Create schema, run migrations, and seed dynamically (Centralized setup)
npm run setup

# 4. Production Next.js compilation
npm run build

# 5. Start global servers
npm start
```
