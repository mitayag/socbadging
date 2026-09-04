CREATE TABLE `badge_issuances` (
  `id` VARCHAR(191) NOT NULL,
  `public_id` VARCHAR(191) NOT NULL,
  `class_id` VARCHAR(191) NOT NULL,
  `badge_template_id` VARCHAR(191) NOT NULL,
  `student_id` VARCHAR(191) NOT NULL,
  `issuer_user_id` VARCHAR(191) NOT NULL,
  `status` ENUM('ACTIVE', 'REVOKED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
  `issued_at` DATETIME(3) NOT NULL,
  `expires_at` DATETIME(3) NULL,
  `recipient_snapshot_json` JSON NOT NULL,
  `achievement_snapshot_json` JSON NOT NULL,
  `issuer_snapshot_json` JSON NOT NULL,
  `credential_json` JSON NOT NULL,
  `snapshot_version` INTEGER NOT NULL DEFAULT 1,
  `revocation_reason` TEXT NULL,
  `revoked_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `badge_issuances_public_id_key`(`public_id`),
  UNIQUE INDEX `badge_issuances_class_id_badge_template_id_student_id_key`(`class_id`, `badge_template_id`, `student_id`),
  INDEX `badge_issuances_class_id_issued_at_idx`(`class_id`, `issued_at`),
  INDEX `badge_issuances_issuer_user_id_issued_at_idx`(`issuer_user_id`, `issued_at`),
  INDEX `badge_issuances_status_issued_at_idx`(`status`, `issued_at`),
  INDEX `badge_issuances_badge_template_id_idx`(`badge_template_id`),
  INDEX `badge_issuances_student_id_idx`(`student_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `badge_issuances`
  ADD CONSTRAINT `badge_issuances_class_id_fkey`
    FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `badge_issuances_badge_template_id_fkey`
    FOREIGN KEY (`badge_template_id`) REFERENCES `badge_templates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `badge_issuances_student_id_fkey`
    FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `badge_issuances_issuer_user_id_fkey`
    FOREIGN KEY (`issuer_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
