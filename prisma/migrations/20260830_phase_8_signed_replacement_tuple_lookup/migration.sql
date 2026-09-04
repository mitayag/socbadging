-- A signed replacement is a distinct historical credential for the same source tuple.
-- Replacement linkage, rather than source tuple uniqueness, provides idempotency.
ALTER TABLE `badge_issuances`
  DROP INDEX `badge_issuances_class_id_badge_template_id_student_id_key`,
  ADD INDEX `badge_issuances_class_id_badge_template_id_student_id_idx` (`class_id`, `badge_template_id`, `student_id`);
