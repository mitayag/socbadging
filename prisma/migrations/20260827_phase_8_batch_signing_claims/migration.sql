ALTER TABLE `issuance_batches`
  MODIFY `status` ENUM('READY', 'SIGNING', 'COMMITTED', 'EXPIRED') NOT NULL DEFAULT 'READY',
  ADD COLUMN `signing_claim_token` CHAR(36) NULL,
  ADD COLUMN `signing_claim_version` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `signing_claim_expires_at` DATETIME(3) NULL,
  ADD INDEX `issuance_batches_signing_claim_expires_at_idx`(`signing_claim_expires_at`);

CREATE TABLE `issuance_tuple_reservations` (
  `id` VARCHAR(191) NOT NULL,
  `class_id` VARCHAR(191) NOT NULL,
  `badge_template_id` VARCHAR(191) NOT NULL,
  `student_id` VARCHAR(191) NOT NULL,
  `faculty_user_id` VARCHAR(191) NOT NULL,
  `claim_token` CHAR(36) NOT NULL,
  `batch_id` VARCHAR(191) NULL,
  `batch_preview_fingerprint` VARCHAR(64) NULL,
  `batch_claim_version` INTEGER NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `issuance_tuple_reservations_tuple_key`
    (`class_id`, `badge_template_id`, `student_id`),
  UNIQUE INDEX `issuance_tuple_reservations_batch_student_key`(`batch_id`, `student_id`),
  INDEX `issuance_tuple_reservations_claim_token_idx`(`claim_token`),
  INDEX `issuance_tuple_reservations_expires_at_idx`(`expires_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `issuance_tuple_reservations_batch_id_fkey`
    FOREIGN KEY (`batch_id`) REFERENCES `issuance_batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
