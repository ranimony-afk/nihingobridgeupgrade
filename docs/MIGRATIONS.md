# Database Migration & Schema Evolution Runbook

**Document Version:** 4.0.0  
**ORM:** Drizzle ORM  

---

## 1. Schema Generation & Migrations

Our platform uses Drizzle-Kit and Node-PostgreSQL drivers to compile and apply schema changes programmatically:

1. **Modify Schema declarations**
   - If adding columns, modify `src/db/schema.ts` additively.
2. **Compile SQL Migration Files**
   - Run the compiler script:
     ```bash
     npm run db:generate
     ```
   - This generates a clean SQL snapshot script inside the `/drizzle` folder.

*(Expected Migration Generation Screenshot Placeholder: [drizzle_kit_generate_successful_logs.png])*

---

## 2. Applying Migrations

### 2.1 Programmatic Execution (Recommended)
Our custom migration script `src/db/migrate.ts` connects programmatically and applies SQL files safely to your database:
```bash
npm run db:migrate
```

### 2.2 CLI Direct Push (Prototyping)
To push changes directly without compiling migrations files, run the CLI pusher:
```bash
npm run db:push
```

### 2.3 Studio Inspector
To launch Drizzle's database viewer:
```bash
npm run db:studio
```
*(Expected Drizzle Studio Screenshot Placeholder: [drizzle_studio_tables_schema_viewer.png])*
