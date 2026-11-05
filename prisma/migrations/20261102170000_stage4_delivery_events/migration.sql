ALTER TABLE `notification_deliveries`
  ADD COLUMN `smtp_accepted_at` DATETIME(3) NULL,
  ADD COLUMN `provider_status` ENUM('ACCEPTED', 'DELIVERED', 'DEFERRED', 'BOUNCED', 'BLOCKED', 'INVALID', 'COMPLAINT') NULL,
  ADD COLUMN `provider_status_at` DATETIME(3) NULL;

CREATE INDEX `notification_deliveries_provider_status_at_idx`
  ON `notification_deliveries`(`provider_status`, `provider_status_at`);

CREATE TABLE `notification_delivery_attempts` (
  `id` VARCHAR(191) NOT NULL,
  `notification_delivery_id` VARCHAR(191) NOT NULL,
  `attempt_number` INT NOT NULL,
  `delivery_channel` VARCHAR(20) NOT NULL,
  `outcome` ENUM('STARTED', 'ACCEPTED', 'REJECTED', 'OUTCOME_UNKNOWN') NOT NULL DEFAULT 'STARTED',
  `provider_message_id` VARCHAR(191) NULL,
  `safe_diagnostic_code` VARCHAR(100) NULL,
  `error_category` VARCHAR(50) NULL,
  `started_at` DATETIME(3) NOT NULL,
  `completed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `notification_delivery_attempts_delivery_attempt_key`(`notification_delivery_id`, `attempt_number`),
  INDEX `notification_delivery_attempts_outcome_started_idx`(`outcome`, `started_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `notification_delivery_attempts`
  ADD CONSTRAINT `notification_delivery_attempts_notification_delivery_id_fkey`
  FOREIGN KEY (`notification_delivery_id`) REFERENCES `notification_deliveries`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `notification_delivery_events` (
  `id` VARCHAR(191) NOT NULL,
  `notification_delivery_id` VARCHAR(191) NULL,
  `provider_event_id` VARCHAR(191) NOT NULL,
  `source` ENUM('WORKER', 'WEBHOOK', 'ADMIN') NOT NULL DEFAULT 'WEBHOOK',
  `event_type` ENUM('SMTP_ACCEPTED', 'SMTP_REJECTED', 'SMTP_OUTCOME_UNKNOWN', 'DELIVERED', 'DEFERRED', 'BOUNCED', 'BLOCKED', 'INVALID', 'COMPLAINT') NOT NULL,
  `provider_status` ENUM('ACCEPTED', 'DELIVERED', 'DEFERRED', 'BOUNCED', 'BLOCKED', 'INVALID', 'COMPLAINT') NULL,
  `provider_message_id` VARCHAR(191) NULL,
  `recipient_email` VARCHAR(191) NULL,
  `occurred_at` DATETIME(3) NOT NULL,
  `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `payload_hash` CHAR(64) NOT NULL,
  `applied` BOOLEAN NOT NULL DEFAULT false,
  `metadata_json` JSON NULL,
  UNIQUE INDEX `notification_delivery_events_provider_event_id_key`(`provider_event_id`),
  INDEX `notification_delivery_events_delivery_occurred_idx`(`notification_delivery_id`, `occurred_at`),
  INDEX `notification_delivery_events_provider_message_idx`(`provider_message_id`),
  INDEX `notification_delivery_events_type_occurred_idx`(`event_type`, `occurred_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `notification_delivery_events`
  ADD CONSTRAINT `notification_delivery_events_notification_delivery_id_fkey`
  FOREIGN KEY (`notification_delivery_id`) REFERENCES `notification_deliveries`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
