-- @reversible: yes
-- @drops-data: knowledge tables (re-importable from source via ETL)
--
-- Rollback of 0003. Drops the knowledge domain in reverse dependency order:
-- children before parents, so no foreign key blocks the drop.
--
-- Data loss here is recoverable by construction. Every knowledge row carries
-- source and provenance columns, so the content can be re-imported from the
-- upstream dataset. That is precisely why provenance is mandatory.
--
-- pg_trgm is deliberately NOT dropped. Extensions are shared database-level
-- objects; another schema or a future migration may depend on it, and
-- dropping it would cascade into objects this migration never created.

DROP TABLE IF EXISTS "conjugations";--> statement-breakpoint
DROP TABLE IF EXISTS "kanji_components";--> statement-breakpoint
DROP TABLE IF EXISTS "kanji_readings";--> statement-breakpoint
DROP TABLE IF EXISTS "dictionary_senses";--> statement-breakpoint
DROP TABLE IF EXISTS "dictionary_readings";--> statement-breakpoint
DROP TABLE IF EXISTS "sentences";--> statement-breakpoint
DROP TABLE IF EXISTS "grammar_patterns";--> statement-breakpoint
DROP TABLE IF EXISTS "kanji_entries";--> statement-breakpoint
DROP TABLE IF EXISTS "dictionary_entries";--> statement-breakpoint
DROP TABLE IF EXISTS "radicals";--> statement-breakpoint
DROP TABLE IF EXISTS "knowledge_provenance";--> statement-breakpoint
DROP TABLE IF EXISTS "knowledge_sources";--> statement-breakpoint

DROP TYPE IF EXISTS "public"."tense";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."polarity";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."politeness";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."word_class";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."grammar_register";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."kanji_component_position";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."kanji_reading_kind";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."dictionary_form_kind";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."provenance_status";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."knowledge_source_status";
