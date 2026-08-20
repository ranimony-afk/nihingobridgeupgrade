-- Phase 16. Indexes only: no table or column is altered.
--
-- PostgreSQL indexes a primary key automatically but NOT a foreign key. Every
-- one of these columns is filtered or joined on in a hot path, so without an
-- index each lookup is a sequential scan that degrades as the table grows.

-- LMS hot paths
CREATE INDEX IF NOT EXISTS idx_daily_xp_learner_date ON daily_xp (learner_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_xp_date ON daily_xp (date);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_learner ON lesson_progress (learner_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_lesson ON lesson_progress (lesson_id);
CREATE INDEX IF NOT EXISTS idx_exercises_lesson ON exercises (lesson_id);
CREATE INDEX IF NOT EXISTS idx_review_cards_learner_due ON review_cards (learner_id, due_at);
CREATE INDEX IF NOT EXISTS idx_learners_bot ON learners (is_bot);

-- Identity
CREATE INDEX IF NOT EXISTS idx_identity_users_learner ON identity_users (learner_id);
CREATE INDEX IF NOT EXISTS idx_identity_users_institution ON identity_users (institution_id);
CREATE INDEX IF NOT EXISTS idx_identity_accounts_user ON identity_accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_identity_refresh_user ON identity_refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_identity_challenges_user ON identity_challenges (user_id);

-- Billing: analytics groups by these constantly
CREATE INDEX IF NOT EXISTS idx_billing_subs_user ON billing_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_billing_subs_plan ON billing_subscriptions (plan_id);
CREATE INDEX IF NOT EXISTS idx_billing_subs_status ON billing_subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_user ON billing_invoices (user_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_created ON billing_invoices (created_at);
CREATE INDEX IF NOT EXISTS idx_billing_invoice_lines_invoice ON billing_invoice_lines (invoice_id);
CREATE INDEX IF NOT EXISTS idx_billing_checkouts_user ON billing_checkouts (user_id);
CREATE INDEX IF NOT EXISTS idx_billing_commissions_affiliate ON billing_commissions (affiliate_id);

-- Knowledge graph joins
CREATE INDEX IF NOT EXISTS idx_kg_senses_lexeme ON kg_senses (lexeme_id);
CREATE INDEX IF NOT EXISTS idx_kg_glosses_sense ON kg_glosses (sense_id);
CREATE INDEX IF NOT EXISTS idx_kg_conjugations_lexeme ON kg_conjugations (lexeme_id);
CREATE INDEX IF NOT EXISTS idx_kg_forms_lexeme ON kg_forms (lexeme_id);
CREATE INDEX IF NOT EXISTS idx_kg_kanji_readings_kanji ON kg_kanji_readings (kanji_id);
CREATE INDEX IF NOT EXISTS idx_kg_strokes_kanji ON kg_strokes (kanji_id);
CREATE INDEX IF NOT EXISTS idx_kg_grammar_examples_grammar ON kg_grammar_examples (grammar_id);
CREATE INDEX IF NOT EXISTS idx_kg_frequency_target ON kg_frequency (target_id);
CREATE INDEX IF NOT EXISTS idx_kg_lexemes_jlpt ON kg_lexemes (jlpt);

-- Analytics + CMS
CREATE INDEX IF NOT EXISTS idx_analytics_events_name ON analytics_events (name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events (created_at);
CREATE INDEX IF NOT EXISTS idx_tutor_messages_session ON tutor_messages (session_id);
CREATE INDEX IF NOT EXISTS idx_cms_posts_status_updated ON cms_posts (status, updated_at DESC);
