-- @reversible: no
-- @reason: irreversible data migration
--
-- 0002 gave every existing user a profile and a preferences row. Those rows
-- have since been editable: a learner may have set a timezone, a JLPT target,
-- or a study goal.
--
-- A mechanical rollback would have to delete them, which would destroy
-- learner-entered data that the forward migration never created. There is no
-- way to distinguish "row we backfilled and nobody touched" from "row we
-- backfilled and the learner then configured" without an audit trail we do
-- not keep for this table.
--
-- Declaring this honestly is the correct answer. Rolling back past 0002
-- requires rolling back 0001, which drops the tables outright — a decision an
-- operator must make deliberately, not one a script should make for them.
--
-- The runner refuses to execute this file. Nothing below runs.

SELECT 1;
