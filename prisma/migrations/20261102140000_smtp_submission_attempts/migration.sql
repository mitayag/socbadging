CREATE TABLE `smtp_submission_attempts` (
  `id` VARCHAR(191) NOT NULL,
  `notification_delivery_id` VARCHAR(191) NOT NULL,
  `delivery_channel` VARCHAR(20) NOT NULL,
  `recipient` VARCHAR(191) NOT NULL,
  `acceptance_key` VARCHAR(100) NULL,
  `attempt_token` VARCHAR(191) NULL,
  `submission_state` ENUM('NOT_STARTED', 'SUBMISSION_RESERVED', 'ACCEPTED', 'REJECTED', 'OUTCOME_UNKNOWN') NOT NULL DEFAULT 'NOT_STARTED',
  `submission_started_at` DATETIME(3) NULL,
  `smtp_completed_at` DATETIME(3) NULL,
  `provider_message_id` VARCHAR(191) NULL,
  `last_error_code` VARCHAR(100) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `smtp_submission_attempts_notification_delivery_id_key`(`notification_delivery_id`),
  UNIQUE INDEX `smtp_submission_attempts_acceptance_key_key`(`acceptance_key`),
  UNIQUE INDEX `smtp_submission_attempts_attempt_token_key`(`attempt_token`),
  INDEX `smtp_submission_attempts_submission_state_idx`(`submission_state`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `smtp_submission_attempts`
  ADD CONSTRAINT `smtp_submission_attempts_notification_delivery_id_fkey`
  FOREIGN KEY (`notification_delivery_id`) REFERENCES `notification_deliveries`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
