CREATE TABLE `notification_deliveries` (
  `id` VARCHAR(191) NOT NULL,
  `issuance_id` VARCHAR(191) NOT NULL,
  `type` ENUM('BADGE_ISSUED', 'BADGE_REVOKED') NOT NULL,
  `status` ENUM('PENDING', 'PROCESSING', 'RETRY_SCHEDULED', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `recipient_email` VARCHAR(191) NOT NULL,
  `recipient_first_name` VARCHAR(191) NOT NULL,
  `badge_name` VARCHAR(191) NOT NULL,
  `issuer_name` VARCHAR(191) NOT NULL,
  `verification_url` VARCHAR(2048) NOT NULL,
  `support_contact` VARCHAR(2048) NULL,
  `occurred_at` DATETIME(3) NOT NULL,
  `attempt_count` INTEGER NOT NULL DEFAULT 0,
  `next_attempt_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `claim_token` VARCHAR(191) NULL,
  `claim_expires_at` DATETIME(3) NULL,
  `last_error_category` VARCHAR(50) NULL,
  `safe_diagnostic_code` VARCHAR(100) NULL,
  `provider_message_id` VARCHAR(191) NULL,
  `sent_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `notification_deliveries_issuance_id_type_key`(`issuance_id`, `type`),
  INDEX `notification_deliveries_status_next_attempt_at_idx`(`status`, `next_attempt_at`),
  INDEX `notification_deliveries_claim_expires_at_idx`(`claim_expires_at`),
  INDEX `notification_deliveries_created_at_idx`(`created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `notification_deliveries`
  ADD CONSTRAINT `notification_deliveries_issuance_id_fkey`
  FOREIGN KEY (`issuance_id`) REFERENCES `badge_issuances`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
