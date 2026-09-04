CREATE TABLE `issuance_batches` (
  `id` VARCHAR(191) NOT NULL,
  `class_id` VARCHAR(191) NOT NULL,
  `badge_template_id` VARCHAR(191) NOT NULL,
  `faculty_user_id` VARCHAR(191) NOT NULL,
  `source_filename` VARCHAR(255) NOT NULL,
  `mapping_json` JSON NOT NULL,
  `rows_json` JSON NOT NULL,
  `preview_fingerprint` VARCHAR(64) NOT NULL,
  `total_rows` INTEGER NOT NULL,
  `ready_count` INTEGER NOT NULL DEFAULT 0,
  `already_issued_count` INTEGER NOT NULL DEFAULT 0,
  `invalid_count` INTEGER NOT NULL DEFAULT 0,
  `issued_count` INTEGER NOT NULL DEFAULT 0,
  `status` ENUM('READY', 'COMMITTED', 'EXPIRED') NOT NULL DEFAULT 'READY',
  `expires_at` DATETIME(3) NOT NULL,
  `committed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `issuance_batches_faculty_user_id_class_id_status_created_at_idx`(`faculty_user_id`, `class_id`, `status`, `created_at`),
  INDEX `issuance_batches_expires_at_idx`(`expires_at`),
  INDEX `issuance_batches_preview_fingerprint_idx`(`preview_fingerprint`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `issuance_batches`
  ADD CONSTRAINT `issuance_batches_class_id_fkey`
    FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `issuance_batches_badge_template_id_fkey`
    FOREIGN KEY (`badge_template_id`) REFERENCES `badge_templates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `issuance_batches_faculty_user_id_fkey`
    FOREIGN KEY (`faculty_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
