/** Full user-schema, catalog, ACL, sequence and row snapshot for isolated PGlite tests. */
import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";

export interface DatabaseSnapshot {
  schemas: unknown[];
  types: unknown[];
  extensions: unknown[];
  catalog: unknown[];
  columns: unknown[];
  constraints: unknown[];
  indexes: unknown[];
  triggers: unknown[];
  policies: unknown[];
  functions: unknown[];
  rows: Record<string, string[]>;
  sequences: Record<string, unknown[]>;
}

const quote = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;
export const fingerprint = (snapshot: DatabaseSnapshot) =>
  createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");

export async function snapshotDatabase(database: PGlite): Promise<DatabaseSnapshot> {
  const schemas = (await database.query(`
    SELECT nspname, pg_get_userbyid(nspowner) AS owner, nspacl::text AS privileges,
           obj_description(oid, 'pg_namespace') AS comment
    FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'
    ORDER BY 1
  `)).rows;
  const types = (await database.query(`
    SELECT n.nspname AS schema_name, t.typname, t.typtype::text AS kind,
           t.typnotnull, t.typacl::text AS privileges,
           ARRAY(SELECT e.enumlabel::text FROM pg_enum e WHERE e.enumtypid = t.oid
                 ORDER BY e.enumsortorder) AS enum_values
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
    ORDER BY 1, 2
  `)).rows;
  const extensions = (await database.query(`
    SELECT e.extname, e.extversion, n.nspname AS schema_name
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
    ORDER BY 1
  `)).rows;
  const catalog = (await database.query<{
    schema_name: string;
    relation_name: string;
    kind: string;
    persistence: string;
    view_definition: string | null;
  }>(`
    SELECT n.nspname AS schema_name, c.relname AS relation_name,
           c.relkind::text AS kind, c.relpersistence::text AS persistence,
           pg_get_userbyid(c.relowner) AS owner, c.relacl::text AS privileges,
           obj_description(c.oid, 'pg_class') AS comment,
           CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid) ELSE NULL END AS view_definition
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
      AND c.relkind IN ('r','p','v','m','S','i','f')
    ORDER BY 1, 2, 3
  `)).rows;
  const columns = (await database.query(`
    SELECT n.nspname AS schema_name, c.relname AS relation_name, a.attnum,
           a.attname, format_type(a.atttypid, a.atttypmod) AS type,
           a.attnotnull, a.attidentity, pg_get_expr(d.adbin, d.adrelid) AS default_expression,
           col_description(c.oid, a.attnum) AS comment
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
      AND c.relkind IN ('r','p','v','m','f') AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY 1, 2, 3
  `)).rows;
  const constraints = (await database.query(`
    SELECT n.nspname AS schema_name, c.relname AS relation_name,
           x.conname, pg_get_constraintdef(x.oid) AS definition, x.convalidated
    FROM pg_constraint x JOIN pg_class c ON c.oid = x.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
    ORDER BY 1, 2, 3
  `)).rows;
  const indexes = (await database.query(`
    SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes
    WHERE schemaname NOT LIKE 'pg_%' AND schemaname <> 'information_schema'
    ORDER BY 1, 2, 3
  `)).rows;
  const triggers = (await database.query(`
    SELECT n.nspname AS schema_name, c.relname AS relation_name,
           t.tgname, pg_get_triggerdef(t.oid) AS definition, t.tgenabled
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
    ORDER BY 1, 2, 3
  `)).rows;
  const policies = (await database.query(`
    SELECT n.nspname AS schema_name, c.relname AS relation_name, p.polname,
           p.polcmd::text, p.polpermissive, pg_get_expr(p.polqual, p.polrelid) AS using_expression,
           pg_get_expr(p.polwithcheck, p.polrelid) AS check_expression
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
    ORDER BY 1, 2, 3
  `)).rows;
  const functions = (await database.query(`
    SELECT n.nspname AS schema_name, p.proname,
           pg_get_function_identity_arguments(p.oid) AS arguments,
           pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' AND p.prokind IN ('f', 'p')
    ORDER BY 1, 2, 3
  `)).rows;
  const rows: Record<string, string[]> = {};
  const sequences: Record<string, unknown[]> = {};
  for (const relation of catalog) {
    const name = `${relation.schema_name}.${relation.relation_name}`;
    const table = `${quote(relation.schema_name)}.${quote(relation.relation_name)}`;
    if (relation.kind === "r" || relation.kind === "p") {
      rows[name] = (await database.query<{ row: string }>(
        `SELECT to_jsonb(t)::text AS row FROM ${table} AS t ORDER BY 1`
      )).rows.map((item) => item.row);
    } else if (relation.kind === "S") {
      sequences[name] = (await database.query(`SELECT * FROM ${table}`)).rows;
    }
  }
  return { schemas, types, extensions, catalog, columns, constraints, indexes, triggers, policies, functions, rows, sequences };
}
