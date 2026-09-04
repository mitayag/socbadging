CREATE TABLE `operational_heartbeats` (
  `id` VARCHAR(64) NOT NULL,
  `mail_status` VARCHAR(16) NOT NULL,
  `recorded_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `operational_heartbeats_recorded_at_idx` (`recorded_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
